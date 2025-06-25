/**
 * Response filter and context manager for Mistral models.
 * Inherits token counting and context management from the default filter.
 */
const defaultFilter = require('./defaultFilter');

/**
 * Fix code blocks where language is attached to first line
 * Finds patterns like ```pythonimport random and fixes them
 * @param {string} content - Content to fix
 * @returns {string} Fixed content
 */
function fixCodeBlocks(content) {
  if (!content || !content.includes('```')) return content;
  
  // Find code blocks and fix them - handle various patterns
  let fixed = content;
  
  // Fix standard triple backtick code blocks with language tag attached to code
  fixed = fixed.replace(/```([a-zA-Z0-9_+#]+)([^\n])/g, function(match, language, firstChar) {
    return "```" + language + "\n" + firstChar;
  });
  
  // Fix Python code specifically (common pattern in Mistral models)
  fixed = fixed.replace(/(```python|```py)(import|from|def|class)/g, "$1\n$2");
  
  // Fix indentation in Python code - properly indent code after control statements
  fixed = fixed.replace(/(if|for|while|def|class)([^:]+):([^\n])/g, "$1$2:$3\n    ");
  
  // Fix section headers that commonly have code blocks
  const sectionHeaders = ['Script:', 'Skript:', 'Code:', 'Example:', 'Beispiel:'];
  
  // Process each section header
  for (const header of sectionHeaders) {
    // Create pattern for headers followed by code blocks - ensure only one newline
    const headerPattern = new RegExp(header + "\\s*(```[a-z]*)", "g");
    fixed = fixed.replace(headerPattern, header + "\n$1"); // Use \n instead of \n\n
    
    // Create pattern for headers followed by content without code blocks - ensure only one newline
    const contentPattern = new RegExp(header + "([^\\s\\n`].*)", "g");
    fixed = fixed.replace(contentPattern, header + "\n```\n$1"); // Use \n instead of \n\n
  }
  
  return fixed;
}

/**
 * Sanitizes a Mistral model response with enhanced markdown handling.
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  let cleanedResponse = response;

  // Step 1: Remove specific Mistral tags and control tokens
  // Remove any BOS/EOS tokens (start/end of sequence)
  cleanedResponse = cleanedResponse.replace(/<s>|<\/s>/g, '');
  
  // Remove Mistral specific IM tokens
  cleanedResponse = cleanedResponse.replace(/<\|im_start\|>(user|assistant|system).*?<\|im_end\|>/gi, '');
  cleanedResponse = cleanedResponse.replace(/<\|im_start\|>|<\|im_end\|>/g, '');
  cleanedResponse = cleanedResponse.replace(/<\|end_of_text\|>|<\|end_of_turn\|>/g, '');

  // Step 2: Handle instruction brackets added by the model 
  // Remove possible echoes of instruction markers
  cleanedResponse = cleanedResponse.replace(/^\s*\[INST\]\s*/, '');
  cleanedResponse = cleanedResponse.replace(/\s*\[\/INST\]\s*$/, '');
  
  // Remove empty instruction blocks which are often errors
  cleanedResponse = cleanedResponse.replace(/\[INST\]\s*\[\/INST\]/g, '');
  
  // Step 3: Handle user message echo at beginning
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }
  
  // Step 4: Handle common error patterns
  // Fix Mistral's tendency to repeat itself
  const repetitionRegex = /(\b\w{5,}\b)(?:\s+\w+){1,10}\s+\1(?:\s+\w+){1,10}\s+\1/i;
  if (repetitionRegex.test(cleanedResponse)) {
    // If we detect a repetition pattern, try to take just the first part
    const parts = cleanedResponse.split(/\.\s+/);
    if (parts.length > 2) {
      // Take the first two sentences if we have enough
      cleanedResponse = parts.slice(0, 2).join('. ') + '.';
    }
  } // Added missing closing brace for repetitionRegex check

  // Steps 5, 7-12 (Markdown/Formatting Fixes) are disabled - Let frontend handle rendering.

  return cleanedResponse.trim();
}

// Delegate all token and context functions to the default filter
module.exports = {
  sanitize,
  countTokens: defaultFilter.countTokens,
  validateContext: defaultFilter.validateContext,
  truncateHistory: defaultFilter.truncateHistory
};
