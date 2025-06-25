/**
 * Mistral Provider Module
 * 
 * Handles discovery, management, and streaming of Mistral AI models
 */
const axios = require('axios');

/**
 * Discover Mistral models using the API
 * @param {Object} options - Discovery options
 * @param {string} options.apiKey - Mistral API key
 * @returns {Promise<Array>} - Array of discovered models
 */
async function discoverModels(options = {}) {
  try {
    const apiKey = options.apiKey;
    
    if (!apiKey) {
      console.log('No API key provided for Mistral model discovery');
      return { models: [], error: 'API key is required' };
    }
    
    // Validate the API key first
    const validationResult = await validateApiKey(apiKey);
    
    if (!validationResult.isValid) {
      console.error(`Invalid API key provided for Mistral model discovery: ${validationResult.errorMessage}`);
      return { models: [], error: validationResult.errorMessage };
    }
    
    // Make a request to Mistral API to list available models
    const response = await axios.get('https://api.mistral.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.data || !response.data.data) {
      return { models: [], error: 'Unexpected API response format' };
    }
    
    // Map Mistral API response to our model format
    const models = response.data.data.map(model => ({
      id: model.id,
      name: model.id,
      description: getModelDescription(model.id),
      context_window: getContextWindow(model.id)
    }));
    
    console.log(`Discovered ${models.length} Mistral models with valid API key`);
    return { models, error: null };
  } catch (error) {
    console.error('Error discovering Mistral models:', error.message);
    const errorMessage = error.response ? 
      `API error (${error.response.status}): ${error.response.data?.error?.message || error.message}` : 
      `Network error: ${error.message}`;
    
    return { models: [], error: errorMessage };
  }
}

/**
 * Get a human-readable description for a model
 * @param {string} modelId - Model ID
 * @returns {string} - Description
 */
function getModelDescription(modelId) {
  const id = modelId.toLowerCase();
  
  if (id.includes('medium')) {
    return 'Mistral Medium - Balanced performance and capabilities';
  } else if (id.includes('small')) {
    return 'Mistral Small - Fast and efficient model';
  } else if (id.includes('large')) {
    return 'Mistral Large - Most capable Mistral AI model';
  } else if (id.includes('tiny')) {
    return 'Mistral Tiny - Lightweight model for basic tasks';
  } else if (id.includes('embed')) {
    return 'Mistral Embedding - Text embedding model';
  }
  
  return `Mistral ${modelId} model`;
}

/**
 * Get context window size for a model
 * @param {string} modelId - Model ID
 * @returns {number} - Context window size
 */
function getContextWindow(modelId) {
  const id = modelId.toLowerCase();
  
  if (id.includes('large-2')) return 32768;
  if (id.includes('large')) return 32768;
  if (id.includes('medium')) return 32768;
  if (id.includes('small')) return 32768;
  if (id.includes('tiny')) return 32768;
  if (id.includes('embed')) return 8192;
  
  return 32768; // Default for most Mistral models
}

/**
 * Get default Mistral models
 * @returns {Array} - Array of default model specifications
 */
function getDefaultModels() {
  return [
    { id: 'mistral-large-latest', name: 'Mistral Large' },
    { id: 'mistral-medium', name: 'Mistral Medium' },
    { id: 'mistral-small-latest', name: 'Mistral Small' }
  ];
}

/**
 * Validate a Mistral API key
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
    // Make a simple request to the Mistral API
    const response = await axios.get('https://api.mistral.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    return { 
      isValid: response.status === 200, 
      errorMessage: null 
    };
  } catch (error) {
    console.error('Error validating Mistral API key:', error.message);
    
    let errorMessage = error.message;
    
    // Format better error messages for common errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        errorMessage = "The API key is invalid or has expired";
      } else if (status === 403) {
        errorMessage = "The API key doesn't have permission to access Mistral models";
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
      errorMessage: `Mistral API validation error: ${errorMessage}`
    };
  }
}

/**
 * Stream completion from Mistral API
 * @param {Object} options - Options for streaming
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function streamCompletion(options) {
  const {
    apiKey,
    modelId,
    messages,
    streamingContext,
    abortSignal, // Accept abortSignal
    onToken // Accept onToken callback
  } = options;

  if (typeof onToken !== 'function') {
    console.warn('[Mistral Stream] onToken callback is not a function, streaming will not work.');
    // Optionally reject or handle this case differently
  }
  
  // Make the API call with stream response type
  const response = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: modelId || 'mistral-medium',
      messages,
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
              const token = parsed.choices?.[0]?.delta?.content || '';
              
              if (token && typeof onToken === 'function') {
                fullMessage += token;
                // Use the onToken callback instead of broadcasting
                onToken(token);
              }
            } catch (parseError) {
              console.error('Error parsing Mistral stream data:', parseError);
            }
          }
        }
      } catch (error) {
        console.error('Error processing Mistral stream chunk:', error);
      }
    });
    
    response.data.on('end', () => {
      // Don't broadcast completion here. The calling function (stream.js) handles this via eventBus.
      resolve({
        message: fullMessage,
        provider: 'Mistral (Stream)',
        streaming: true
      });
    });
    
    response.data.on('error', (error) => {
      console.error('Mistral stream error:', error);
      reject(error);
    });
  });
}

/**
 * Regular completion from Mistral API (non-streaming)
 * @param {Object} options - Options for completion
 * @returns {Promise<Object>} - Promise resolving to completion result
 */
async function completion(options) {
  const {
    apiKey,
    modelId,
    messages,
    abortSignal // Accept abortSignal
  } = options;
  
  const response = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: modelId || 'mistral-medium',
      messages
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
    message: response.data.choices[0].message.content,
    usage: response.data.usage,
    provider: 'Mistral'
  };
}

/**
 * Prepare messages for Mistral API format including file contents
 * @param {Array} messages - Array of message objects
 * @param {Array} files - Array of file objects
 * @returns {Array} - Formatted messages for Mistral API
 */
function prepareMessages(messages, files = []) {
  if (!messages || !Array.isArray(messages)) {
    throw new Error('Messages data must be an array');
  }
  
  const formattedMessages = [...messages];
  
  // If we have files, add their content to the last user message
  if (files && files.length > 0 && formattedMessages.length > 0) {
    const lastMessageIndex = formattedMessages.length - 1;
    const lastMessage = formattedMessages[lastMessageIndex];
    
    if (lastMessage.role === 'user') {
      const fileContent = files.map(file => {
        const content = file.contents || '';
        return `--- File: ${file.filename || 'file'} ---\n${content}\n`;
      }).join('\n');
      
      formattedMessages[lastMessageIndex] = {
        ...lastMessage,
        content: `${lastMessage.content}\n\n${fileContent}`
      };
    }
  }
  
  return formattedMessages;
}

module.exports = {
  name: 'Mistral',
  description: 'Mistral API for Mistral AI models',
  discoverModels,
  getDefaultModels,
  validateApiKey,
  streamCompletion,
  completion,
  prepareMessages
};
