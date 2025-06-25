/**
 * Utility functions to format responses according to the OpenAI API specification.
 */

/**
 * Formats a chunk for an OpenAI SSE stream response.
 * 
 * @param {string} modelName - The name of the model used.
 * @param {string | null} contentDelta - The new token/content chunk, or null for the final chunk.
 * @param {object | null} usage - Optional usage statistics for the final chunk.
 * @returns {object} The formatted OpenAI stream chunk object.
 */
function formatOpenAIStreamChunk(modelName, contentDelta, usage = null) {
  const chunk = {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`, // Generate a unique chunk ID
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: null,
      },
    ],
  };

  if (contentDelta !== null) {
    // Regular content chunk
    chunk.choices[0].delta = { content: contentDelta };
    chunk.choices[0].finish_reason = null;
  } else {
    // Final chunk (indicates end of stream)
    chunk.choices[0].delta = {}; // Empty delta for final chunk
    chunk.choices[0].finish_reason = 'stop'; // Or other reasons like 'length' if applicable
  }

  // Add usage stats to the final chunk if provided
  if (usage && contentDelta === null) {
    chunk.usage = usage; // { prompt_tokens: ..., completion_tokens: ..., total_tokens: ... }
  }

  return chunk;
}

/**
 * Formats a complete OpenAI chat completion response (non-streaming).
 * 
 * @param {string} modelName - The name of the model used.
 * @param {string} fullContent - The complete response content from the assistant.
 * @param {object} usage - Usage statistics { prompt_tokens, completion_tokens, total_tokens }.
 * @returns {object} The formatted OpenAI chat completion response object.
 */
function formatOpenAIResponse(modelName, fullContent, usage) {
  return {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`, // Generate a unique response ID
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: fullContent,
        },
        finish_reason: 'stop', // Or other reasons like 'length' if applicable
      },
    ],
    usage: usage, // { prompt_tokens: ..., completion_tokens: ..., total_tokens: ... }
  };
}

module.exports = {
  formatOpenAIStreamChunk,
  formatOpenAIResponse,
};
