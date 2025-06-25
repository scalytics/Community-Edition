/**
 * Response filter and context manager for Gemma models.
 * Inherits token counting and context management from the default filter.
 */
const defaultFilter = require('./defaultFilter');

/**
 * Enhanced sanitizer for Gemma model responses.
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @param {string} [options.modelNameOrPath] - Model name or path to determine Gemma version
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  
  // First, determine if we're dealing with Gemma 2 based on model name/path
  const isGemma2Format = options.modelNameOrPath ? 
    require('../formatters/gemmaFormatter').isGemma2(options.modelNameOrPath) : 
    false; // Default to original Gemma if not specified
  
  let cleanedResponse = response;
  
  // 1. Remove Gemma-specific control tokens and formatting
  
  // Remove turn markers - do this carefully to maintain content
  cleanedResponse = cleanedResponse.replace(/^\s*<start_of_turn>model\s*/i, ''); // Remove leading model turn start
  cleanedResponse = cleanedResponse.replace(/\s*<end_of_turn>\s*$/i, ''); // Remove trailing end of turn
  
  // Remove other potential turn markers (like user turns or complete turn blocks)
  cleanedResponse = cleanedResponse.replace(/<start_of_turn>user\s*.*?<end_of_turn>\s*/gs, '');
  cleanedResponse = cleanedResponse.replace(/<start_of_turn>model\s*.*?<end_of_turn>\s*/gs, '');
  
  // Handle partial turn markers (in case they appear in the middle of text)
  cleanedResponse = cleanedResponse.replace(/<start_of_turn>\s*/g, '');
  cleanedResponse = cleanedResponse.replace(/<end_of_turn>\s*/g, '');
  
  // 2. Handle Gemma-specific formatting issues
  
  // Handle Gemma2-specific issues if detected
  if (isGemma2Format) {
    // Gemma 2 can sometimes generate additional artifacts 
    // This would be where we'd add Gemma 2-specific cleanup when we have examples
  }
  
  // 3. Handle common formatting errors
  
  // Fix excessive newlines (common in Gemma)
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  // 4. Generic cleanup
  
  // Remove echoing of user's message (Gemma can echo the user query)
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }
  
  // 5. Remove common Gemma self-identification patterns
  cleanedResponse = cleanedResponse.replace(/^(As an AI assistant|I'm an AI assistant|I am an AI assistant|As Gemma,)/i, '');

  // 6 & 7: Code block fence fixes removed - Let frontend handle.
  
  return cleanedResponse.trim();
}

// Delegate all token and context functions to the default filter
module.exports = {
  sanitize,
  countTokens: defaultFilter.countTokens,
  validateContext: defaultFilter.validateContext,
  truncateHistory: defaultFilter.truncateHistory
};
