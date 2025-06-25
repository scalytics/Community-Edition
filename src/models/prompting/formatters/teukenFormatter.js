/**
 * Formatter for Teuken models
 * Implements the specific "System: ...\nUser: ...\nAssistant:" format.
 */

// Default system messages, can be expanded or configured elsewhere
const DEFAULT_SYSTEM_MESSAGES = {
  "EN": "A chat between a human and an artificial intelligence assistant. The assistant gives helpful and polite answers to the human's questions.",
  "DE": "Ein Gespräch zwischen einem Menschen und einem Assistenten mit künstlicher Intelligenz. Der Assistent gibt hilfreiche und höfliche Antworten auf die Fragen des Menschen."
  // Other language options can be added here
};

/**
 * Format messages for Teuken models
 * @param {Array<object>} messages - Array of message objects with role and content
 * @param {string} [modelName] - Optional model name (unused in this version)
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null). If null, uses default.
 * @param {string} [langCode='EN'] - Language code for the system message.
 * @returns {string} Formatted prompt string
 */
function format(messages, modelName = null, finalSystemPrompt = null, langCode = 'EN') {
  let systemMessageContent = finalSystemPrompt;

  if (!systemMessageContent) {
    systemMessageContent = DEFAULT_SYSTEM_MESSAGES[langCode.toUpperCase()] || DEFAULT_SYSTEM_MESSAGES["EN"];
  }
  
  const systemPromptFormatted = `System: ${systemMessageContent.trim()}`;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return `${systemPromptFormatted}\nAssistant:`;
  }

  const history = messages
    .filter(msg => msg.role !== 'system') // System prompt is handled above
    .map(msg => {
      let contentText = '';
      if (typeof msg.content === 'string') {
        contentText = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentText = msg.content
          .filter(part => part.type === 'text' && part.text)
          .map(part => part.text)
          .join('\n');
      }

      if (msg.role === 'user') return `User: ${contentText}`;
      if (msg.role === 'assistant') return `Assistant: ${contentText}`;
      // Fallback for other roles, though Teuken format seems to primarily use User/Assistant
      return `${msg.role}: ${contentText}`; 
    })
    .join('\n'); // Teuken format uses single newline between turns

  return `${systemPromptFormatted}\n${history}\nAssistant:`;
}

module.exports = { format };
