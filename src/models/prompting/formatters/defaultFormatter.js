/**
 * Default formatter for models without a specific format
 * Uses a simple Human/Assistant format that works with most basic models
 */

/**
 * Format messages into a basic Human/Assistant prompt
 * @param {Array<object>} messages - Array of message objects with role and content
 * @param {string} [userCustomPrompt] - Optional custom system prompt from user settings
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null)
 * @returns {string} Formatted prompt string
 */
function format(messages, finalSystemPrompt = null) { 
  const systemPrompt = finalSystemPrompt;

  // Format the system prompt part ONLY if systemPrompt has content.
  const systemPromptFormatted = (systemPrompt && systemPrompt.trim()) ? `${systemPrompt.trim()}\n\n` : '';

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return `${systemPromptFormatted}Assistant:`;
  }

  // Format the actual conversation excluding system messages handled by determineSystemPrompt
  const history = messages
    .filter(msg => msg.role !== 'system')
    .map(msg => {
      // Handle both string and array content
      let contentText = '';
      if (typeof msg.content === 'string') {
        contentText = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text from text parts, join them. Ignore non-text parts for this basic formatter.
        contentText = msg.content
          .filter(part => part.type === 'text' && part.text)
          .map(part => part.text)
          .join('\n'); // Join multiple text parts with a newline
      }

      if (msg.role === 'user') return `Human: ${contentText}`;
      if (msg.role === 'assistant') return `Assistant: ${contentText}`;
      return `${msg.role}: ${contentText}`; // Fallback for other roles
    })
    .join('\n\n');

  // Combine system prompt with history and add final turn indicator
  return `${systemPromptFormatted}${history}\n\nAssistant:`;
}


module.exports = { format };
