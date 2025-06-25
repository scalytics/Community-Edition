/**
 * Enhanced formatter for Mistral family models (Mistral, Mixtral)
 * Uses the specific Mistral chat template format based on Mistral Common
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
 * Format messages for Mistral models
 * Follows the official Mistral chat template structure with proper BOS/EOS tokens
 * Template: `<s>[INST] {system_prompt}{user_prompt_1} [/INST] {assistant_response_1}</s><s>[INST] {user_prompt_2} [/INST] {assistant_response_2}</s>...`
 * @param {string} [userCustomPrompt] - Optional custom system prompt from user settings
 * @param {string|null} finalSystemPrompt - The pre-determined system prompt string (or null)
 * @returns {string} Formatted prompt string
 */
function format(messages, finalSystemPrompt = null) { // Updated params
  // Use the passed-in finalSystemPrompt directly
  const systemPromptContent = finalSystemPrompt;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    // Return a minimal valid prompt if no messages provided
    return `[INST] ${systemPromptContent || 'You are a helpful assistant.'} [/INST]`; // Removed leading <s>
  }

  // Filter out system messages as they are handled by the finalSystemPrompt
  const messagesToProcess = messages.filter(msg => msg.role !== 'system');

  let formattedPrompt = '';
  // Initialize with empty array for easier handling of conversation turns
  const turns = [];
  
  // Group user/assistant messages into turns
  let currentTurn = null;
  
  for (const message of messagesToProcess) {
    // Start a new turn with user message
    if (message.role === 'user') {
      // Close previous turn if it exists
      if (currentTurn) {
        turns.push(currentTurn);
      }
      
      const userContentText = getContentText(message.content); // Use helper
      currentTurn = {
        user: userContentText,
        assistant: null
      };
    } 
    // Add assistant response to the current turn
    else if (message.role === 'assistant' && currentTurn) {
      const assistantContentText = getContentText(message.content); // Use helper
      currentTurn.assistant = assistantContentText;
    }
    // Ignore other roles
  }
  
  // Add the last turn if it exists
  if (currentTurn) {
    turns.push(currentTurn);
  }
  
  // Format turns with proper BOS/EOS tokens
  for (let i = 0; i < turns.length; i++) {
    const { user, assistant } = turns[i];

    // For the first turn, include the determined system prompt.
    if (i === 0) {
      // Only add system prompt if it exists and is not empty/whitespace
      const systemPart = systemPromptContent?.trim() ? `${systemPromptContent}\n\n` : '';
      // REMOVED leading <s>
      formattedPrompt += `[INST] ${systemPart}${user} [/INST]`;
    } else {
      // Subsequent turns
      // REMOVED leading <s>
      formattedPrompt += `[INST] ${user} [/INST]`;
    }

    // Add assistant response if available
    if (assistant !== null) {
      formattedPrompt += ` ${assistant.trim()}</s>`;
    }
    // If no assistant response (last user message), leave it open for the model to complete
  }
  
  // If the last turn doesn't have an assistant response,
  // the prompt already ends correctly with [/INST] for the model to complete

  return formattedPrompt;
}

// REMOVED local determineSystemPrompt helper function

module.exports = { format };
