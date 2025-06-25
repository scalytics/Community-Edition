/**
 * Anthropic Provider Module
 * 
 * Handles discovery, management, and streaming of Anthropic models
 */
const axios = require('axios');

/**
 * Discover Anthropic models using the API
 * @param {Object} options - Discovery options
 * @param {string} options.apiKey - Anthropic API key
 * @returns {Promise<Array>} - Array of discovered models
 */
async function discoverModels(options = {}) {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      console.log('No API key provided for Anthropic model discovery');
      return { models: [], error: 'API key is required' };
    }
    
    // Validate the API key first
    const validationResult = await validateApiKey(apiKey);
    
    if (!validationResult.isValid) {
      console.error(`Invalid API key provided for Anthropic model discovery: ${validationResult.errorMessage}`);
      return { models: [], error: validationResult.errorMessage };
    }
    
    // Make a request to Anthropic API to list available models
    const response = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });
    
    if (!response.data || !response.data.data) {
      return { models: [], error: 'Unexpected API response format' };
    }
    
    // Map Anthropic API response to our model format
    const models = response.data.data.map(model => ({
      id: model.id,
      name: model.id,
      description: `Anthropic ${model.id} model`,
      context_window: getContextWindow(model.id)
    }));
    
    console.log(`Discovered ${models.length} Anthropic models with valid API key`);
    return { models, error: null };
  } catch (error) {
    console.error('Error discovering Anthropic models:', error.message);
    const errorMessage = error.response ? 
      `API error (${error.response.status}): ${error.response.data?.error?.message || error.message}` : 
      `Network error: ${error.message}`;
      
    return { models: [], error: errorMessage };
  }
}

/**
 * Get context window size for a model
 * @param {string} modelId - Model ID
 * @returns {number} - Context window size
 */
function getContextWindow(modelId) {
  // Anthropic context windows (values approximate as of last update)
  if (modelId.includes('claude-3')) {
    if (modelId.includes('opus')) return 200000;
    if (modelId.includes('sonnet')) return 180000;
    if (modelId.includes('haiku')) return 150000;
    return 180000; // Default for Claude 3
  }
  if (modelId.includes('claude-2')) return 100000;
  if (modelId.includes('claude-instant')) return 100000;
  return 100000; // Default for unknown models
}

/**
 * Get default Anthropic models
 * @returns {Array} - Array of default model specifications
 */
function getDefaultModels() {
  return [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    { id: 'claude-2.1', name: 'Claude 2.1' }
  ];
}

/**
 * Validate an Anthropic API key
 * @param {string} apiKey - API key to validate
 * @returns {Promise<{isValid: boolean, errorMessage: string|null}>} - Validation result with error details
 */
async function validateApiKey(apiKey) {
  if (!apiKey) {
    return { 
      isValid: false, 
      errorMessage: "API key is required"
    };
  }
  
  try {
    // Make a simple request to the Anthropic API
    const response = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });
    
    return { 
      isValid: response.status === 200, 
      errorMessage: null 
    };
  } catch (error) {
    console.error('Error validating Anthropic API key:', error.message);
    
    let errorMessage = error.message;
    
    // Format better error messages for common errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        errorMessage = "The API key is invalid or has expired";
      } else if (status === 403) {
        errorMessage = "The API key doesn't have permission to access Claude models";
      } else if (status === 429) {
        errorMessage = "Rate limit exceeded for this API key";
      } else {
        errorMessage = `API returned error status ${status}: ${error.response.data?.error?.message || 'Unknown error'}`;
      }
    } else if (error.message.includes('network') || 
              error.message.includes('timeout') || 
              error.message.includes('ECONNREFUSED')) {
      return { 
        isValid: true, 
        errorMessage: "Network error occurred, but the key format appears valid" 
      };
    }
    
    return {
      isValid: false,
      errorMessage: `Anthropic API validation error: ${errorMessage}`
    };
  }
}

/**
 * Stream completion from Anthropic's Claude API
 * @param {Object} options - Options for streaming
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function streamCompletion(options) {
  const {
    apiKey,
    modelId,
    payload,
    streamingContext,
    abortSignal, // Accept abortSignal
    onToken // Accept onToken callback
  } = options;

  // console.log('[anthropic.js] streamCompletion entry typeof onToken:', typeof onToken); // Removed log
  // console.log('[anthropic.js] streamCompletion entry options object:', options); // Removed log

  let tokenHandler = onToken;
  if (typeof tokenHandler !== 'function') {
    console.warn('[Anthropic Stream] onToken callback is not a function, streaming will not work.');
    // Create a fallback no-op function to prevent errors
    tokenHandler = (token) => {
      console.log('[Anthropic Stream] Using fallback token handler for token:', token.substring(0, 20) + (token.length > 20 ? '...' : ''));
    };
  }
  
  // Clone the payload to avoid modifying the original
  const streamingPayload = { ...payload, stream: true };
  
  // Use a consistent API version
  const apiVersion = '2023-06-01';

  // Log payload *without* circular references like abortSignal
  const loggablePayload = { ...streamingPayload };
  delete loggablePayload.abortSignal; // Exclude signal from log - This line might be removed if abortSignal is fully gone
  // console.log(`[Anthropic Stream] Sending Payload for ${modelId}:`, JSON.stringify(loggablePayload, null, 2)); // Removed log

  // Make the API call with stream response type
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    streamingPayload,
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': apiVersion,
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      signal: abortSignal // Pass the signal to axios
    }
  );
  
  let fullMessage = '';
  
  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      // console.log('[Anthropic Stream] Received data chunk.'); // Removed verbose logging
      // console.log('[Anthropic Stream] Raw Chunk:', chunk.toString()); // Optional: Log raw chunk content
      try {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta') {
                const token = parsed.delta?.text || '';
                if (token) {
                  fullMessage += token;
                  // Use the tokenHandler which is guaranteed to be a function
                  tokenHandler(token);
                }
              }
            } catch (parseError) {
              console.error('Error parsing Anthropic stream data:', parseError);
            }
          }
        }
      } catch (error) {
        console.error('Error processing Anthropic stream chunk:', error);
      }
    });
    
    response.data.on('end', () => {
      // Don't broadcast completion here. The calling function (stream.js) handles this via eventBus.
      resolve({
        message: fullMessage,
        provider: 'Anthropic (Stream)',
        streaming: true
      });
    });
    
    response.data.on('error', (error) => {
      console.error('[Anthropic Stream] Stream error:', error.message); // Keep error logging
      reject(error);
    });
  });
}

/**
 * Regular completion from Anthropic's Claude API (non-streaming)
 * @param {Object} options - Options for completion
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function completion(options) {
  const {
    apiKey,
    modelId,
    payload,
    abortSignal // Add abortSignal
  } = options;
  
  const apiVersion = '2023-06-01';

  // Log payload *without* circular references like abortSignal
  const loggablePayload = { ...payload };
  delete loggablePayload.abortSignal; // Exclude signal from log - This line might be removed if abortSignal is fully gone
  // console.log(`[Anthropic Completion] Sending Payload for ${modelId}:`, JSON.stringify(loggablePayload, null, 2)); // Removed log

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    payload,
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': apiVersion,
        'Content-Type': 'application/json'
      },
      signal: abortSignal // Pass the signal to axios
    }
  );
  
  if (!response.data || !response.data.content || response.data.content.length === 0) {
    throw new Error('Unexpected response structure from Anthropic API');
  }
  
  let messageText = '';
  const content = response.data.content[0];
  
  if (content && content.type === 'text' && content.text) {
    messageText = content.text;
  } else if (content && typeof content.text === 'string') {
    messageText = content.text;
  } else if (typeof content === 'string') {
    messageText = content;
  } else {
    messageText = JSON.stringify(content);
  }
  
  return {
    message: messageText,
    usage: {
      input_tokens: response.data.usage?.input_tokens || 0,
      output_tokens: response.data.usage?.output_tokens || 0
    },
    provider: 'Anthropic'
  };
}

/**
 * Prepare messages for Anthropic API format
 * @param {Array} messages - Array of message objects
 * @param {string} systemPrompt - Optional system prompt
 * @returns {Object} - Formatted payload for Anthropic API
 */
function preparePayload(messages, systemPrompt = '') {
  // Format messages as expected by Claude API
  const formattedMessages = messages.map(msg => {
    // Basic validation
    if (!msg.role) {
      throw new Error('Message missing role property');
    }
    
    // If content is already an array with the proper structure, use it
    if (Array.isArray(msg.content) && 
        msg.content.length > 0 && 
        msg.content[0].type === 'text') {
      return msg;
    }
    
    // Convert string content to the expected format
    let formattedContent;
    if (typeof msg.content === 'string') {
      formattedContent = [{ type: 'text', text: msg.content }];
    } else if (msg.content && typeof msg.content === 'object') {
      formattedContent = [{ type: 'text', text: JSON.stringify(msg.content) }];
    } else {
      throw new Error(`Invalid message content format: ${typeof msg.content}`);
    }
    
    return {
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: formattedContent
    };
  });

  const payload = {
    messages: formattedMessages,
    max_tokens: 1000
  };
  
  if (systemPrompt && systemPrompt.trim()) {
    payload.system = systemPrompt;
  }
  
  return payload;
}

module.exports = {
  name: 'Anthropic',
  description: 'Anthropic API for Claude models',
  discoverModels,
  getDefaultModels,
  validateApiKey,
  streamCompletion,
  completion,
  preparePayload
};
