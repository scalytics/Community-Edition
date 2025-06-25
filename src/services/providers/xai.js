const axios = require('axios');
const eventBus = require('../../utils/eventBus');

const DEFAULT_XAI_API_URL = 'https://api.x.ai';

/**
 * Filters out image content from messages.
 * @param {Array} messages - Array of message objects.
 * @returns {Array} - Filtered array of message objects.
 */
function filterImageContentFromMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(msg => {
    if (msg.role === 'user' && msg.content && typeof msg.content === 'string') {
      const imageRegex = /!\[.*?\]\(data:image\/[^;]+;base64,[^\)]+\)|data:image\/[^;]+;base64,[\w\/\+=]+/gi;
      let newContent = msg.content.replace(imageRegex, '[Image content removed by user message filter]').trim();
      if (msg.content.trim() !== '' && newContent === '') {
        newContent = '[Image content removed by user message filter]';
      }
      return { ...msg, content: newContent };
    }
    return msg;
  }).filter(msg => msg.content && msg.content.trim() !== ''); 
}

/**
 * Handles non-streaming chat completion requests to the xAI API.
 */
async function completion(options) {
  const { apiKey, modelId, messages: originalMessages, providerDetails } = options;
  const messages = filterImageContentFromMessages(originalMessages); 
  let baseUrl = DEFAULT_XAI_API_URL;
  let chatEndpoint = '/v1/chat/completions';

  if (providerDetails) {
    if (providerDetails.api_url) baseUrl = providerDetails.api_url.replace(/\/$/, '');
    if (providerDetails.endpoints) {
      try {
        const parsedEndpoints = typeof providerDetails.endpoints === 'string' ? JSON.parse(providerDetails.endpoints) : providerDetails.endpoints;
        if (parsedEndpoints?.chat) chatEndpoint = parsedEndpoints.chat;
      } catch (e) {
        console.error(`[xai.js] Error parsing endpoints for ${providerDetails.name}, using default. Endpoints: ${providerDetails.endpoints}`, e);
      }
    }
  }
  const targetUrl = `${baseUrl}${chatEndpoint.startsWith('/') ? '' : '/'}${chatEndpoint}`;
  const payload = { model: modelId, messages, stream: false };

  try {
    const response = await axios.post(targetUrl, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    const result = {
      message: response.data.choices?.[0]?.message?.content || '',
      usage: response.data.usage || null,
      provider: 'xAI', 
      model: modelId,
    };
    return result;
  } catch (error) {
    console.error(`[xai.js] API error for model ${modelId} (non-streaming):`, error.response?.data || error.message); 
    const errorMessage = error.response?.data?.error?.message || error.response?.data?.detail || error.message || 'Unknown xAI API error';
    throw new Error(`xAI API error: ${errorMessage}`);
  }
}

/**
 * Handles streaming chat completion requests to the xAI API.
 */
async function streamCompletion(options) {
  const { apiKey, modelId, messages: originalMessages, streamingContext, onToken, providerDetails } = options;
  const messages = filterImageContentFromMessages(originalMessages); 
  const { startTime } = streamingContext;
  let baseUrl = DEFAULT_XAI_API_URL;
  let chatEndpoint = '/v1/chat/completions';

  if (providerDetails) {
    if (providerDetails.api_url) baseUrl = providerDetails.api_url.replace(/\/$/, '');
    if (providerDetails.endpoints) {
      try {
        const parsedEndpoints = typeof providerDetails.endpoints === 'string' ? JSON.parse(providerDetails.endpoints) : providerDetails.endpoints;
        if (parsedEndpoints?.chat) chatEndpoint = parsedEndpoints.chat;
      } catch (e) {
        console.error(`[xai.js] Error parsing endpoints for ${providerDetails.name} (streaming), using default. Endpoints: ${providerDetails.endpoints}`, e);
      }
    }
  }
  const targetUrl = `${baseUrl}${chatEndpoint.startsWith('/') ? '' : '/'}${chatEndpoint}`;
  const payload = { model: modelId, messages, stream: true };
  
  let fullMessage = '';
  let receivedAnyData = false;
  let buffer = ''; 

  try {
    const responseStream = await axios.post(targetUrl, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      responseType: 'stream', 
      signal: streamingContext?.abortSignal,
    });

    return new Promise((resolve, reject) => {
      responseStream.data.on('data', (chunk) => {
        try {
          receivedAnyData = true;
          buffer += chunk.toString();
          
          let lineEndIndex;
          while ((lineEndIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, lineEndIndex).trim();
            buffer = buffer.substring(lineEndIndex + 1);
            
            if (line && line.startsWith('data:')) {
              const data = line.substring(5).trim();
              if (data === '[DONE]') continue;
              if (data === '') continue; 
              
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content || '';
                if (token && typeof onToken === 'function') { 
                  fullMessage += token; 
                  onToken(token); 
                }
              } catch (parseError) { 
                if (data.length > 10 && (data.startsWith('{') || data.endsWith('}'))) {
                  console.warn('[xAI Stream] Failed to parse SSE data:', parseError.message, 'Data:', data.substring(0, 100));
                }
              }
            }
          }
        } catch (error) { 
          console.error('[xAI Stream] Error processing chunk:', error); 
        }
      });

      responseStream.data.on('end', () => {
        if (buffer.trim()) {
          const remainingLines = buffer.split('\n');
          for (const line of remainingLines) {
            const trimmedLine = line.trim();
            if (trimmedLine && trimmedLine.startsWith('data:')) {
              const data = trimmedLine.substring(5).trim();
              if (data === '[DONE]' || data === '') continue;
              
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content || '';
                if (token && typeof onToken === 'function') { 
                  fullMessage += token; 
                  onToken(token); 
                }
              } catch (parseError) { 
                console.warn('[xAI Stream] Failed to parse final SSE data:', parseError.message);
              }
            }
          }
        }
        
        if (!receivedAnyData) { 
          console.warn('[xAI Stream] Stream ended without receiving any data.'); 
        }
        
        const elapsed = (Date.now() - Date.parse(startTime || Date.now())) / 1000;
        const result = { 
          message: fullMessage, 
          usage: null, 
          provider: 'xAI', 
          model: modelId, 
          streaming: true, 
          elapsed 
        };
        resolve(result);
      });

      responseStream.data.on('error', (error) => {
        console.error('[xAI Stream] Stream error:', error);
        reject(new Error(`xAI API stream error: ${error.message}`));
      });
    });
  } catch (error) {
    console.error(`[xai.js] API error for model ${modelId} (streaming setup):`, error.response?.data || error.message); 
    const errorMessage = error.response?.data?.error?.message || error.response?.data?.detail || error.message || 'Unknown xAI API error';
    throw new Error(`xAI API error: ${errorMessage}`);
  }
}

async function discoverModels(options = {}) {
  const { apiKey, baseUrl = DEFAULT_XAI_API_URL, modelsEndpoint } = options; 
  console.log('[xai.js] discoverModels called with options:', { apiKey: apiKey ? '******' : null, baseUrl, modelsEndpoint });

  if (apiKey && modelsEndpoint && baseUrl) {
    const targetUrl = `${baseUrl.replace(/\/$/, '')}${modelsEndpoint.startsWith('/') ? '' : '/'}${modelsEndpoint}`;
    console.log(`[xai.js] Attempting to discover models from URL: ${targetUrl}`);
    try {
      const response = await axios.get(targetUrl, { 
        headers: { 'Authorization': `Bearer ${apiKey}` } 
      });
      console.log('[xai.js] discoverModels API response status:', response.status);
      // console.log('[xai.js] discoverModels API response data:', JSON.stringify(response.data, null, 2)); // Potentially very verbose
      
      if (response.data && Array.isArray(response.data.data)) { 
        const models = response.data.data.map(model => ({
          id: model.id,
          name: model.id, 
          description: model.description || `xAI model: ${model.id}`,
          context_window: model.context_window || 8192, // Default context if not provided
          raw_capabilities_info: model // Store the whole original object
        }));
        console.log(`[xai.js] Successfully discovered ${models.length} models from API.`);
        return { models, error: null };
      }
      
      console.warn('[xai.js] discoverModels: Unexpected response format from xAI models endpoint. Expected response.data.data to be an array. Response received:', JSON.stringify(response.data).substring(0, 500));
      return { models: [], error: 'Unexpected API response format from xAI.' };
    } catch (error) {
      const errorMessage = error.response ? 
        `API error (${error.response.status}): ${error.response.data?.error?.message || error.response.data?.detail || error.message}` : 
        `Network error: ${error.message}`;
      console.error(`[xai.js] discoverModels: Error fetching models from xAI API (${targetUrl}): ${errorMessage}`);
      if (error.response) {
        console.error('[xai.js] Full error response data:', JSON.stringify(error.response.data).substring(0, 500));
      }
      return { models: [], error: `Failed to fetch from xAI: ${errorMessage}` };
    }
  }

  const missingConfigError = `API discovery not configured for xAI provider. Missing one or more of: API Key, Base URL ('${baseUrl}'), Models Endpoint ('${modelsEndpoint}').`;
  console.warn(`[xai.js] discoverModels: ${missingConfigError}`);
  return { models: [], error: missingConfigError };
}

async function generateImage(options) {
  const { apiKey, modelId, prompt, providerDetails } = options;
  let baseUrl = DEFAULT_XAI_API_URL;
  let imageEndpointPath = '/v1/images/generations'; 

  if (providerDetails) {
    if (providerDetails.api_url) baseUrl = providerDetails.api_url.replace(/\/$/, '');
    if (providerDetails.image_generation_endpoint_path) imageEndpointPath = providerDetails.image_generation_endpoint_path;
  }
  
  const targetUrl = `${baseUrl}${imageEndpointPath.startsWith('/') ? '' : '/'}${imageEndpointPath}`;
  const payload = { model: modelId, prompt, response_format: "b64_json" };

  try {
    const response = await axios.post(targetUrl, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    
    if (response.data?.data?.[0]?.b64_json) {
      const b64_json = response.data.data[0].b64_json;
      const dataUrl = `data:image/jpeg;base64,${b64_json}`;
      const result = { 
        message: `![Generated Image by ${modelId}](${dataUrl})`, 
        provider: 'xAI', 
        model: modelId, 
        usage: {
          image_count: 1,
          image_size: options.size || "1024x1024", 
          prompt_tokens: 0, 
          completion_tokens: 1, 
          total_tokens: 1
        }
      };
      return result;
    }
    
    if (response.data?.data?.[0]?.url) {
      const result = { 
        message: `![Generated Image by ${modelId}](${response.data.data[0].url})`, 
        provider: 'xAI', 
        model: modelId, 
        usage: {
          image_count: 1,
          image_size: options.size || "1024x1024",
          prompt_tokens: 0,
          completion_tokens: 1,
          total_tokens: 1
        }
      };
      return result;
    }
    
    throw new Error('No image data (b64_json or url) found in xAI response');
  } catch (error) {
    console.error(`[xai.js] Image generation API error for model ${modelId}:`, error.response?.data || error.message); 
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown xAI image generation error';
    throw new Error(`xAI Image API error: ${errorMessage}`);
  }
}

module.exports = {
  name: 'xAI',
  description: 'xAI Grok models',
  discoverModels,
  validateApiKey: async (apiKey) => { 
    if (!apiKey) return { isValid: false, errorMessage: "API key is required" };
    return { isValid: true, errorMessage: null }; 
  },
  completion,
  streamCompletion,
  generateImage
};
