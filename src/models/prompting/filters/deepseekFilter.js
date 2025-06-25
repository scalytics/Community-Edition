/**
 * Response filter and context manager for DeepSeek models.
 * Inherits token counting and context management from the default filter.
 */
const defaultFilter = require('./defaultFilter');

/**
 * Enhanced sanitizer for DeepSeek model responses (v1 and v3)
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @param {string} [options.modelNameOrPath] - Model name or path to determine DeepSeek version
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  
  // First, determine if we're dealing with DeepSeek v3 based on model name/path
  const isV3Format = options.modelNameOrPath ? 
    require('../formatters/deepseekFormatter').isDeepSeekV3(options.modelNameOrPath) : 
    false; // Default to DeepSeek v1 if not specified
  
  let cleanedResponse = response;
  
  // 1. Remove all DeepSeek-specific control tokens and formatting
  
  // Common tokens for all DeepSeek versions
  cleanedResponse = cleanedResponse.replace(/<｜fim begin｜>/g, '');
  cleanedResponse = cleanedResponse.replace(/<｜fim hole｜>/g, '');
  cleanedResponse = cleanedResponse.replace(/<｜fim end｜>/g, '');
  cleanedResponse = cleanedResponse.replace(/<｜end of sentence｜>/g, '');
  cleanedResponse = cleanedResponse.replace(/<｜end of text｜>/g, '');
  
  // Remove DeepSeek v3 specific tokens
  if (isV3Format) {
    cleanedResponse = cleanedResponse.replace(/<｜begin_of_text｜>/g, '');
    // Remove any other v3-specific tokens we might discover
  }
  
  // 2. Handle role prefixes (more common in raw model output)
  cleanedResponse = cleanedResponse.replace(/^Human:\s*/i, '');
  cleanedResponse = cleanedResponse.replace(/^Assistant:\s*/i, '');
  
  // 3. Handle common formatting errors
  
  // Fix excessive newlines (common in models)
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  // 4. Generic cleanup
  
  // Remove echoing of user's message (DeepSeek can echo the user query)
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }

  // 5. Remove <think> blocks
  cleanedResponse = cleanedResponse.replace(/<\s*think\s*>.*?<\s*\/\s*think\s*>/gis, '');
  
  // 6. Remove common DeepSeek self-identification patterns
  cleanedResponse = cleanedResponse.replace(/^(As an AI assistant|I'm an AI assistant|I am an AI assistant|As an AI language model)/i, '');

  // 7 & 8: Code block fence fixes removed - Let frontend handle.
  
  return cleanedResponse.trim();
}

// Delegate all token and context functions to the default filter
module.exports = {
  sanitize,
  countTokens: defaultFilter.countTokens,
  validateContext: defaultFilter.validateContext,
  truncateHistory: defaultFilter.truncateHistory
};
