/**
 * internalApiController.js
 *
 * Handles internal API requests, e.g., from Python services.
 */
const Joi = require('joi');
const vllmService = require('../services/vllmService');
const { createChatCompletion } = require('../services/chatService'); // Assuming chatService is the right entry point
const Model = require('../models/Model');
const { formatOpenAIStreamChunk } = require('../utils/openaiFormatter'); // For SSE
const { approximateTokenCount } = require('../utils/tokenizer'); // For usage stats

// --- Input Validation Schema (similar to scalyticsApiController but for internal use) ---
const internalChatCompletionSchema = Joi.object({
  messages: Joi.array().min(1).items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system').required(),
      content: Joi.string().required().allow('') // Assuming simple string content for internal calls for now
    })
  ).required(),
  stream: Joi.boolean().optional().default(false), // Python side always sends true currently
  user_id: Joi.alternatives().try(Joi.string(), Joi.number()).required(), // User ID from Python service
  temperature: Joi.number().optional().min(0).max(2),
  max_tokens: Joi.number().integer().positive().optional(),
  top_p: Joi.number().optional().min(0).max(1),
  // Add other parameters if llm_reasoning.py sends them and chatService/inferenceRouter supports them
});

/**
 * Handles POST /api/internal/v1/local_completion requests
 * Intended for calls from internal services like the Python llm_reasoning.py.
 */
exports.handleInternalLocalCompletion = async (req, res) => {
  // 1. Check if request is from localhost
  const requestIp = req.ip || req.connection.remoteAddress;
  const isLocalhost = requestIp === '127.0.0.1' || requestIp === '::1' || requestIp === 'localhost' || requestIp === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    console.warn(`[InternalAPI] Forbidden request to /api/internal/v1/local_completion from non-localhost IP: ${requestIp}`);
    return res.status(403).json({ error: { message: 'Access forbidden.', type: 'forbidden_access' } });
  }

  // 2. Validate request body
  const { error, value } = internalChatCompletionSchema.validate(req.body);
  if (error) {
    console.warn('[InternalAPI] Validation Error:', error.details[0].message);
    return res.status(400).json({ error: { message: error.details[0].message, type: 'invalid_request_error', param: error.details[0].path.join('.') } });
  }

  const { messages, stream, user_id, ...inferenceParams } = value;
  const requestStartTime = Date.now();
  let modelForServiceCall;

  try {
    // 3. Determine active local model
    const activeModelId = vllmService.activeModelId;
    if (!activeModelId) {
      console.error("[InternalAPI] No active local model configured in vllmService.");
      return res.status(500).json({ error: { message: 'No active local model available.', type: 'api_error', code: 'no_active_local_model' } });
    }

    modelForServiceCall = await Model.findById(activeModelId);
    if (!modelForServiceCall) {
      console.error(`[InternalAPI] Active local model ID ${activeModelId} not found in database.`);
      return res.status(500).json({ error: { message: `Active local model (ID: ${activeModelId}) not found.`, type: 'api_error', code: 'active_model_not_found' } });
    }
    
    const modelNameForLog = modelForServiceCall.name || `model_id_${activeModelId}`;
    console.log(`[InternalAPI] Request for user ${user_id} using active local model: ${modelNameForLog}`);

    // Prepare options for chatService.createChatCompletion
    // The Python side currently sends a simple messages array (e.g., [{"role": "user", "content": prompt}])
    // and expects the Node.js side to handle it.
    // `content` for createChatCompletion is the latest user message, `previousMessages` is history.
    // If Python sends a single user message, `previousMessages` is empty, `content` is that message.
    // If Python sends history + user message, adapt accordingly.
    // For now, assume Python sends messages where the last one is the current "prompt".
    
    let chatServicePreviousMessages = [];
    let chatServiceContent = "";

    if (messages.length > 0) {
        chatServiceContent = messages[messages.length - 1].content; // Last message is the current prompt
        if (messages.length > 1) {
            chatServicePreviousMessages = messages.slice(0, -1);
        }
    } else {
        // Should be caught by Joi validation, but as a safeguard:
        return res.status(400).json({ error: { message: "Messages array cannot be empty.", type: 'invalid_request_error' } });
    }

    const serviceOptions = {
      userModel: modelForServiceCall, // The actual model object
      previousMessages: chatServicePreviousMessages,
      content: chatServiceContent,
      userId: user_id, // Pass user_id for logging, summarization settings, etc.
      files: [], // Assuming no files for this internal API for now
      temperature: inferenceParams.temperature,
      max_tokens: inferenceParams.max_tokens,
      top_p: inferenceParams.top_p,
      // frequency_penalty, presence_penalty could be added if needed
      disableDefaultSystemPrompt: true, // Important: Python side controls the full prompt
      // streamingContext and onToken are for WebSocket/UI streaming,
      // For SSE, we handle it directly here.
    };

    // 4. Handle Streaming (SSE) - Python side always requests stream: true
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let fullResponseContent = '';
      let inputTokens = approximateTokenCount(messages.map(m => m.content).join(' ')); // Approx
      let completionTokens = 0;
      let streamEnded = false;

      console.log(`[InternalAPI] Starting SSE stream for user ${user_id}`);

      const handleTokenCallback = (token) => {
        try {
          if (streamEnded) return;
          
          fullResponseContent += token;
          // Assuming modelForServiceCall.name is appropriate for OpenAI formatter
          const chunk = formatOpenAIStreamChunk(modelForServiceCall.name || 'local-model', token);
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } catch (streamWriteError) {
          console.error('[InternalAPI] Error writing to SSE stream:', streamWriteError);
          if (!res.writableEnded && !streamEnded) {
            streamEnded = true;
            try { res.end(); } catch (_) {}
          }
        }
      };

      const finishStream = (usage = null) => {
        if (streamEnded) return;
        streamEnded = true;

        try {
          // Calculate final usage
          if (usage) {
            inputTokens = usage.prompt_tokens || inputTokens;
            completionTokens = usage.completion_tokens || approximateTokenCount(fullResponseContent);
          } else {
            completionTokens = approximateTokenCount(fullResponseContent);
          }

          // Send final usage chunk
          const usageData = { prompt_tokens: inputTokens, completion_tokens: completionTokens, total_tokens: inputTokens + completionTokens };
          const usageChunk = formatOpenAIStreamChunk(modelForServiceCall.name || 'local-model', null, usageData);
          res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
          
          res.write(`data: [DONE]\n\n`);
          res.end();
        } catch (finishError) {
          console.error('[InternalAPI] Error finishing SSE stream:', finishError);
          if (!res.writableEnded) {
            try { res.end(); } catch (_) {}
          }
        }
      };

      const handleStreamError = (error) => {
        if (streamEnded) return;
        streamEnded = true;

        console.error(`[InternalAPI] Stream error:`, error);
        if (!res.writableEnded) {
          try { res.end(); } catch (_) {}
        }
      };
      
      // Set up request timeout
      const streamTimeout = setTimeout(() => {
        if (!streamEnded) {
          console.error(`[InternalAPI] Stream timeout after 4 minutes`);
          handleStreamError(new Error('Stream timeout'));
        }
      }, 240000); // 4 minutes

      // Modify createChatCompletion call to use the onToken callback for SSE
      serviceOptions.onToken = handleTokenCallback;

      try {
        console.log(`[InternalAPI] Calling createChatCompletion for streaming...`);
        const completionResult = await createChatCompletion(serviceOptions);
        
        clearTimeout(streamTimeout);
        console.log(`[InternalAPI] createChatCompletion completed. Result:`, completionResult ? Object.keys(completionResult) : 'null');
        
        // Handle completion
        finishStream(completionResult?.usage);

      } catch (serviceError) {
        clearTimeout(streamTimeout);
        console.error(`[InternalAPI] Error during createChatCompletion for stream:`, serviceError);
        handleStreamError(serviceError);
      }
    } else {
      // Non-streaming (Python side currently always sets stream: true, so this path might not be hit)
      // If it were to be used, it would be similar to scalyticsApiController's non-streaming path.
      console.warn("[InternalAPI] Non-streaming path hit, but Python client requests stream. This shouldn't happen with current Python code.");
      return res.status(501).json({ error: { message: 'Non-streaming not implemented for this internal endpoint currently.', type: 'not_implemented' } });
    }

  } catch (error) {
    console.error('[InternalAPI] Unexpected error in handleInternalLocalCompletion:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: 'An unexpected internal error occurred.', type: 'api_error' } });
    } else if (!res.writableEnded) {
      res.end(); // Try to close the stream if an error happens after headers sent
    }
  }
};
