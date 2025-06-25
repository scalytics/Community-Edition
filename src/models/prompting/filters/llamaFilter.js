/**
 * Response filter and context manager for Llama models.
 * Inherits token counting and context management from the default filter.
 */
const defaultFilter = require('./defaultFilter');

/**
 * Enhanced sanitizer for Llama model responses (Llama 2 and Llama 3).
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @param {string} [options.modelNameOrPath] - Model name or path to determine version
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  
  // First, determine if we're dealing with Llama 3 based on model name/path
  const isLlama3Format = options.modelNameOrPath ? 
    require('../formatters/llamaFormatter').isLlama3(options.modelNameOrPath) : 
    true; // Default to Llama 3 if not specified
  
  let cleanedResponse = response;
  
  // 1. Remove Llama-specific control tokens and formatting
  
  // Common to both Llama 2 and 3: Remove BOS/EOS tokens
  cleanedResponse = cleanedResponse.replace(/<\/?s>/g, '');
  
  // Remove instruction and system tags
  cleanedResponse = cleanedResponse.replace(/\[INST\].*?\[\/INST\]/gs, ''); // Instruction blocks
  cleanedResponse = cleanedResponse.replace(/<<SYS>>.*?<<\/SYS>>/gs, ''); // System blocks
  
  // 2. Handle Llama 3 specific artifacts
  if (isLlama3Format) {
    // Fix Llama 3's bracket artifacts which are particularly common
    // Leading bracket at beginning
    cleanedResponse = cleanedResponse.replace(/^\s*\]\s*/, '');
    
    // Trailing bracket at end
    cleanedResponse = cleanedResponse.replace(/\s*\[\s*$/, '');
    
    // Bracketed text that looks like model formatting
    cleanedResponse = cleanedResponse.replace(/\s*\[.*?\]\s*$/, '');
    
    // Bracket after punctuation (common artifact in Llama 3)
    cleanedResponse = cleanedResponse.replace(/([.!?])\s*\]/, '$1');
  }
  
  // 3. Handle common formatting errors
  
  // Fix excessive newlines
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  // 4. Generic cleanup
  
  // Remove echoing of user's message
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }
  
  // 5. Deal with assistant self-identification issues (common in Llama models)
  cleanedResponse = cleanedResponse.replace(/^(As an AI assistant|I'm an AI assistant|I am an AI assistant|As a helpful assistant)/i, '');

  // 6. Merged shebang lines handled by defaultFilter.js (Keep this comment)

  // 7 & 8: Code block fence fixes removed - Let frontend handle.
  // cleanedResponse = cleanedResponse.replace(/^(```\s*[a-zA-Z0-9]+[^\S\n]*)$/gm, '$1\n');
  // cleanedResponse = cleanedResponse.replace(/^(```)\s*\n(\s*[a-zA-Z0-9]+)\s*\n/gm, '$1$2\n');

  // 9. Llama-specific: Remove ```markdown fences to treat inner content as regular markdown
  const markdownFenceRegex = /(?:^|\n)\s*```markdown\s*\n?([\s\S]*?)\n?\s*```\s*(?:\n|$)/g;
  cleanedResponse = cleanedResponse.replace(markdownFenceRegex, (match, innerContent) => {
    const content = innerContent ? innerContent.trim() : '';
    return `\n${content}\n`; // Replace block with just inner content surrounded by newlines
  });

  return cleanedResponse.trim();
}

// Delegate all token and context functions to the default filter
module.exports = {
  sanitize,
  countTokens: defaultFilter.countTokens,
  validateContext: defaultFilter.validateContext,
  truncateHistory: defaultFilter.truncateHistory
};
