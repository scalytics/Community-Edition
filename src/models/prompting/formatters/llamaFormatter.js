/**
 * Enhanced formatter for Llama family models (Llama 2, Llama 3)
 * Based on the official Meta implementation from https://github.com/meta-llama/llama3/blob/main/llama/generation.py
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
 * Determine if model is Llama 3 based on model name or path
 * @param {string} modelNameOrPath - Model name or path
 * @returns {boolean} True if Llama 3, false if Llama 2
 */
function isLlama3(modelNameOrPath) {
  if (!modelNameOrPath) return false;
  const lowerName = modelNameOrPath.toLowerCase();
  return lowerName.includes('llama-3') || 
         lowerName.includes('llama3') || 
         lowerName.includes('llama_3');
}

/**
 * Format messages for Llama models, handling both Llama 2 and Llama 3 formats.
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
    // Handle empty messages, potentially including custom prompt
    const isLlama3Format = modelNameOrPath ? isLlama3(modelNameOrPath) : true;
    if (isLlama3Format) {
      return `<s>[INST] <<SYS>>\n${systemPromptContent}\n<</SYS>>\n\n [/INST]`; // Llama 3 needs INST tags even if empty
    } else {
      return `<s>[INST] <<SYS>>\n${systemPromptContent}\n<</SYS>>\n\n [/INST]`; // Llama 2 format is similar here
    }
  }

  // Determine if using Llama 3 format
  const isLlama3Format = modelNameOrPath ? isLlama3(modelNameOrPath) : true; // Default to Llama 3 format if not specified

  // Pass determined system prompt content down
  return isLlama3Format
    ? formatLlama3(messages, systemPromptContent) // Pass content directly
    : formatLlama2(messages, systemPromptContent); // Pass content directly
}

// REMOVED local determineSystemPrompt helper function

/**
 * Format messages specifically for Llama 2
 * @param {Array<object>} messages - Message history
 * @param {string} [systemPromptContent] - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatLlama2(messages, systemPromptContent = null) {
  const systemPrompt = systemPromptContent || 'You are a helpful assistant.'; // Use default if null

  // Start with B_INST token and system prompt
  let formattedPrompt = `<s>[INST] <<SYS>>\n${systemPrompt}\n<</SYS>>\n\n`;

  // Filter out system messages as they are now handled by determineSystemPrompt
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  // Process conversation turns
  for (let i = 0; i < nonSystemMessages.length; i++) {
    const message = nonSystemMessages[i];

    if (message.role === 'user') {
      const contentText = getContentText(message.content); // Use helper
      // For the first user message (i=0), the prompt is already started correctly
      // after the system message.
      if (i === 0) {
        formattedPrompt += contentText + ' [/INST]';
      } else {
        // For subsequent user messages, ensure the previous assistant turn
        // was closed with </s> and start the new turn with <s>[INST]
        formattedPrompt += `<s>[INST] ${contentText} [/INST]`;
      }
    } else if (message.role === 'assistant') {
      const contentText = getContentText(message.content); // Use helper
      // Append assistant's response and close the turn with </s>
      formattedPrompt += ` ${contentText}</s>`;
    }
  }
  
  return formattedPrompt;
}

/**
 * Format messages specifically for Llama 3 following official implementation
 * @param {Array<object>} messages - Message history
 * @param {string} [systemPromptContent] - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatLlama3(messages, systemPromptContent = null) {
  // Filter out system messages first, as the determined prompt is passed in
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  let formattedPrompt = '';
  
  // Initialize conversation with BOS token
  formattedPrompt = '<s>';
  
  // Process conversation turns using the filtered messages
  for (let i = 0; i < nonSystemMessages.length; i++) {
    const message = nonSystemMessages[i];

    if (message.role === 'user') {
      // Start user message with [INST] tag
      const contentText = getContentText(message.content); // Use helper
      // For the first user message, include the determined system prompt if it exists
      if (i === 0 && systemPromptContent) {
        formattedPrompt += `[INST] <<SYS>>\n${systemPromptContent}\n<</SYS>>\n\n${contentText} [/INST]`;
      } else {
        formattedPrompt += `[INST] ${contentText} [/INST]`;
      }
    } else if (message.role === 'assistant') {
      const contentText = getContentText(message.content); // Use helper
      // Just add assistant's response
      formattedPrompt += ` ${contentText}`;
      
      // Add EOS token at the end of assistant messages to close the turn
      // This is one of the key improvements in the Llama 3 format
      formattedPrompt += '</s>';
      
      // Start a new conversation turn with BOS token if not the last message
      if (i < messages.length - 1) {
        formattedPrompt += '<s>';
      }
    }
  }
  
  // If the last message was from the user, the model needs to generate an assistant response
  // No need to add any additional tags
  
  return formattedPrompt;
}

module.exports = {
  format,
  isLlama3,
  formatLlama2,
  formatLlama3
};
