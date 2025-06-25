/**
 * Preprocessing Instructions Module
 * 
 * Centralizes access to model-specific formatting instructions
 * that can be added to system prompts to improve response formatting.
 */

const phiPreprocess = require('./phiPreprocess');
const mistralPreprocess = require('./mistralPreprocess');
const llamaPreprocess = require('./llamaPreprocess');
const claudePreprocess = require('./claudePreprocess');
const geminiPreprocess = require('./geminiPreprocess');
const defaultPreprocess = require('./defaultPreprocess');

/**
 * Get preprocessing instructions for a specific model type
 * 
 * @param {string} formatType - The model format type (e.g., 'mistral', 'llama')
 * @param {object} options - Additional options for specific model types
 * @returns {string} Preprocessing instructions
 */
function getPreprocessingInstructions(formatType, options = {}) {
  // Normalize format type to lowercase
  const format = (formatType || 'default').toLowerCase();
  
  switch (format) {
    case 'phi':
      return phiPreprocess.getInstructions(options.isMultimodal);
      
    case 'mistral':
      return mistralPreprocess.getInstructions(options.isMixtral);
      
    case 'llama':
      return llamaPreprocess.getInstructions(options.isLlama3);
      
    case 'claude':
      return claudePreprocess.getInstructions(options.version);
      
    case 'gemini':
      return geminiPreprocess.getInstructions(options.isMultimodal);
      
    default:
      return defaultPreprocess.getInstructions();
  }
}

/**
 * Enhances a system message with preprocessing instructions
 * 
 * @param {string} systemMessage - Original system message
 * @param {string} formatType - The model format type
 * @param {object} options - Additional options for specific model types
 * @returns {string} Enhanced system message
 */
function enhanceSystemMessage(systemMessage, formatType, options = {}) {
  const preprocessInstructions = getPreprocessingInstructions(formatType, options);
  
  // If no system message provided, use preprocessing instructions alone
  if (!systemMessage || systemMessage.trim() === '') {
    return `You are a helpful AI assistant.\n\n${preprocessInstructions}`;
  }
  
  // Otherwise, append instructions to existing system message
  return `${systemMessage.trim()}\n\n${preprocessInstructions}`;
}

/**
 * Enhances message array by adding/updating preprocessing instructions in system messages
 * 
 * @param {Array<object>} messages - Array of message objects
 * @param {string} formatType - The model format type
 * @param {object} options - Additional options for specific model types
 * @returns {Array<object>} Enhanced messages array
 */
function enhanceMessages(messages, formatType, options = {}) {
  if (!messages || !Array.isArray(messages)) {
    return messages;
  }
  
  // Create a copy of the messages array to avoid modifying the original
  const enhancedMessages = [...messages];
  
  // Check if there's a system message
  const systemIndex = enhancedMessages.findIndex(msg => msg.role === 'system');
  
  if (systemIndex !== -1) {
    // Enhance existing system message
    enhancedMessages[systemIndex] = {
      ...enhancedMessages[systemIndex],
      content: enhanceSystemMessage(enhancedMessages[systemIndex].content, formatType, options)
    };
  } else {
    // Add new system message with preprocessing instructions
    enhancedMessages.unshift({
      role: 'system',
      content: enhanceSystemMessage('', formatType, options)
    });
  }
  
  return enhancedMessages;
}

module.exports = {
  getPreprocessingInstructions,
  enhanceSystemMessage,
  enhanceMessages
};
