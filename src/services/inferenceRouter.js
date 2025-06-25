/**
 * Inference Router
 *
 * Determines where to send an inference request based on the model ID.
 * Validates context window limits and handles message history truncation.
 * Routes to appropriate endpoints (vLLM service or external API provider).
 * Includes optional history summarization based on user settings.
 */

// Polyfill for fetch: use global fetch if available (Node 18+), otherwise fallback to node-fetch v2
let fetchApi;
if (typeof global.fetch === 'function') {
  fetchApi = global.fetch.bind(global);
} else {
  try {
    // Ensure you have node-fetch v2 installed: npm install node-fetch@2
    fetchApi = require('node-fetch');
  } catch (err) {
    console.error('Fetch API is unavailable. Please upgrade Node.js to >=18 or install node-fetch@2.');
    throw err;
  }
}

const vllmService = require('./vllmService');
const Model = require('../models/Model');
const User = require('../models/User');
const { handleExternalApiRequest } = require('./providers/handler');
const {
  formatPromptForModel,
  validateContextForModel,
  truncateHistoryForModel,
} = require('../models/prompting');
const { createParser } = require('eventsource-parser');
const eventBus = require('../utils/eventBus');

const activeRequests = new Map();

/**
 * Validates and fixes message sequence to ensure vLLM compatibility
 * vLLM (especially Gemma) requires clean alternating user/assistant roles
 * This function separates system messages and ensures perfect alternation
 */
function validateAndFixMessageSequence(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }
  
  // Separate system messages and conversation messages
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  
  // Build clean alternating sequence
  const fixed = [];
  
  // Add system messages at the beginning (combine them)
  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages.map(m => m.content).join('\n');
    fixed.push({ role: 'system', content: combinedSystemContent });
  }
  
  // Now build perfect alternation from conversation messages
  let expectedNextRole = 'user';
  
  for (let i = 0; i < conversationMessages.length; i++) {
    const msg = conversationMessages[i];
    
    // If we get the wrong role, inject a placeholder
    if (msg.role !== expectedNextRole) {
      const placeholderContent = expectedNextRole === 'user'
        ? '[User input missing]'
        : ' ';
      fixed.push({ role: expectedNextRole, content: placeholderContent });
      expectedNextRole = expectedNextRole === 'user' ? 'assistant' : 'user';
    }
    
    // Add the actual message
    fixed.push(msg);
    expectedNextRole = msg.role === 'user' ? 'assistant' : 'user';
  }
  
  return fixed;
}

// --- Constants ---
const CONTEXT_WARNING_THRESHOLD_PERCENT = 85;
const SUMMARIZATION_THRESHOLD_PERCENT = 90;
const SUMMARIZATION_PROMPT =
  "Concisely summarize the key points, decisions, and unanswered questions from the following conversation excerpt, focusing on information relevant for continuing the chat. Output only the summary text:\n\n";
const TURNS_TO_KEEP_AFTER_SUMMARY = 3;

/**
 * Summarize history helper (internal)
 */
async function _summarizeHistory(originalMessages, userSettings, currentModelId) {
  try {
    let summarizationModelId = null;
    let summarizationModel = null;
    const currentModel = await Model.findById(currentModelId);

    if (!currentModel) {
      console.error(`[Router Summarize] Model ${currentModelId} not found.`);
      return null;
    }

    // Only local models can summarize
    if (!currentModel.external_provider_id) {
      if (vllmService.activeModelId === currentModelId) {
        summarizationModelId = currentModelId;
        summarizationModel = currentModel;
      } else {
        console.error(
          `[Router Summarize] Local model ${currentModelId} is not active.`
        );
        return null;
      }
    } else {
      const userSelectedLocalModelId = userSettings.summarization_model_id;
      if (userSelectedLocalModelId) {
        const userModel = await Model.findById(userSelectedLocalModelId);
        if (
          userModel &&
          !userModel.external_provider_id &&
          vllmService.activeModelId === userSelectedLocalModelId
        ) {
          summarizationModelId = userSelectedLocalModelId;
          summarizationModel = userModel;
        } else return null;
      } else return null;
    }

    if (!summarizationModel) {
      console.error(
        '[Router Summarize] No valid local model available for summarization.'
      );
      return null;
    }

    // Determine temperature
    let temperature = 0.4;
    switch (userSettings.summarization_temperature_preset) {
      case 'strict':
        temperature = 0.1;
        break;
      case 'balanced':
        temperature = 0.4;
        break;
      case 'detailed':
        temperature = 0.7;
        break;
    }

    // Identify chat messages to summarize (exclude recent)
    const lastCheckpointIndex = originalMessages
      .map(m => m.role === 'system' && m.content?.startsWith('Summary of conversation up to this point'))
      .lastIndexOf(true);
    const relevant =
      lastCheckpointIndex >= 0
        ? originalMessages.slice(lastCheckpointIndex + 1)
        : originalMessages;

    const chatMsgs = relevant.filter(m => m.role !== 'system');
    const keepCount = TURNS_TO_KEEP_AFTER_SUMMARY * 2;

    if (chatMsgs.length <= keepCount) {
      return null;
    }

    const toSummarize = chatMsgs.slice(0, -keepCount);
    const toKeep = chatMsgs.slice(-keepCount);

    const excerpt = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = SUMMARIZATION_PROMPT + excerpt;
    const formatted = await formatPromptForModel(
      summarizationModelId,
      [{ role: 'user', content: prompt }]
    );

    const params = {
      temperature,
      max_tokens: Math.min(512, summarizationModel.n_ctx / 4),
      stop: ['\nUser:', '\nAssistant:', '<|endoftext|>'],
    };

    const url = `${vllmService.getVllmApiUrl()}/v1/chat/completions`;
    const res = await fetchApi(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: summarizationModel.name,
        messages: [{ role: 'user', content: formatted }],
        ...params,
        stream: false,
      }),
    });

    if (!res.ok) {
      console.error(
        `[Router Summarize] vLLM error ${res.status}: ${await res.text()}`
      );
      return null;
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content;
    if (!summary) return null;

    // Build new history
    const preservedSystem = originalMessages.filter(
      m => m.role === 'system' && !m.content?.startsWith('Summary of earlier')
    );
    const newHistory = [...preservedSystem];
    newHistory.push({
      role: 'system',
      content: `Summary of earlier conversation:\n${summary.trim()}`,
    });
    newHistory.push(...toKeep);

    return newHistory;
  } catch (err) {
    console.error('[Router Summarize] Error:', err);
    return null;
  }
}
// --- End Summarization Helper ---

/**
 * Routes an inference request to the appropriate handler after validating context size
 * and formatting the prompt.
 */
async function routeInferenceRequest(options) {
  const {
    modelId,
    messages,
    parameters,
    onToken,
    userId,
    files,
    streamingContext,
    autoTruncate = true,
  } = options;

  if (!modelId) throw new Error('modelId is required');
  if (!Array.isArray(messages) || messages.length === 0)
    throw new Error('messages array is required');

  try {
    const model = await Model.findById(modelId);
    if (!model) throw new Error(`Model ${modelId} not found.`);

    let processed = messages;

    // User-specific summarization
    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user?.summarization_enabled) {
          const check = await validateContextForModel(modelId, processed);
          if (
            check.contextSize &&
            check.estimatedTokens > (check.contextSize * SUMMARIZATION_THRESHOLD_PERCENT) / 100
          ) {
            const settings = {
              summarization_model_id: user.summarization_model_id,
              summarization_temperature_preset:
                user.summarization_temperature_preset,
              display_summarization_notice:
                user.display_summarization_notice ?? true,
            };
            const summarized = await _summarizeHistory(
              processed,
              settings,
              modelId
            );
            if (summarized) processed = summarized;
          }
        }
      } catch (e) {
        console.error('[Router] User settings fetch error:', e);
      }
    }

    // --- New Context Validation and Max Tokens Calculation ---
    let validation = await validateContextForModel(modelId, processed);

    // 1. Handle prompts that are too long
    if (validation.isTooLong) {
      if (autoTruncate) {
        console.log(`[InferenceRouter] History is too long (${validation.estimatedTokens} >= ${validation.contextSize}). Truncating...`);
        processed = await truncateHistoryForModel(modelId, processed);
        // Re-validate after truncation
        validation = await validateContextForModel(modelId, processed);
        if (validation.isTooLong) {
          // If it's still too long after truncation, something is wrong.
          throw new Error(`History still exceeds context window (${validation.estimatedTokens} >= ${validation.contextSize}) even after truncation.`);
        }
        console.log(`[InferenceRouter] History truncated. New token count: ${validation.estimatedTokens}`);
      } else {
        throw new Error(`History exceeds context window (${validation.estimatedTokens} >= ${validation.contextSize}) and auto-truncate is disabled.`);
      }
    }

    // --- End New Context Validation ---
    // max_tokens is intentionally removed to allow the model to determine the response length based on the prompt.
    delete parameters.max_tokens;

    // Prepare prompt for model
    let systemContent = null;
    const messagesForFmt = [];
    const sysIdx = processed.findIndex(m => m.role === 'system');
    if (sysIdx !== -1) {
      systemContent = processed[sysIdx].content;
      messagesForFmt.push(...processed.slice(0, sysIdx));
      messagesForFmt.push(...processed.slice(sysIdx + 1));
    } else messagesForFmt.push(...processed);

    const formatted = await formatPromptForModel(
      modelId,
      messagesForFmt,
      systemContent
    );

    // External vs local
    if (model.external_provider_id) {
      return handleExternalApiRequest({
        model,
        prompt: processed[processed.length - 1].content,
        parameters,
        onToken,
        previousMessages: processed.slice(0, -1),
        userId,
        files,
        streamingContext,
      });
    }

    // Local vLLM
    if (vllmService.activeModelId !== modelId)
      throw new Error(
        `Local model ${modelId} not active (active: ${vllmService.activeModelId}).`
      );

    const validatedSeq = validateAndFixMessageSequence(processed);

    // JSON generation tweak
    const lastUser = validatedSeq.filter(m => m.role === 'user').pop();
    const isJson =
      lastUser?.content.includes('JSON') &&
      /CRITICAL|json|response must be/.test(lastUser.content);

    let finalParams = { ...parameters };
    if (isJson) {
      console.log('[InferenceRouter] Applying JSON parameters');
      finalParams = {
        ...parameters,
        temperature: 0.3,
        repetition_penalty: 1.2,
        stop: [
          '<end_of_turn>',
          '<start_of_turn>',
          '\n\nUser:',
          '\n\nAssistant:',
          '</s>',
          '<|endoftext|>',
        ],
      };
    }

    const vllmPayload = {
      model: String(model.id),
      messages: validatedSeq,
      ...finalParams,
      stream: true,
    };

    // Handle streaming
    const controller = new AbortController();
    if (streamingContext?.messageId) {
      activeRequests.set(streamingContext.messageId, controller);
    }
    const vllmResponse = await streamVllmRequest(
      vllmPayload,
      onToken,
      streamingContext,
      controller.signal
    );

    try {
      // The actual stream processing is now handled within streamVllmRequest
      // which will call onToken directly. We await its final result.
      return await vllmResponse;
    } finally {
      if (streamingContext?.messageId) {
        activeRequests.delete(streamingContext.messageId);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
    throw err;
  }
}

/**
 * Handles the streaming HTTP request to the vLLM server and processes the SSE stream.
 */
async function streamVllmRequest(payload, onToken, streamingContext, signal) {
  const url = `${vllmService.getVllmApiUrl()}/v1/chat/completions`;
  const response = await fetchApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`vLLM API error (${response.status}): ${errBody}`);
  }

  // Return a promise that resolves with the final result of the stream
  return new Promise((resolve, reject) => {
    let fullContent = '';
    let usage = null;

    const onParse = (event) => {
      if (event.type === 'event') {
        if (event.data === '[DONE]') {
          // Stream finished
          return;
        }
        try {
          const json = JSON.parse(event.data);
          const token = json.choices?.[0]?.delta?.content || '';
          if (token) {
            fullContent += token;
            if (onToken) {
              onToken(token);
            }
          }
          // Check for final usage stats which vLLM sends in a separate chunk
          if (json.usage) {
            usage = json.usage;
          }
        } catch (e) {
          // Ignore parsing errors for non-JSON data that might appear
        }
      }
    };

    const parser = createParser(onParse);

    const decoder = new TextDecoder();
    
    const processStream = async () => {
      try {
        for await (const chunk of response.body) {
          if (signal?.aborted) {
            // Manually abort if the signal was triggered
            console.log('[streamVllmRequest] Stream processing aborted by signal.');
            // The rejection will be caught and handled as an abort.
            throw new Error('AbortError');
          }
          const chunkStr = decoder.decode(chunk, { stream: true });
          parser.feed(chunkStr);
        }
        // Stream finished normally
        parser.reset();
        resolve({ message: fullContent, usage });
      } catch (error) {
        if (error.name === 'AbortError') {
           console.log('[streamVllmRequest] Stream aborted.');
           resolve({ message: fullContent, usage, aborted: true });
        } else {
           console.error('[streamVllmRequest] Stream processing error:', error);
           reject(error);
        }
      }
    };
    
    processStream();

    if (signal) {
      signal.addEventListener('abort', () => {
        // The for-await loop will see the signal and throw an AbortError.
        // No need to destroy the stream directly here as it can cause race conditions.
      });
    }
  });
}

/**
 * Cancels an active inference request.
 */
function cancelInferenceRequest(requestId) {
  const controller = activeRequests.get(requestId);
  if (controller) {
    controller.abort();
    activeRequests.delete(requestId);
    return true;
  }
  return false;
}

module.exports = {
  routeInferenceRequest,
  cancelInferenceRequest,
};
