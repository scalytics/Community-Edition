/**
 * Cohere Provider Module
 * 
 * Handles discovery, management, and streaming of Cohere models
 */
const axios = require('axios');

/**
 * Discover Cohere models using the API
 * @param {Object} options - Discovery options
 * @param {string} options.apiKey - Cohere API key
 * @returns {Promise<Array>} - Array of discovered models
 */
async function discoverModels(options = {}) {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      console.log('No API key provided for Cohere model discovery');
      return { models: [], error: 'API key is required' };
    }
    
    // Validate the API key first
    const validationResult = await validateApiKey(apiKey);
    
    if (!validationResult.isValid) {
      console.error(`Invalid API key provided for Cohere model discovery: ${validationResult.errorMessage}`);
      return { models: [], error: validationResult.errorMessage };
    }
    
    // Cohere doesn't have a dedicated models list endpoint in their public API
    // so we'll return our known models list
    const models = [
      {
        id: 'command',
        name: 'Command',
        description: 'Cohere Command model - general purpose language model',
        context_window: 4096
      },
      {
        id: 'command-light',
        name: 'Command Light',
        description: 'Lightweight version of Cohere Command model',
        context_window: 4096
      },
      {
        id: 'command-r',
        name: 'Command-R',
        description: 'Improved version of Command model with reasoning capabilities',
        context_window: 4096
      },
      {
        id: 'command-r-plus',
        name: 'Command-R Plus',
        description: 'Enhanced version of Command-R with expanded capabilities',
        context_window: 4096
      },
      {
        id: 'embed-english-v3.0',
        name: 'Embed English v3.0',
        description: 'English embedding model v3.0',
        context_window: 2048
      },
      {
        id: 'embed-multilingual-v3.0',
        name: 'Embed Multilingual v3.0',
        description: 'Multilingual embedding model v3.0',
        context_window: 2048
      }
    ];
    
    console.log(`Discovered ${models.length} Cohere models with valid API key`);
    return { models, error: null };
  } catch (error) {
    console.error('Error discovering Cohere models:', error.message);
    const errorMessage = error.response ? 
      `API error (${error.response.status}): ${error.response.data?.error?.message || error.message}` : 
      `Network error: ${error.message}`;
    
    return { models: [], error: errorMessage };
  }
}

/**
 * Get default Cohere models
 * @returns {Array} - Array of default model specifications
 */
function getDefaultModels() {
  return [
    { id: 'command', name: 'Command' },
    { id: 'command-r', name: 'Command-R' }
  ];
}

/**
 * Validate a Cohere API key
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
    // Make a simple request to the Cohere API
    const response = await axios.post(
      'https://api.cohere.ai/v1/tokenize',
      { text: 'Test message for API key validation' },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return { 
      isValid: response.status === 200, 
      errorMessage: null 
    };
  } catch (error) {
    console.error('Error validating Cohere API key:', error.message);
    
    let errorMessage = error.message;
    
    // Format better error messages for common errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        errorMessage = "The API key is invalid or has expired";
      } else if (status === 403) {
        errorMessage = "The API key doesn't have permission to access Cohere services";
      } else if (status === 429) {
        errorMessage = "Rate limit exceeded for this API key";
      } else {
        errorMessage = `API returned error status ${status}: ${error.response.data?.message || 'Unknown error'}`;
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
      errorMessage: `Cohere API validation error: ${errorMessage}`
    };
  }
}

/**
 * Stream chat completion from Cohere API
 * @param {Object} options - Options for streaming
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function streamChat(options) {
  const {
    apiKey,
    modelId,
    message,
    chatHistory,
    streamingContext,
    abortSignal, // Accept abortSignal
    onToken // Accept onToken callback
  } = options;

  if (typeof onToken !== 'function') {
    console.warn('[Cohere Stream] onToken callback is not a function, streaming will not work.');
    // Optionally reject or handle this case differently
  }
  
  // Make the API call with stream response type
  const response = await axios.post(
    'https://api.cohere.ai/v1/chat',
    {
      model: modelId || 'command',
      message,
      chat_history: chatHistory,
      stream: true
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      signal: abortSignal // Pass the signal to axios
    }
  );
  
  let fullMessage = '';
  
  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      try {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const token = parsed.text_generation?.text || '';
              
              if (token && typeof onToken === 'function') {
                fullMessage += token;
                // Use the onToken callback instead of broadcasting
                onToken(token);
              }
            } catch (parseError) {
              console.error('Error parsing Cohere stream data:', parseError);
            }
          }
        }
      } catch (error) {
        console.error('Error processing Cohere stream chunk:', error);
      }
    });
    
    response.data.on('end', () => {
      // Don't broadcast completion here. The calling function (stream.js) handles this via eventBus.
      resolve({
        message: fullMessage,
        provider: 'Cohere (Stream)',
        streaming: true
      });
    });
    
    response.data.on('error', (error) => {
      console.error('Cohere stream error:', error);
      reject(error);
    });
  });
}

/**
 * Regular chat completion from Cohere API (non-streaming)
 * @param {Object} options - Options for completion
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function chat(options) {
  const {
    apiKey,
    modelId,
    message,
    chatHistory,
    abortSignal // Accept abortSignal
  } = options;
  
  const response = await axios.post(
    'https://api.cohere.ai/v1/chat',
    {
      model: modelId || 'command',
      message,
      chat_history: chatHistory
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: abortSignal // Pass the signal to axios
    }
  );
  
  return {
    message: response.data.text,
    provider: 'Cohere'
  };
}

module.exports = {
  name: 'Cohere',
  description: 'Cohere API for Command models',
  discoverModels,
  getDefaultModels,
  validateApiKey,
  streamChat,
  chat
};
