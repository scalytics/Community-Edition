/**
 * Enhanced formatter for DeepSeek family models (DeepSeek v1 and v3)
 * Based on official Ollama template: https://ollama.com/library/deepseek-v3/blobs/c5ce92dfece1
 */

/**
 * Determine if model is DeepSeek v3 based on model name or path
 * @param {string} modelNameOrPath - Model name or path
 * @returns {boolean} True if DeepSeek v3 or newer, false if earlier version
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
 * Determine if model is DeepSeek v3 based on model name or path
 * @param {string} modelNameOrPath - Model name or path
 * @returns {boolean} True if DeepSeek v3 or newer, false if earlier version
 */
function isDeepSeekV3(modelNameOrPath) {
  if (!modelNameOrPath) return false;
  const lowerName = modelNameOrPath.toLowerCase();
  return lowerName.includes('deepseek-v3') || 
         lowerName.includes('deepseek3') || 
         lowerName.includes('deepseek-3') ||
         lowerName.includes('deepseekv3');
}

/**
 * Format messages for DeepSeek models
 * @param {Array<object>} messages - Array of message objects with role and content
 * @param {string} [modelNameOrPath] - Optional model name or path to determine format version
 * @param {string} [modelNameOrPath] - Optional model name or path to determine format version
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null)
 * @returns {string} Formatted prompt string
 */
function format(messages, modelNameOrPath, finalSystemPrompt = null) { // Updated params
  // Use the passed-in finalSystemPrompt directly
  const systemPromptContent = finalSystemPrompt;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    // Handle empty case, potentially using the final system prompt
    return systemPromptContent ? `System: ${systemPromptContent}\n\nAssistant: ` : 'User: \nAssistant: '; // Adjust based on format needs
  }

  // Determine if using DeepSeek v3 format
  const isV3Format = modelNameOrPath ? isDeepSeekV3(modelNameOrPath) : false;

  // Pass the final system prompt down
  return isV3Format
    ? formatDeepSeekV3(messages, systemPromptContent)
    : formatDeepSeekV1(messages, systemPromptContent);
}

// REMOVED local determineSystemPrompt helper function

/**
 * Format messages specifically for DeepSeek v1
 * @param {Array<object>} messages - Message history
 * @param {string|null} systemPromptContent - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatDeepSeekV1(messages, systemPromptContent = null) { // Updated params
  // Use the passed-in system prompt directly
  const systemPrompt = systemPromptContent;

  // Format conversation following original DeepSeek pattern
  let formattedPrompt = systemPrompt ? `System: ${systemPrompt}\n\n` : '';

  // Filter out system messages as they are now handled by determineSystemPrompt
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  // Add each message with its role prefix
  nonSystemMessages.forEach(message => {
    const contentText = getContentText(message.content); // Use helper
    if (message.role === 'user') {
      formattedPrompt += `User: ${contentText}\n\n`; // Add double newline for clarity between turns
    } else if (message.role === 'assistant') {
      // Add assistant response and the required EOS token
      formattedPrompt += `Assistant: ${contentText}<｜end of sentence｜>\n\n`;
    }
  });
  
  // Add assistant prefix for the model to continue if the last message was from user
  if (nonSystemMessages.length === 0 || nonSystemMessages[nonSystemMessages.length - 1].role === 'user') {
    formattedPrompt += 'Assistant: ';
  }
  
  return formattedPrompt;
}

/**
 * Format messages specifically for DeepSeek v3 following official format
 * Based on https://ollama.com/library/deepseek-v3/blobs/c5ce92dfece1
 * @param {Array<object>} messages - Message history
 * @param {string|null} systemPromptContent - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatDeepSeekV3(messages, systemPromptContent = null) { // Updated params
  // Use the passed-in system prompt directly
  const systemPrompt = systemPromptContent;

  // DeepSeek v3 uses a different format with <｜begin_of_text｜> markers
  // The system prompt is included as part of the first Human message
  let formattedPrompt = `<｜begin_of_text｜>Human: ${systemPrompt}\n\n`;

  // Filter out system messages as they are now handled by determineSystemPrompt
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  // Process the conversation turns
  for (let i = 0; i < nonSystemMessages.length; i++) {
    const message = nonSystemMessages[i];

    const contentText = getContentText(message.content); // Use helper
    if (message.role === 'user') {
      // If this is the first user message AND we included a system prompt,
      // just append the user content.
      if (i === 0 && systemPrompt) { // Check if systemPrompt was determined
         formattedPrompt += `${contentText}\n\n`;
      } else {
         // Otherwise (no system prompt or not the first user message), add the standard Human prefix
         formattedPrompt += `Human: ${contentText}\n\n`;
      }
    } else if (message.role === 'assistant') {
      // DeepSeek v3 adds the end of sentence marker automatically
      formattedPrompt += `Assistant: ${contentText}\n\n`;
    }
  }
  
  // Add the final prompt for the assistant to continue if the last message was from a user
  if (nonSystemMessages.length === 0 || nonSystemMessages[nonSystemMessages.length - 1].role === 'user') {
    formattedPrompt += 'Assistant:';
  }
  
  return formattedPrompt;
}

module.exports = {
  format,
  isDeepSeekV3,
  formatDeepSeekV1,
  formatDeepSeekV3
};
