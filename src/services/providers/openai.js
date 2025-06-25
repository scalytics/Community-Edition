/**
 * OpenAI Provider Module
 * 
 * Handles discovery, management, and streaming of OpenAI models
 */
const axios = require('axios');

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
  }).filter(msg => {
    return msg.content && (typeof msg.content !== 'string' || msg.content.trim() !== '');
  });
}

async function discoverModels(options = {}) {
  try {
    const apiKey = options.apiKey;
    if (!apiKey) {
      return { models: [], error: 'API key is required' };
    }
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.data || !Array.isArray(response.data.data)) {
      return { models: [], error: 'Unexpected API response format' };
    }
    const models = response.data.data
      .filter(model => {
        const id = model.id.toLowerCase();
        return (
          id.includes('gpt') || 
          id.includes('text-embedding') || 
          id.includes('dall-e') ||
          id.startsWith('ft:')
        );
      })
      .map(model => {
        return {
          id: model.id, 
          name: model.id, 
          description: getModelDescription(model.id),
          context_window: getContextWindow(model.id),
          raw_capabilities_info: model 
        };
      });
    return { models, error: null };
  } catch (error) {
    console.error('Error discovering OpenAI models:', error.message); 
    const errorMessage = error.response ? 
      `API error (${error.response.status}): ${error.response.data?.error?.message || error.message}` : 
      `Network error: ${error.message}`;
    return { models: [], error: errorMessage };
  }
}

function getModelDescription(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('gpt-4') && id.includes('vision')) return 'GPT-4 with vision capabilities';
  if (id.includes('gpt-4') && id.includes('turbo')) return 'GPT-4 Turbo - Faster version of GPT-4';
  if (id.includes('gpt-4-32k')) return 'GPT-4 with 32k context window';
  if (id.includes('gpt-4')) return 'GPT-4 - Most advanced GPT model';
  if (id.includes('gpt-3.5-turbo-16k')) return 'GPT-3.5 Turbo with 16k context window';
  if (id.includes('gpt-3.5-turbo')) return 'GPT-3.5 Turbo - Fast and efficient GPT-3.5 model';
  if (id.includes('text-embedding')) return 'OpenAI text embedding model';
  if (id.includes('dall-e')) return 'DALL-E image generation model';
  if (id.startsWith('ft:')) return 'Fine-tuned OpenAI model';
  return `OpenAI ${modelId} model`;
}

function getContextWindow(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('gpt-4-vision')) return 128000;
  if (id.includes('gpt-4-turbo')) return 128000;
  if (id.includes('gpt-4-32k')) return 32768;
  if (id.includes('gpt-4')) return 8192;
  if (id.includes('gpt-3.5-turbo-16k')) return 16384;
  if (id.includes('gpt-3.5-turbo')) return 4096;
  if (id.includes('text-embedding')) return 8191;
  if (id.includes('dall-e')) return 0; 
  return 4096;
}

function getDefaultModels() {
  return [
    { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
  ];
}

async function validateApiKey(apiKey) {
  if (!apiKey) return { isValid: false, errorMessage: "API key is required" };
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return { isValid: response.status === 200, errorMessage: null };
  } catch (error) {
    let errorMessage = error.message;
    if (error.response) {
      const status = error.response.status;
      if (status === 401) errorMessage = "The API key is invalid or has expired";
      else if (status === 403) errorMessage = "The API key doesn't have permission to access OpenAI models";
      else if (status === 429) errorMessage = "Rate limit exceeded or insufficient quota for this API key";
      else errorMessage = `API returned error status ${status}: ${error.response.data?.error?.message || 'Unknown error'}`;
    } else if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      errorMessage = `Network error during OpenAI API key validation: ${error.message}`;
      return { isValid: false, errorMessage };
    }
    return { isValid: false, errorMessage: `OpenAI API validation error: ${errorMessage}` };
  }
}

async function streamCompletion(options) {
  const { apiKey, modelId, messages: originalMessages, streamingContext, abortSignal, onToken } = options;
  const messages = filterImageContentFromMessages(originalMessages); 

  if (onToken && typeof onToken !== 'function') { 
    console.warn('[OpenAI Stream] onToken callback is not a function, streaming will not work as expected.');
  }
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model: modelId || 'gpt-3.5-turbo', messages, temperature: 0.7, max_tokens: 1000, stream: true },
    {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      responseType: 'stream',
      signal: abortSignal
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
                onToken(token);
              }
            } catch (parseError) { /* ignore */ }
          }
        }
      } catch (error) { /* ignore */ }
    });
    response.data.on('end', () => {
      const result = { message: fullMessage, provider: 'OpenAI (Stream)', streaming: true, usage: null };
      resolve(result);
    });
    response.data.on('error', (error) => { reject(error); });
  });
}

async function completion(options) {
  const { apiKey, modelId, messages: originalMessages, abortSignal } = options;
  const messages = filterImageContentFromMessages(originalMessages); 

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model: modelId || 'gpt-3.5-turbo', messages, temperature: 0.7, max_tokens: 1000 },
    {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: abortSignal
    }
  );
  const result = {
    message: response.data.choices[0].message.content,
    usage: response.data.usage,
    provider: 'OpenAI'
  };
  return result;
}

module.exports = {
  name: 'OpenAI',
  description: 'OpenAI API for ChatGPT, GPT-4, and other models',
  discoverModels,
  getDefaultModels,
  validateApiKey,
  streamCompletion,
  completion,
  generateImage 
};

async function generateImage(options) {
  const { apiKey, modelId, prompt, providerDetails } = options; 
  let baseUrl = 'https://api.openai.com';
  let imageEndpointPath = '/v1/images/generations'; 
  if (providerDetails) {
    if (providerDetails.api_url) {
      baseUrl = providerDetails.api_url.replace(/\/$/, '');
    }
    if (providerDetails.image_generation_endpoint_path) {
      imageEndpointPath = providerDetails.image_generation_endpoint_path;
    }
  }
  const targetUrl = `${baseUrl}${imageEndpointPath.startsWith('/') ? '' : '/'}${imageEndpointPath}`;
  const payload = {
    model: modelId, 
    prompt: prompt,
    n: 1, // OpenAI DALL-E API supports n=1 for image generations endpoint
    size: options.size || "1024x1024" // Use size from options or default
    // response_format is not a standard OpenAI API parameter for this endpoint;
    // it defaults to b64_json or url based on model/API version.
    // For DALL-E 2/3, b64_json is typical.
  };
  try {
    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.data && response.data.data && response.data.data.length > 0) {
      const imageB64 = response.data.data[0].b64_json;
      if (imageB64) {
        const dataUrl = `data:image/png;base64,${imageB64}`; 
        return {
          message: `![Generated Image by ${modelId}](${dataUrl})`, 
          provider: 'OpenAI',
          model: modelId,
          usage: {
            image_count: 1, 
            image_size: options.size || "1024x1024", 
            prompt_tokens: 0, 
            completion_tokens: 1, 
            total_tokens: 1 
          }
        };
      } else if (response.data.data[0].url) {
        const imageUrl = response.data.data[0].url;
         return {
          message: `![Generated Image by ${modelId}](${imageUrl})`,
          provider: 'OpenAI',
          model: modelId,
          usage: {
            image_count: 1,
            image_size: options.size || "1024x1024",
            prompt_tokens: 0,
            completion_tokens: 1,
            total_tokens: 1
          }
        };
      }
    }
    throw new Error('No image data found in OpenAI response');
  } catch (error) {
    console.error(`[openai.js] Image generation API error for model ${modelId}:`, error.response?.data || error.message); 
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown OpenAI image generation error';
    throw new Error(`OpenAI Image API error: ${errorMessage}`);
  }
}
