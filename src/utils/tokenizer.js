/**
 * Provides simple token counting utilities.
 * NOTE: These are rough approximations and do not replace proper tokenization.
 */

/**
 * Approximates the number of tokens in a given text string.
 * A common rule of thumb is ~4 characters per token for English text.
 * This is highly inaccurate for code or non-English languages.
 * @param {string} text - The text to count tokens for.
 * @returns {number} An approximate token count.
 */
function approximateTokenCount(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  // Simple approximation: 1 token per 4 characters. Adjust if needed.
  return Math.ceil(text.length / 4);
}

module.exports = {
  approximateTokenCount,
};
