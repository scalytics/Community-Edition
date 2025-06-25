/**
 * Response filter and context manager for Phi models.
 * Inherits token counting and context management from the default filter.
 */
const defaultFilter = require('./defaultFilter');


/**
 * Fix code blocks where language is attached to first line
 * Finds patterns like ```golangpackage main and fixes them
 * @param {string} content - Content to fix
 * @returns {string} Fixed content
 */
function fixCodeBlocks(content) {
  if (!content || !content.includes('```')) return content;
  
  // Find code blocks and fix them - handle various patterns
  let fixed = content;
  
  // Fix standard triple backtick code blocks with language tag attached to code
  fixed = fixed.replace(/```([a-zA-Z0-9_+#]+)([^\n])/g, (match, language, firstChar) => {
    // Separate language from code with a newline
    return "```" + language + "\n" + firstChar;
  });
  
  // Fix quoted triple backtick blocks (sometimes occurs in raw responses)
  fixed = fixed.replace(/\|```([a-zA-Z0-9_+#]+)([^\n])/g, (match, language, firstChar) => {
    // Separate language from code with a newline
    return "|```" + language + "\n" + firstChar;
  });
  
  // Fix Go code specifically (common pattern in Phi models)
  fixed = fixed.replace(/(```go|```golang)package\s+main/g, "$1\npackage main");
  
  return fixed;
}

/**
 * Enhanced sanitizer for Phi model responses (Phi-3 and Phi-4).
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @param {string} [options.modelNameOrPath] - Model name or path to determine format version
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  
  // First, determine if we're dealing with Phi-4 based on model name/path
  const isPhi4Format = options.modelNameOrPath ? 
    require('../formatters/phiFormatter').isPhi4(options.modelNameOrPath) : 
    false;
  
  let cleanedResponse = response;
  
  // 0. Fix code blocks (REMOVED - Let frontend handle)
  
  // 1. Remove Phi-specific special tokens
  cleanedResponse = cleanedResponse.replace(/<\|(system|user|assistant)\|>\s*/g, ''); // Remove all role tags
  cleanedResponse = cleanedResponse.replace(/<\|end\|>\s*/g, ''); // Remove all end tags
  
  // 2. Fix specific Phi response issues
  
  // Fix Phi-4's tendency to repeat lines at start of responses
  if (isPhi4Format) {
    // Match cases where the model repeats the same line twice at the beginning
    const firstLines = cleanedResponse.split('\n').slice(0, 3);
    if (firstLines.length >= 2 && firstLines[0].trim() === firstLines[1].trim() && firstLines[0].trim().length > 5) {
      // Remove the duplicate line
      const lines = cleanedResponse.split('\n');
      cleanedResponse = lines.slice(1).join('\n');
    }
  }
  
  // 3. Handle common formatting errors
  
  // Fix code blocks that start or end with too many backticks (common in Phi models)
  cleanedResponse = cleanedResponse.replace(/````(`*)([\s\S]*?)````(`*)/g, '```$2```');
  
  // Fix excessive newlines in responses (common in Phi)
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  // Fix Phi's markdown list rendering (REMOVED - Let frontend handle)
  
  // Fix Go code imports formatting (REMOVED - Let frontend handle)
  
  // 4. Generic cleanup
  
  // Handle user message echo at beginning
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }
  
  // 5. Remove any leftover control tokens from other models (cross-contamination)
  cleanedResponse = cleanedResponse.replace(/<\/?s>/g, ''); // Mistral/Llama tokens
  cleanedResponse = cleanedResponse.replace(/<<\/?SYS>>\s*/g, ''); // Llama tokens
  cleanedResponse = cleanedResponse.replace(/\[\/?INST\]\s*/g, ''); // Llama tokens
  cleanedResponse = cleanedResponse.replace(/Error: model is not defined/g, ''); // Common error message

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
