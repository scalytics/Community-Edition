/**
 * Prompt & Response Processing Service
 *
 * Selects and applies the correct prompt template based on the model.
 * Also provides model-specific response filtering and context window management.
 * Assumes tokenizers are loaded locally.
 */
const fs = require('fs').promises; 
const path = require('path'); 
const Model = require('../Model');
const vllmService = require('../../services/vllmService');

const mistralFormatter = require('./formatters/mistralFormatter');
const llamaFormatter = require('./formatters/llamaFormatter');
const deepseekFormatter = require('./formatters/deepseekFormatter');
const phiFormatter = require('./formatters/phiFormatter');
const gemmaFormatter = require('./formatters/gemmaFormatter');
const teukenFormatter = require('./formatters/teukenFormatter'); 
const defaultFormatter = require('./formatters/defaultFormatter');

const mistralFilter = require('./filters/mistralFilter');
const llamaFilter = require('./filters/llamaFilter');
const deepseekFilter = require('./filters/deepseekFilter');
const phiFilter = require('./filters/phiFilter');
const gemmaFilter = require('./filters/gemmaFilter');
const teukenFilter = require('./filters/teukenFilter'); 
const defaultFilter = require('./filters/defaultFilter');

const preprocessModule = require('./preprocess');

/**
 * Formats a message history according to the specified model's requirements.
 * Accepts the final, pre-constructed system prompt.
 *
 * @param {number} modelId - The ID of the target model.
 * @param {Array<object>} messages - The chat history (e.g., [{ role: 'user', content: 'Hi' }]).
 * @param {string|null} finalSystemPrompt - The complete system prompt string (or null if none).
 * @returns {Promise<string>} The fully formatted prompt string.
 */
async function formatPromptForModel(modelId, messages, finalSystemPrompt = null) { 

  if (!modelId || !messages || !Array.isArray(messages)) { 
    console.warn('[Prompt Formatter] Invalid input: modelId and messages array are required.');
    return defaultFormatter.format([], finalSystemPrompt); 
  }

  try {
    // 1. Fetch model details (still needed for format type and name)
    const model = await Model.findById(modelId);
    if (!model) {
      console.warn(`[Prompt Formatter] Model ${modelId} not found. Using default formatting.`);
      // Use the provided finalSystemPrompt even if model not found
      return defaultFormatter.format(messages, finalSystemPrompt);
    }

    // 2. Determine the required format
    const formatType = determineFormatType(model);

    // 3. Apply preprocessing (if needed)
    const modelOptions = getModelOptions(model, formatType);
    // Pass original messages, system prompt is handled separately by formatters now
    const enhancedMessages = preprocessModule.enhanceMessages(messages, formatType, modelOptions);

    // 4. Apply the appropriate formatter, passing messages and the final determined system prompt
    switch (formatType) {
      case 'mistral':
        return mistralFormatter.format(enhancedMessages, finalSystemPrompt);
      case 'llama':
        return llamaFormatter.format(enhancedMessages, model.name, finalSystemPrompt);
      case 'deepseek':
        return deepseekFormatter.format(enhancedMessages, model.name, finalSystemPrompt);
      case 'phi':
        return phiFormatter.format(enhancedMessages, model.name, finalSystemPrompt);
      case 'gemma':
        return gemmaFormatter.format(enhancedMessages, model.name, finalSystemPrompt);
      case 'teuken': // Added Teuken
        return teukenFormatter.format(enhancedMessages, model.name, finalSystemPrompt);
      default:
        return defaultFormatter.format(enhancedMessages, finalSystemPrompt);
    }
  } catch (error) {
    console.error(`[Prompt Formatter] Error formatting prompt:`, error);
    // Fallback to default formatter with the provided system prompt
    return defaultFormatter.format(messages, finalSystemPrompt);
  }
}

// REMOVED determineSystemPrompt helper function as logic is now upstream

/**
 * Extract model-specific options for preprocessing
 * @param {object} model - Model object
 * @param {string} formatType - Determined format type
 * @returns {object} Options for preprocessing
 */
function getModelOptions(model, formatType) {
  const modelName = (model.name || '').toLowerCase();
  const options = {};

  switch (formatType) {
    case 'phi':
      options.isMultimodal = modelName.includes('phi-4') || modelName.includes('phi4');
      break;
    case 'mistral':
      options.isMixtral = modelName.includes('mixtral');
      break;
    case 'llama':
      options.isLlama3 = modelName.includes('llama-3') || modelName.includes('llama3');
      break;
    case 'claude':
      options.version = modelName.includes('claude-3') ? 'claude-3' : 'claude-2';
      break;
    case 'gemini':
      options.isMultimodal = modelName.includes('vision') || modelName.includes('pro');
      break;
  }

  return options;
}

/**
 * Determines the prompt format type for a model using a multi-level detection approach:
 * 1. Check explicit format type in database
 * 2. Check model family if specified
 * 3. Auto-detect from model path and name
 */
function determineFormatType(model) {
  // 1. Check DB-specified format (highest priority)
  if (model.prompt_format_type) return model.prompt_format_type;

  // 2. Check model family if specified
  if (model.model_family) {
    return mapFamilyToFormat(model.model_family);
  }

  // 3. Auto-detect from path/name (lowest priority)
  return detectFormatFromName(model);
}

/**
 * Maps a model family to its corresponding format type
 */
function mapFamilyToFormat(family) {
  const normalizedFamily = family.toLowerCase();
  switch (normalizedFamily) {
    case 'mistral': return 'mistral';
    case 'llama': return 'llama';
    case 'deepseek': return 'deepseek';
    case 'phi': return 'phi';
    case 'gemma': return 'gemma';
    case 'teuken': return 'teuken'; // Added Teuken
    default: return 'default';
  }
}

/**
 * Detects format type based on model name and path patterns
 */
function detectFormatFromName(model) {
  const modelName = model.name?.toLowerCase() || '';
  const modelPath = model.model_path?.toLowerCase() || '';

  // Look for known model family patterns
  if (modelName.includes('mistral') || modelPath.includes('mistral')) return 'mistral';
  if (modelName.includes('mixtral') || modelPath.includes('mixtral')) return 'mistral';

  if (modelName.includes('llama') || modelPath.includes('llama')) return 'llama';
  if (modelName.includes('vicuna') || modelPath.includes('vicuna')) return 'llama';
  if (modelName.includes('deepseek') || modelPath.includes('deepseek')) return 'deepseek';
  if (modelName.includes('phi') || modelPath.includes('phi')) return 'phi';
  if (modelName.includes('gemma') || modelPath.includes('gemma')) return 'gemma';
  if (modelName.includes('teuken') || modelPath.includes('teuken')) return 'teuken'; // Added Teuken

  // Default fallback
  return 'default';
}

/**
 * Sanitizes a model response using the appropriate filter for the model type.
 *
 * @param {number} modelId - The ID of the model that generated the response.
 * @param {string} response - The raw response from the model.
 * @param {object} [options] - Additional options for sanitization.
 * @param {string} [options.lastUserMessage] - The last user message for echo detection.
 * @returns {Promise<string>} The sanitized response.
 */
async function sanitizeResponseForModel(modelId, response, options = {}) {
  if (!modelId || !response) {
    console.warn('[Response Sanitizer] Invalid input: modelId and response are required.');
    return defaultFilter.sanitize(response || '');
  }

  try {
    // 1. Fetch model details
    const model = await Model.findById(modelId);
    if (!model) {
      console.warn(`[Response Sanitizer] Model ${modelId} not found. Using default filtering.`);
      return defaultFilter.sanitize(response);
    }

    // 2. Determine the required format for filtering
    const formatType = determineFormatType(model);
    console.log(`[Response Sanitizer] Using filter type '${formatType}' for model ${modelId} (${model.name})`);

    // 3. Apply the appropriate filter with options
    switch (formatType) {
      case 'mistral':
        return mistralFilter.sanitize(response, options);
      case 'llama':
        return llamaFilter.sanitize(response, options);
      case 'deepseek':
        return deepseekFilter.sanitize(response, options);
      case 'phi':
        return phiFilter.sanitize(response, options);
      case 'gemma':
        return gemmaFilter.sanitize(response, options);
      case 'teuken': // Added Teuken
        return teukenFilter.sanitize(response, options);
      default:
        console.log(`[Response Sanitizer] Using default filter for model ${modelId} (format: ${formatType})`);
        return defaultFilter.sanitize(response);
    }
  } catch (error) {
    console.error(`[Response Sanitizer] Error sanitizing response:`, error);
    // Fallback to default filter if something goes wrong
    return defaultFilter.sanitize(response);
  }
}

/**
 * Validates if the message history fits within the context window of the specified model.
 * Relies on local tokenizer loading only.
 *
 * @param {number} modelId - The ID of the target model.
 * @param {Array<object>} messages - The chat history.
 * @returns {Promise<object>} Validation result with token estimates and status.
 */
async function validateContextForModel(modelId, messages) {
  if (!modelId || !messages || !Array.isArray(messages)) {
    console.warn('[Context Validator] Invalid input: modelId and messages array are required.');
    return { valid: false, error: 'Invalid input', modelId };
  }

  try {
    // 1. Fetch model details
    const model = await Model.findById(modelId);
    if (!model) {
      console.warn(`[Context Validator] Model ${modelId} not found.`);
      return { valid: false, error: 'Model not found' };
    }

    // 2. Get the model's context window size
    let contextSize = model.n_ctx || 4096; // Default to 4096 if not specified
    if (vllmService.activeModelId === modelId && vllmService.activeModelContextSize) {
      contextSize = vllmService.activeModelContextSize;
      console.log(`[Context Validator] Using live context size from vLLM service: ${contextSize}`);
    }

    // 3. Determine the format type for potential formatting/filtering
    const formatType = determineFormatType(model);
    const modelLocalPath = (typeof model.model_path === 'string' && model.model_path) ? model.model_path : null;

    // 4. Use the standard JS filters for tokenization
    let validationResult;
    console.log(`[Context Validator] Using JS filter '${formatType}' for model ${modelId}`);
    switch (formatType) {
      case 'mistral':
        validationResult = await mistralFilter.validateContext(messages, contextSize);
        break;
      case 'llama':
        validationResult = await llamaFilter.validateContext(messages, contextSize);
        break;
      case 'deepseek':
        validationResult = await deepseekFilter.validateContext(messages, contextSize);
        break;
      case 'phi':
        validationResult = await phiFilter.validateContext(messages, contextSize);
        break;
      case 'gemma':
        validationResult = await gemmaFilter.validateContext(messages, contextSize);
        break;
      case 'teuken': // Added Teuken
        validationResult = await teukenFilter.validateContext(messages, contextSize);
        break;
      default:
        validationResult = await defaultFilter.validateContext(messages, contextSize);
    }

    // 5. Return combined result
    return {
      ...validationResult, 
      modelId,
      modelName: model.name,
      formatType
    };

  } catch (error) {
    console.error(`[Context Validator] Error validating context:`, error);
    return {
      valid: false,
      error: error.message,
      modelId
    };
  }
}

/**
 * Truncates message history to fit within a model's context window.
 * Relies on local tokenizer loading only.
 *
 * @param {number} modelId - The ID of the target model.
 * @param {Array<object>} messages - The chat history.
 * @returns {Promise<Array<object>>} Truncated message history.
 */
async function truncateHistoryForModel(modelId, messages) {
  if (!modelId || !messages || !Array.isArray(messages)) {
    console.warn('[History Truncator] Invalid input: modelId and messages array are required.');
    return messages || [];
  }

  try {
    // 1. Fetch model details
    const model = await Model.findById(modelId);
    if (!model) {
      console.warn(`[History Truncator] Model ${modelId} not found.`);
      return messages; 
    }

    // 2. Get the model's context window size
    let contextSize = model.n_ctx || 4096;
    if (vllmService.activeModelId === modelId && vllmService.activeModelContextSize) {
      contextSize = vllmService.activeModelContextSize;
      console.log(`[History Truncator] Using live context size from vLLM service: ${contextSize}`);
    }

    // 3. Determine the format type for potential formatting/filtering
    const formatType = determineFormatType(model);
    const modelLocalPath = (typeof model.model_path === 'string' && model.model_path) ? model.model_path : null;

    const safetyMargin = 0.90; 
    const maxTokens = Math.floor(contextSize * safetyMargin);

    console.log(`[History Truncator] Starting truncation for model ${modelId}. Target: ${maxTokens} tokens.`);

    let currentMessages = [...messages];
    let truncated = false;

    // Separate system messages (always kept) from user/assistant messages
    const systemMessages = currentMessages.filter(msg => msg.role === 'system');
    let userAssistantMessages = currentMessages.filter(msg => msg.role !== 'system');

    // Keep the very last message separate if it's from the user, as it's often the most important
    const lastUserMessage = userAssistantMessages.length > 0 && userAssistantMessages[userAssistantMessages.length - 1].role === 'user'
      ? userAssistantMessages.pop() // Remove last user message for now
      : null;

    // Loop, removing oldest pairs until context fits
    while (userAssistantMessages.length > 0) {
      const messagesToCheck = lastUserMessage
        ? [...systemMessages, ...userAssistantMessages, lastUserMessage] 
        : [...systemMessages, ...userAssistantMessages];

      let currentTokens;
      try {
        // Use JS filter token counter
        switch (formatType) { // Use formatType determined earlier
          case 'mistral': currentTokens = await mistralFilter.countTokens(messagesToCheck); break;
          case 'llama': currentTokens = await llamaFilter.countTokens(messagesToCheck); break;
          case 'deepseek': currentTokens = await deepseekFilter.countTokens(messagesToCheck); break;
          case 'phi': currentTokens = await phiFilter.countTokens(messagesToCheck); break;
          case 'gemma': currentTokens = await gemmaFilter.countTokens(messagesToCheck); break;
          case 'teuken': currentTokens = await teukenFilter.countTokens(messagesToCheck); break; // Added Teuken
          default: currentTokens = await defaultFilter.countTokens(messagesToCheck); break;
        }

        // Handle potential non-numeric return from fallback counters in filters
        if (typeof currentTokens !== 'number') {
           console.error(`[Truncator - ${formatType}] Token counting failed during truncation loop (returned ${currentTokens}). Aborting truncation.`);
           return messages; // Return original messages if counting fails critically
        }

      } catch (countError) {
        console.error(`[History Truncator] Error counting tokens during truncation for model ${modelId}:`, countError);
        return messages; // Return original on error
      }

      console.log(`[History Truncator] Check: ${messagesToCheck.length} messages, ${currentTokens} tokens vs ${maxTokens} limit.`);

      if (currentTokens <= maxTokens) {
        currentMessages = messagesToCheck; // This set of messages fits
        break;
      }

      // Doesn't fit, remove oldest pair (user/assistant)
      truncated = true;
      if (userAssistantMessages.length >= 2) {
        userAssistantMessages.splice(0, 2); 
      } else {
        userAssistantMessages.splice(0, 1); 
      }

      // Handle edge case: only system + last user message left
      if (userAssistantMessages.length === 0 && lastUserMessage) {
          const finalCheckMessages = [...systemMessages, lastUserMessage];
          let finalTokens;
          try {
            switch (formatType) {
              case 'mistral': finalTokens = await mistralFilter.countTokens(finalCheckMessages); break;
              case 'llama': finalTokens = await llamaFilter.countTokens(finalCheckMessages); break;
              case 'deepseek': finalTokens = await deepseekFilter.countTokens(finalCheckMessages); break;
              case 'phi': finalTokens = await phiFilter.countTokens(finalCheckMessages); break;
              case 'gemma': finalTokens = await gemmaFilter.countTokens(finalCheckMessages); break;
              case 'teuken': finalTokens = await teukenFilter.countTokens(finalCheckMessages); break; // Added Teuken
              default: finalTokens = await defaultFilter.countTokens(finalCheckMessages); break;
            }
            if (typeof finalTokens !== 'number') throw new Error('Token counting failed');

          } catch (finalCountError) {
             console.error(`[History Truncator] Error counting final tokens for model ${modelId}:`, finalCountError);
             return messages; 
          }

          if (finalTokens <= maxTokens) {
              currentMessages = finalCheckMessages;
          } else {
              console.warn(`[History Truncator] System prompt + last user message exceed context window (${finalTokens} > ${maxTokens}).`);
              // Keep system messages, discard last user message, add truncation note
              currentMessages = [
                  ...systemMessages,
                  { role: 'system', content: 'Note: Conversation history severely truncated due to length. Last message removed.' }
              ];
              truncated = true; // Ensure truncated flag is set
          }
          break; 
      } else if (userAssistantMessages.length === 0 && !lastUserMessage) {
          currentMessages = [...systemMessages];
          break; 
      }
    } 

    // Add a system note if truncation occurred, unless one was already added in the edge case above
    if (truncated && !currentMessages.some(m => m.role === 'system' && m.content.includes('truncated'))) {
      const firstNonSystemIndex = currentMessages.findIndex(msg => msg.role !== 'system');
      const insertIndex = firstNonSystemIndex !== -1 ? firstNonSystemIndex : systemMessages.length; // Insert after system prompts
      currentMessages.splice(insertIndex, 0, {
        role: 'system',
        content: 'Note: Some earlier parts of the conversation have been removed to fit within the context limit.'
      });
    }

    console.log(`[History Truncator] Finished truncation for model ${modelId}. Final message count: ${currentMessages.length}`);
    return currentMessages;

  } catch (error) {
    console.error(`[History Truncator] Error during truncation process for model ${modelId}:`, error);
    return messages; 
  }
}

module.exports = {
  formatPromptForModel,
  sanitizeResponseForModel,
  validateContextForModel,
  truncateHistoryForModel
};
