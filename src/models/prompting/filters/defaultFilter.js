/**
 * Default response filter and context manager.
 * Uses a simple character-based estimation for token counting, removing the
 * dependency on a dedicated tokenizer service.
 */
const { format: defaultFormat } = require('../formatters/defaultFormatter');

// Simple token estimation: average of 4 chars per token.
const estimateTokens = (text) => Math.ceil(text.length / 4);

/**
 * Default response sanitizer.
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  let cleanedResponse = response;

  // Basic echo removal
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }

  // Remove common instruction/system tags (can be expanded)
  cleanedResponse = cleanedResponse.replace(/\[INST\].*?\[\/INST\]/gs, ''); // Escaped
  cleanedResponse = cleanedResponse.replace(/<<SYS>>.*?<<\/SYS>>/gs, ''); // Escaped
  cleanedResponse = cleanedResponse.replace(/<start_of_turn>.*?<end_of_turn>/gs, '');
  cleanedResponse = cleanedResponse.replace(/<\|.*?\|>/g, ''); // Generic tag removal

  // Remove common start/end tokens
  cleanedResponse = cleanedResponse.replace(/<\/?s>/g, '');
  cleanedResponse = cleanedResponse.replace(/<bos>/g, '');
  cleanedResponse = cleanedResponse.replace(/<eos>/g, '');

  // Code block/shebang fixes removed - Let frontend handle.

  return cleanedResponse.trim();
}

/**
 * Counts the tokens in a message history using a simple estimation.
 * @param {Array<object>} messages - Message history array.
 * @returns {Promise<number>} Estimated token count.
 */
async function countTokens(messages) {
  const fullText = messages.map(m => m.content || '').join('\n');
  return estimateTokens(fullText);
}

/**
 * Validates if a message history fits within a context window using estimation.
 * @param {Array<object>} messages - Message history.
 * @param {number} contextSize - Model's context window size.
 * @returns {Promise<object>} Validation result with token counts and status.
 */
async function validateContext(messages, contextSize) {
  const estimatedTokens = await countTokens(messages);
  const isTooLong = estimatedTokens >= contextSize;
  return {
    estimatedTokens,
    contextSize,
    isTooLong,
  };
}

/**
 * Truncates message history to fit within context window using estimation.
 * @param {Array<object>} messages - Message history.
 * @param {number} contextSize - Model's context window size.
 * @param {number} [safetyMargin=0.90] - Safety margin (e.g., 0.90 = 90%).
 * @returns {Promise<Array<object>>} Truncated message history.
 */
async function truncateHistory(messages, contextSize, safetyMargin = 0.90) {
  const maxTokens = Math.floor(contextSize * safetyMargin);
  let currentMessages = [...messages];
  let estimatedTokens = await countTokens(currentMessages);

  while (estimatedTokens > maxTokens && currentMessages.length > 1) {
    // Remove the oldest non-system message
    const firstInteractiveIndex = currentMessages.findIndex(m => m.role !== 'system');
    if (firstInteractiveIndex === -1) {
      // No non-system messages to remove, break to avoid infinite loop
      break;
    }
    currentMessages.splice(firstInteractiveIndex, 1);
    estimatedTokens = await countTokens(currentMessages);
  }

  return currentMessages;
}

module.exports = {
  sanitize,
  countTokens,
  validateContext,
  truncateHistory
};
