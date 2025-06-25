/**
 * Streaming model provider implementation (Refactored for Inference Router)
 *
 * This module acts as an interface, routing streaming requests via the InferenceRouter
 * and handling WebSocket broadcasting via the event bus.
 *
 * Enhanced with response filtering, context window management, and markdown sanitization.
 */
const { tokenProcessor } = require('../../config/socketHandlers');
const { routeInferenceRequest } = require('../inferenceRouter');
const Model = require('../../models/Model');
const Message = require('../../models/Message'); // Import Message model for DB updates
const eventBus = require('../../utils/eventBus');
const { sanitizeResponseForModel } = require('../../models/prompting');

const codeBlockPattern = /```([a-z]*)\n([\s\S]*?)```/g;
const inlineCodePattern = /`([^`]+)`/g;
const unsafeTagPattern = /<(script|iframe|object|embed|form|input|button|a\s+href|on\w+)/gi;
const llmTagPatterns = [
  // Llama family tags
  /<\/?s>/g,
  /<<\/?SYS>>\s*/g,
  /\[\/?INST\]\s*/g,
  /<\|im_start\|>system\s*/g,
  /<\|im_start\|>user\s*/g,
  
  // Claude/Anthropic tags
  /Human:\s*/g,
  /Assistant:\s*/g,
  /\[END_OF_TURN\]/g,
  
  // Google/Gemini tags
  /<start_of_turn>/g,
  /<end_of_turn>/g,
  
  // Mistral tags
  /<\|end_of_text\|>/g,
  /<\|im_end\|>/g
];

/**
 * Sanitize markdown content for streaming
 * @param {string} content - Raw content potentially containing markdown
 * @returns {string} - Sanitized content
 */
function sanitizeMarkdown(content) {
  if (!content) return '';
  
  // Handle code blocks separately - preserve them but sanitize content inside
  let processedContent = content.replace(codeBlockPattern, (match, lang, code) => {
    const cleanCode = code.replace(unsafeTagPattern, "<$1");
    return "```" + lang + "\n" + cleanCode + "```";
  });
  
  // Handle inline code similarly
  processedContent = processedContent.replace(inlineCodePattern, (match, code) => {
    const cleanCode = code.replace(unsafeTagPattern, "<$1");
    return "`" + cleanCode + "`";
  });
  
  // Remove potentially unsafe HTML tags from regular text
  processedContent = processedContent.replace(unsafeTagPattern, "<$1");
  
  // Remove LLM-specific tags
  for (const pattern of llmTagPatterns) {
    processedContent = processedContent.replace(pattern, '');
  }
  
  return processedContent;
}

/**
 * Stream from an AI model (local or external) via the Inference Router.
 *
 * This enhanced version includes:
 * - Response filtering to remove garbage content
 * - Context window validation via inferenceRouter
 * - Early termination for invalid content
 * - Markdown sanitization during streaming
 *
 * @param {Object} options - Options for the model call
 * @param {number} options.modelId - ID of the target model
 * @param {Array<object>} options.messages - Message history array to send to the model
 * @param {Object} options.parameters - Additional parameters for the model (should include 'stop' array)
 * @param {Function} [options.onTokenCallback] - Optional callback for internal token handling
 * @param {Object} options.streaming - Streaming options for WebSocket
 * @param {string} options.streaming.chatId - ID of the chat for WebSocket streaming
 * @param {string} options.streaming.messageId - ID of the *placeholder* message for WebSocket streaming
 * @param {boolean} [options.autoFilter=true] - Whether to automatically filter response content
 * @param {string} [options.sanitizationMode='final'] - Controls token sanitization: 'none' (raw tokens), 'final' (only sanitize complete response), or 'full' (sanitize both)
 * @returns {Promise<Object>} - Resolves with final response details *after* stream completes/errors and DB is updated.
 */
exports.streamModel = (options) => { 
  const {
    modelId,
    messages,
    parameters = {}, // Includes stop sequences from chatService
    onTokenCallback = null,
    streaming = null,
    autoFilter = true,
    sanitizationMode = 'final' // New parameter with default value
  } = options;

  // Sanitization modes:
  // - 'none': No sanitization at any level - raw tokens and raw final content
  // - 'final': Only sanitize the final complete content, raw tokens during streaming (default)
  // - 'full': Sanitize both individual tokens and final content

  // Entry point for streaming
  const placeholderAssistantMessageId = streaming?.messageId;

  if (!modelId) throw new Error('streamModel requires a modelId.');
  if (!placeholderAssistantMessageId) throw new Error('streamModel requires streaming.messageId (placeholder ID).');

  // We return a Promise that the controller's .then/.catch will handle
  return new Promise(async (resolve, reject) => {
    let modelName = `Model ${modelId}`; // Default name
    let model = null; // Declare model outside the try block
    const startTime = Date.now();
    let finalMessageId = placeholderAssistantMessageId;
    let result = null;
    let finalUsage = null;
    let finalContent = ''; // Content for display/events (sanitized)
    let contentToSave = ''; // Content for DB (raw) - Will be built incrementally
    let streamError = null;
    let stopSequenceDetected = false;
    // Use stop sequences directly from parameters passed by chatService
    const stopSequences = Array.isArray(parameters?.stop) ? parameters.stop : [];

    let lastUserMessage = '';
    if (messages && messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessage = messages[i].content || '';
          break;
        }
      }
    }

    let bufferContent = '';

    const terminationPatterns = [
      // Llama patterns
      /<<SYS>>\[\/INST\]\s+Error: model is not defined/i,
      /<s>\s*\[\s*INST\s*\]/i, // Malformed instruction start
      /\[\s*\/\s*INST\s*\]\s*<\/s>/i, // Malformed instruction end
      /\]\s*\[\s*INST\s*\]/i, // Llama 3 bracket artifacts with instruction attempt
      /\]\s*<s>\s*\[/i, // Llama 3 bracket artifacts with BOS token
      
      // Common repetition patterns across models
      /(?:Please provide a valid instruction|I'm here to help|Let me know how I can assist).{0,100}(?:Please provide a valid instruction|I'm here to help|Let me know how I can assist).{0,100}(?:Please provide a valid instruction|I'm here to help|Let me know how I can assist)/i,
      
      // Mistral-specific patterns
      /\[INST\].*\[\/INST\].*\[INST\].*\[\/INST\]/i,
      /<\|im_start\|>.*<\|im_end\|>.*<\|im_start\|>/i,
      /<s>.*<\/s>.*<s>/i,
      /I apologize, but I cannot|I cannot continue this conversation/i,
      /Sorry, I experienced an unexpected error/i,
      /\[INST\]\s*\[\/INST\]/i, // Empty instruction blocks that should be filtered
      
      // Gemma-specific patterns
      /<start_of_turn>user.*?<end_of_turn>/is, // User turn in model output
      /<start_of_turn>model.*?<end_of_turn>.*?<start_of_turn>model/is, // Repeated model turns
      /<end_of_turn>\s*<start_of_turn>/i, // Direct turn transition without content
      
      // DeepSeek-specific patterns
      /<｜begin_of_text｜>/i, // Beginning of text token in the middle of a response
      /<｜end of sentence｜>.*?<｜end of sentence｜>/i, // Multiple end sentence tokens
      /<｜end of text｜>/i, // End of text token (should not appear in responses)
      /Human:.*?Human:/is, // Multiple Human: prefixes
      /Assistant:.*?Assistant:/is, // Multiple Assistant: prefixes
      /System:.*?System:/is, // System prefixes in outputs
      
      // Advanced repetition detection 
      /(\b\w{5,}\b)(?:\s+\w+){1,10}\s+\1(?:\s+\w+){1,10}\s+\1/i, // Word repetition pattern (catches loops)
      
      // Llama 3 specific bracket patterns
      /\]\s*\[\s*$/, // Closing bracket immediately followed by opening bracket at end of sequence
      /\][.!?]\s*\]/, // Multiple closing brackets after sentence ending punctuation
      /\]\s*\]\s*\]/, // Three or more closing brackets in a row
    ];

    // Define the token handler closure with enhanced sanitization
    const processToken = (rawToken) => {
      if (stopSequenceDetected) return;
      if (rawToken === null || rawToken === undefined) return;
      
      // Store the truly original token immediately and ensure it's a string
      const originalToken = rawToken; 
      if (originalToken !== null && originalToken !== undefined) {
        try {
          // Handle string, object or other types by explicitly converting to string
          let tokenStr = typeof originalToken === 'string' ? originalToken : JSON.stringify(originalToken);
          
          // If JSON stringified (common when coming from Python), parse it back to get actual content
          if (tokenStr.startsWith('"') && tokenStr.endsWith('"') && tokenStr.length > 2) {
            try {
              // This will handle proper unescaping of all escape sequences
              tokenStr = JSON.parse(tokenStr);
            } catch (e) {
              // If parsing fails (not actually JSON), just use the original but remove quotes
              tokenStr = tokenStr.slice(1, -1);
              
              // Manually unescape common escaped sequences
              tokenStr = tokenStr.replace(/\\n/g, '\n')
                               .replace(/\\r/g, '\r')
                               .replace(/\\t/g, '\t')
                               .replace(/\\"/g, '"')
                               .replace(/\\'/g, "'")
                               .replace(/\\\\/g, '\\');
            }
          }
          
          // Save the properly processed token
          contentToSave += tokenStr;
        } catch (tokenProcessingError) {
          console.error(`Token processing error: ${tokenProcessingError.message}`);
          // Fallback to basic string conversion in case of any error
          contentToSave += String(originalToken);
        }
      }

      bufferContent += originalToken;

      const maxBufferLength = Math.max(...stopSequences.map(s => s.length), 0) * 2 + 10;
      if (bufferContent.length > maxBufferLength) {
        bufferContent = bufferContent.substring(bufferContent.length - maxBufferLength);
      }

      // Stop Sequence Check
      if (stopSequences.length > 0) {
        for (const sequence of stopSequences) {
          if (sequence && bufferContent.endsWith(sequence)) {
            stopSequenceDetected = true;
            return;
          }
        }
      }

      // Proceed only if no stop sequence detected
      // --- TEMPORARILY DISABLED Termination Pattern Check ---
      // if (autoFilter) {
      //   if (terminationPatterns.some(pattern => pattern.test(bufferContent))) {
      //     console.warn(`[streamProvider] Detected invalid content pattern, terminating stream for ${placeholderAssistantMessageId}`);
      //     stopSequenceDetected = true;
      //     return;
      //   }
      // }
      // Re-enabled termination pattern check
      if (autoFilter) {
        if (terminationPatterns.some(pattern => pattern.test(bufferContent))) {
          console.warn(`[streamProvider] Detected invalid content pattern, terminating stream for ${placeholderAssistantMessageId}`);
          stopSequenceDetected = true;
          return; // Stop processing if termination pattern detected
        }
      }

      // Determine tokenToSend based on sanitizationMode
      let tokenToSend = rawToken;
      
      // Apply token-level sanitization only in 'full' mode
      if (autoFilter && sanitizationMode === 'full' && rawToken) {
        const sanitizedToken = sanitizeMarkdown(rawToken);
        tokenToSend = sanitizedToken || rawToken;
      }

      // In 'none' or 'final' mode, use raw tokens
      // Publish token to event bus
      if (streaming?.chatId) {
         eventBus.publish('chat:token', {
           chatId: streaming.chatId,
           messageId: placeholderAssistantMessageId,
           token: tokenToSend // Use the sanitized token if in 'full' mode
         });
      }

      if (typeof onTokenCallback === 'function') {
        onTokenCallback(rawToken);
      }
    };

    try {
      // Call the inference router, passing processToken as onToken
      result = await routeInferenceRequest({
        modelId,
        messages,
        parameters: parameters, // Pass the full parameters object
        onToken: processToken,
        userId: streaming?.userId,
        files: streaming?.files,
        streamingContext: streaming,
        autoTruncate: true
      });

      // Stream Completed Successfully or stopped early
      finalMessageId = result?.messageId || placeholderAssistantMessageId;
      finalUsage = result?.usage;
      // REMOVED: contentToSave = accumulatedTokens.join(''); (contentToSave is built incrementally now)

      // Explicitly create a separate variable for the final UI content *before* sanitization
      // Ensure it's a primitive copy if contentToSave somehow wasn't.
      let contentForUI = String(contentToSave); 

      // Apply model-specific sanitization based on sanitizationMode and autoFilter settings
      if (autoFilter && sanitizationMode !== 'none') {
         // Only sanitize final content if not in 'none' mode
         try {
            // Fetch model details *only if* needed for sanitization
            model = await Model.findById(modelId); // Fetch model details here
            if (model) {
               modelName = model.name; // Update modelName
               // Sanitize the separate variable for the UI
               contentForUI = await sanitizeResponseForModel(modelId, contentForUI, { lastUserMessage }); 
            } else {
               console.warn(`[streamProvider] Could not fetch model ${modelId} details for sanitization. Skipping.`);
               // contentForUI remains as contentToSave (implicitly, as it wasn't changed)
            }
         } catch (sanitizeModelFetchError) {
            console.error(`[streamProvider] Error fetching model ${modelId} for sanitization:`, sanitizeModelFetchError);
            // contentForUI remains as contentToSave (implicitly, as it wasn't changed)
         }
      } else {
        // No filtering for 'none' mode or when autoFilter is false
        // contentForUI remains as contentToSave (implicitly, as it wasn't changed)
        console.log(`[streamProvider] Using raw content for final response (sanitizationMode: ${sanitizationMode}, autoFilter: ${autoFilter})`);
      }
      // Assign the potentially sanitized content to finalContent for later use
      finalContent = contentForUI;

    } catch (error) {
      // Stream Failed
      console.error(`Inference failed for model ${modelId} (${modelName}):`, error);
      streamError = error;
      // REMOVED: contentToSave = accumulatedTokens.join(''); (contentToSave should hold partial content on error)

      if (error.message?.includes('context window')) {
        finalContent = `Error: The conversation history is too long for this model's capacity. Please start a new chat or delete some older messages.`;
      } else {
        let safeErrorMessage = 'Failed to get response.';
        if (error.response?.data?.error?.message) {
           safeErrorMessage = error.response.data.error.message;
        } else if (error.response?.data?.error?.type) {
           safeErrorMessage = error.response.data.error.type;
        } else if (error.response?.statusText) {
           safeErrorMessage = error.response.statusText;
        } else if (error.message) {
           safeErrorMessage = typeof error.message === 'string' ? error.message : 'An unexpected error occurred.';
        }
        finalContent = `Error: ${safeErrorMessage}`;
        if (error.response?.status) {
           finalContent += ` (Status: ${error.response.status})`;
        }
      }
    } finally {
      const endTime = Date.now();
      const elapsedTime = (endTime - startTime) / 1000;

      try {
        // Save the RAW content (contentToSave) to the database ONLY IF NO ERROR OCCURRED
        if (!streamError) {
          await Message.update(placeholderAssistantMessageId, {
            content: contentToSave, // Use the original, unsanitized contentToSave
            isLoading: false
          });
        } else {
          // If there was an error, we might want to delete the placeholder or mark it differently
          // For now, we simply don't update it, leaving it potentially empty and loading=true
          // The frontend should handle the chat:error event and potentially remove/update the UI element
          console.log(`[streamProvider] Skipping DB update for message ${placeholderAssistantMessageId} due to stream error.`);
        }

        // Publish the potentially SANITIZED content (finalContent) or the error to the frontend
        if (streaming?.chatId) {
          if (streamError) {
            eventBus.publish('chat:error', {
              chatId: streaming.chatId,
              messageId: placeholderAssistantMessageId,
              error: streamError.message || 'An unknown error occurred during inference.'
            });
          } else {
            eventBus.publish('chat:complete', {
              chatId: streaming.chatId,
              messageId: placeholderAssistantMessageId,
              message: finalContent,
              finalMessageId: finalMessageId !== placeholderAssistantMessageId ? finalMessageId : undefined,
              usage: finalUsage,
              elapsed: elapsedTime
            });
          }
        }

        if (streamError) {
          reject(streamError);
        } else {
          // Fetch model details if not already fetched during sanitization, for fallback provider/name info
          if (!model) {
             try { model = await Model.findById(modelId); } catch (e) { console.error("Failed to fetch model for final resolve info:", e); }
          }
          const finalProvider = result?.provider || (model?.external_provider_id ? 'External API' : 'Local Worker');
          const finalModelName = result?.model || model?.name || modelName; // Use fetched name if available

          resolve({
            message: finalContent,
            messageId: finalMessageId,
            usage: finalUsage,
            latency: elapsedTime * 1000,
            provider: finalProvider,
            model: finalModelName,
          });
        }
      } catch (dbError) {
        console.error(`Failed to update message in DB after stream completion/error:`, dbError);
        reject(streamError || dbError);
      }
    }
  }); // End of returned Promise
};
