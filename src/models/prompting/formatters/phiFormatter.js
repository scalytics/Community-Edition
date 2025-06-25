/**
 * Enhanced prompt formatter for Phi family models (Phi-3 and Phi-4).
 * Supports both standard and multimodal variants.
 * 
 * References:
 * - Phi-3: https://huggingface.co/microsoft/Phi-3-mini-4k-instruct#chat-format
 * - Phi-4: https://huggingface.co/microsoft/Phi-4-multimodal-instruct/blob/main/sample_inference_phi4mm.py
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
 * Determine if model is Phi-4 based on model name or path
 * @param {string} modelNameOrPath - Model name or path
 * @returns {boolean} True if Phi-4, false otherwise
 */
function isPhi4(modelNameOrPath) {
  if (!modelNameOrPath) return false;
  const lowerName = modelNameOrPath.toLowerCase();
  return lowerName.includes('phi-4') || lowerName.includes('phi4');
}

/**
 * Formats a message history for Phi models, handling both Phi-3 and Phi-4 formats.
 * @param {Array<object>} messages - Message history array (e.g., [{ role: 'user', content: 'Hi' }]).
 * @param {string} [modelNameOrPath] - Optional model name or path to determine format version
 * @param {string} [modelNameOrPath] - Optional model name or path to determine format version
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null)
 * @returns {string} Formatted prompt string.
 */
function format(messages, modelNameOrPath, finalSystemPrompt = null) { // Updated params
  // Use the passed-in finalSystemPrompt directly
  const systemPromptContent = finalSystemPrompt;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    // Handle empty messages, including the final system prompt based on format
    const isPhi4Format = isPhi4(modelNameOrPath);
    if (isPhi4Format) {
      return `<|system|>\n${systemPromptContent}\n<|assistant|>\n`;
    } else {
      return `<|system|>\n${systemPromptContent}<|end|>\n<|assistant|>\n`;
    }
  }

  // Determine if using Phi-4 format
  const isPhi4Format = isPhi4(modelNameOrPath);

  // Pass the final system prompt down
  return isPhi4Format
    ? formatPhi4(messages, systemPromptContent)
    : formatPhi3(messages, systemPromptContent);
}

// REMOVED local determineSystemPrompt helper function

/**
 * Format messages specifically for Phi-3 models
 * @param {Array<object>} messages - Message history
 * @param {string|null} systemPromptContent - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatPhi3(messages, systemPromptContent = null) { // Updated params
  let prompt = '';
  let hasSystem = !!systemPromptContent; // Track if we have a system prompt to add

  // Filter out original system messages as they are handled by the finalSystemPrompt
  const chatMessages = messages.filter(msg => msg.role !== 'system');

  // Process messages
  chatMessages.forEach((msg, index) => {
     if (msg.role === 'user') {
      // Add system prompt (determined one) before the very first user message
      if (!hasSystem && index === 0) { // Check if it's the first message overall in the filtered list
         const systemToAdd = systemPromptContent || 'You are a helpful AI assistant.'; // Use default if null
         prompt += `<|system|>\n${systemToAdd}<|end|>\n`;
         hasSystem = true; // Mark system prompt as added
      }
      const userContentText = getContentText(msg.content); // Use helper
      prompt += `<|user|>\n${userContentText}<|end|>\n`;
    } else if (msg.role === 'assistant') {
      const assistantContentText = getContentText(msg.content); // Use helper
      prompt += `<|assistant|>\n${assistantContentText}<|end|>\n`;
    }
  });

  // Ensure the prompt ends correctly to signal the model to generate
  prompt += '<|assistant|>\n';

  return prompt;
}

/**
 * Format messages specifically for Phi-4 models
 * Based on Microsoft's official sample code
 * @param {Array<object>} messages - Message history
 * @param {string|null} systemPromptContent - Determined system prompt content (could be null)
 * @returns {string} Formatted prompt
 */
function formatPhi4(messages, systemPromptContent = null) { // Updated params
  let prompt = '';
  // Use the passed-in system prompt directly, or a default
  const systemPrompt = systemPromptContent || 'You are a helpful AI assistant.';

  // Filter out original system messages
  const chatMessages = messages.filter(m => m.role !== 'system');

  // Add system message (handled differently in Phi-4)
  prompt += `<|system|>\n${systemPrompt}\n`;

  // Process conversation turns (using the filtered messages array)
  for (let i = 0; i < chatMessages.length; i++) {
    const message = chatMessages[i];
    const contentText = getContentText(message.content); // Use helper

    if (message.role === 'user') {
      prompt += `<|user|>\n${contentText}\n`;
    } else if (message.role === 'assistant') {
      prompt += `<|assistant|>\n${contentText}\n`;
    }
  }

  // Add final assistant tag to indicate the model should generate
  if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'assistant') {
    prompt += `<|assistant|>\n`;
  }
  
  return prompt;
}

module.exports = {
  format,
  isPhi4,
  formatPhi3,
  formatPhi4
};
