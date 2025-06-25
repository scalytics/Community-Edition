/**
 * Enhanced prompt formatter for Google Gemma models
 * Based on official documentation: https://ai.google.dev/gemma/docs/core/prompt-structure
 *
 * This implements Google's official chat template format with proper turn handling.
 */

/**
 * Helper function to extract text content from string or array format.
 * @param {string|Array<object>} content - The message content.
 * @returns {string} The extracted text content.
 */
function getContentText(content) {
  if (typeof content === 'string') {
    return content;
  } else if (Array.isArray(content)) {
    // Extract text from text parts, join them. Ignore non-text parts.
    return content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n'); // Join multiple text parts with a newline
  }
  return ''; // Return empty string if content is neither string nor array or has no text parts
}


/**
 * Determine if model is Gemma 2 based on model name or path
 * @param {string} modelNameOrPath - Model name or path
 * @returns {boolean} True if Gemma 2 or newer, false if original Gemma
 */
function isGemma2(modelNameOrPath) {
  if (!modelNameOrPath) return false;
  const lowerName = modelNameOrPath.toLowerCase();
  return lowerName.includes('gemma-2') ||
         lowerName.includes('gemma2') ||
         lowerName.includes('gemma_2');
}

// REMOVED local determineSystemPrompt helper function

/**
 * Formats a message history for Gemma models following Google's specifications.
 * @param {Array<object>} messages - Message history array (e.g., [{ role: 'user', content: 'Hi' }]).
 * @param {string} [modelNameOrPath] - Optional model name or path to determine format version
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null)
 * @returns {string} Formatted prompt string.
 */
function format(messages, modelNameOrPath, finalSystemPrompt = null) { // Updated params
  // Use the passed-in finalSystemPrompt directly
  const systemPromptContent = finalSystemPrompt;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    // If only system prompt, format it as the first user turn
    return systemPromptContent
      ? `<start_of_turn>user\n${systemPromptContent}\n<end_of_turn>\n\n<start_of_turn>model\n`
      : '<start_of_turn>model\n'; // Default if no messages and no system prompt
  }

  let prompt = '';
  // Filter out system messages as they are handled by determineSystemPrompt
  let chatMessages = messages.filter(msg => msg.role !== 'system');

  // Find the first user message to prepend system content
  const firstUserIndex = chatMessages.findIndex(msg => msg.role === 'user');

  if (firstUserIndex !== -1 && systemPromptContent) {
    // Prepend system content to first user message
    // Create a new object for the modified first message to avoid mutating original
    const firstUserMessage = { ...chatMessages[firstUserIndex] };
    firstUserMessage.content = `${systemPromptContent}\n\n${firstUserMessage.content}`;
    chatMessages[firstUserIndex] = firstUserMessage; // Replace in the array
  } else if (systemPromptContent && chatMessages.length === 0) {
    // If only system prompt was provided (custom or default), create a user turn with it
    chatMessages.push({
      role: 'user',
      content: systemPromptContent
    });
  }

  // Process conversation turns using the modified chatMessages array
  chatMessages.forEach(msg => {
    const contentText = getContentText(msg.content); // Use helper
    if (msg.role === 'user') {
      // Always include newlines around turn markers as required by the docs
      prompt += `<start_of_turn>user\n${contentText}\n<end_of_turn>\n\n`;
    } else if (msg.role === 'assistant') {
      // Note: in Gemma, assistant role is 'model'
      prompt += `<start_of_turn>model\n${contentText}\n<end_of_turn>\n\n`;
    }
    // Other roles are ignored
  });

  // Add the start marker for the model's turn if the last message wasn't from the model
  if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'assistant') {
    prompt += '<start_of_turn>model\n';
  }

  return prompt;
}

module.exports = {
  format,
  isGemma2
};
