/**
 * External API Provider Handler
 */
const { db } = require('../../models/db');
const apiKeyController = require('../../controllers/apiKeyController'); 
const apiKeyService = require('../apiKeyService');
const Model = require('../../models/Model'); 

function sanitizeLlmJsonResponse(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return '';
  }
  try {
    let sanitized = jsonString;
    sanitized = sanitized.replace(/\/\/.*/g, '');
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
    sanitized = sanitized.trim();
    return sanitized;
  } catch (error) {
    console.error('[sanitizeLlmJsonResponse] Error during sanitization:', error);
    return jsonString; 
  }
}

// --- Main Handler Function ---
async function handleExternalApiRequest({
  model: selectedChatModel, 
  prompt,
  isImagePrompt = false,
  parameters,
  onToken,
  previousMessages = [],
  userId = null, 
  files = [],
  streamingContext = null
}) {
  if (!userId && isImagePrompt) {
    throw new Error("User ID is required for image generation requests to fetch tool configuration.");
  }

  if (isImagePrompt) {
    return await executeProviderCall(
      null, 
      selectedChatModel, 
      null, 
      [{ role: 'user', content: prompt }], 
      prompt, 
      files, 
      streamingContext, 
      onToken, 
      true, 
      userId
    );
  } else {
    // --- This is the existing logic for TEXT chat completions ---
    if (!selectedChatModel.external_provider_id) {
      console.error(`[Handler] handleExternalApiRequest called for a local chat model (ID: ${selectedChatModel.id}, Name: ${selectedChatModel.name}) for a text request. This should be handled by local model pipeline.`);
      throw new Error(`External API handler called inappropriately for local chat model: ${selectedChatModel.name}`);
    }

    const providerDetailsForChatModel = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [selectedChatModel.external_provider_id]);
    if (!providerDetailsForChatModel) {
      throw new Error(`API provider configuration not found for ID ${selectedChatModel.external_provider_id} (Chat Model: ${selectedChatModel.name})`);
    }
    
    let apiKeyToUse;
    if (userId) {
      const apiKeyData = await apiKeyService.getBestApiKey(userId, providerDetailsForChatModel.name);
      if (!apiKeyData || !apiKeyData.key) {
        const error = new Error(`No valid API key found for ${providerDetailsForChatModel.name} for user ${userId}`);
        error.apiKeyError = true;
        error.providerName = providerDetailsForChatModel.name;
        throw error;
      }
      apiKeyToUse = apiKeyData.key;
    } else { 
      const globalKeyData = await db.getAsync(
        'SELECT key_value, is_encrypted FROM api_keys WHERE provider_id = ? AND is_global = 1 AND is_active = 1',
        [providerDetailsForChatModel.id]
      );
      if (!globalKeyData || !globalKeyData.key_value) {
        const error = new Error(`No active global system API key configured for ${providerDetailsForChatModel.name}.`);
        error.apiKeyError = true;
        error.providerName = providerDetailsForChatModel.name;
        throw error;
      }
      apiKeyToUse = globalKeyData.is_encrypted 
        ? require('../utils/encryptionUtils').encryptionHelpers.decrypt(globalKeyData.key_value) 
        : globalKeyData.key_value;
    }

  const messagesForCall = formatMessagesForProvider(providerDetailsForChatModel.name, previousMessages, prompt);
    
    return await executeProviderCall(
      providerDetailsForChatModel, 
      selectedChatModel, 
      apiKeyToUse,
      messagesForCall, 
      prompt, 
      files, 
      streamingContext, 
      onToken, 
      false, 
      userId
    );
  } 
}

async function executeProviderCall(
  providerDetailsForChatModel, 
  selectedChatModel, 
  apiKeyForChatProvider, 
  messages, 
  rawUserPrompt, 
  files, 
  streamingContext, 
  onToken = null, 
  isImagePrompt = false,
  userId
) {
   const isBatchMode = !streamingContext;

   if (isImagePrompt) {
    if (!userId) throw new Error("User context required for image generation tool configuration.");
    const toolConfigRow = await db.getAsync(
      "SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = 'image_gen'",
      [userId]
    );
    if (!toolConfigRow || !toolConfigRow.config) {
      throw new Error("Image Generation tool not configured by the user in AI Agents Settings.");
    }
    let toolConfig;
    try {
      toolConfig = JSON.parse(toolConfigRow.config);
    } catch (e) {
      throw new Error("Invalid configuration for Image Generation tool.");
    }
    const imageModelDbId = toolConfig.selected_model_id;
    if (!imageModelDbId) {
      throw new Error("No model selected for Image Generation tool in user settings.");
    }
    const imageModelRecord = await Model.findById(imageModelDbId);
    if (!imageModelRecord || !imageModelRecord.external_model_id || !imageModelRecord.external_provider_id) {
      throw new Error(`Configured image generation model (ID: ${imageModelDbId}) not found or is incomplete.`);
    }
    const imageProviderDetails = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [imageModelRecord.external_provider_id]);
    if (!imageProviderDetails) {
      throw new Error(`Provider for configured image model (ID: ${imageModelDbId}) not found.`);
    }
    let apiKeyForImageProvider;
    const apiKeyData = await apiKeyService.getBestApiKey(userId, imageProviderDetails.name);
     if (!apiKeyData || !apiKeyData.key) {
        const globalKeyData = await db.getAsync(
            'SELECT key_value, is_encrypted FROM api_keys WHERE provider_id = ? AND is_global = 1 AND is_active = 1',
            [imageProviderDetails.id]
        );
        if (!globalKeyData || !globalKeyData.key_value) {
            const error = new Error(`No valid API key (user or global) found for image generation provider: ${imageProviderDetails.name}`);
            error.apiKeyError = true;
            error.providerName = imageProviderDetails.name;
            throw error;
        }
        apiKeyForImageProvider = globalKeyData.is_encrypted
            ? require('../utils/encryptionUtils').encryptionHelpers.decrypt(globalKeyData.key_value)
            : globalKeyData.key_value;
    } else {
        apiKeyForImageProvider = apiKeyData.key;
    }
    const imageModelExternalId = imageModelRecord.external_model_id;
    const imageProviderName = imageProviderDetails.name;
    console.log(`[API Handler] Routing to IMAGE generation. Provider: ${imageProviderName}, Image Model ID: ${imageModelExternalId} (User's chat model was ${selectedChatModel.external_model_id})`);
    const imagePrompt = rawUserPrompt;
    switch (imageProviderName) {
      case 'OpenAI':
        const openaiImgProvider = require('./openai');
        return await openaiImgProvider.generateImage({ apiKey: apiKeyForImageProvider, modelId: imageModelExternalId, prompt: imagePrompt, providerDetails: imageProviderDetails });
      case 'Google':
        const googleImgProvider = require('./google');
        if (isBatchMode) { 
          return await googleImgProvider.completion({ apiKey: apiKeyForImageProvider, modelId: imageModelExternalId, messages: [{role: 'user', parts: [{text: imagePrompt}]}], isImagePrompt: true, model: imageModelRecord, providerDetails: imageProviderDetails });
        } else { 
          return await googleImgProvider.streamCompletion({ apiKey: apiKeyForImageProvider, modelId: imageModelExternalId, messages: [{role: 'user', parts: [{text: imagePrompt}]}], streamingContext, onToken, isImagePrompt: true, model: imageModelRecord, providerDetails: imageProviderDetails });
        }
      case 'xAI':
        const xaiImgProvider = require('./xai');
        return await xaiImgProvider.generateImage({ apiKey: apiKeyForImageProvider, modelId: imageModelExternalId, prompt: imagePrompt, providerDetails: imageProviderDetails });
      default:
        if (imageProviderDetails.image_generation_endpoint_path && imageModelExternalId) {
            console.warn(`[API Handler] Attempting generic image generation for ${imageProviderName} using endpoint: ${imageProviderDetails.image_generation_endpoint_path} and model: ${imageModelExternalId}`);
            throw new Error(`Image generation for custom provider '${imageProviderName}' not fully implemented in generic handler.`);
        }
        throw new Error(`Image generation not supported or configured for provider: ${imageProviderName}`);
    }
   } else {
    const chatProviderName = providerDetailsForChatModel.name;
    const chatModelExternalId = selectedChatModel.external_model_id;
    console.log(`[API Handler] Routing to CHAT completion. Provider: ${chatProviderName}, Chat Model ID: ${chatModelExternalId}`);
    const chatMessages = messages; 
    switch (chatProviderName) {
      case 'OpenAI':
        const openaiChatProvider = require('./openai');
        if (isBatchMode) {
          return await openaiChatProvider.completion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, providerDetails: providerDetailsForChatModel }); 
        } else {
          return await openaiChatProvider.streamCompletion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, streamingContext, onToken, providerDetails: providerDetailsForChatModel }); 
        }
      case 'Anthropic':
        const anthropicProvider = require('./anthropic');
        if (isBatchMode) {
          return await anthropicProvider.completion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, payload: { messages: chatMessages }, files, providerDetails: providerDetailsForChatModel });
        } else {
          return await anthropicProvider.streamCompletion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, payload: { messages: chatMessages }, files, streamingContext, onToken, providerDetails: providerDetailsForChatModel });
        }
      case 'Cohere':
        const cohereProvider = require('./cohere');
        if (isBatchMode) {
          return await cohereProvider.chat({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, message: chatMessages[chatMessages.length-1]?.content, chatHistory: chatMessages.slice(0,-1), files, providerDetails: providerDetailsForChatModel });
        } else {
          return await cohereProvider.streamChat({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, message: chatMessages[chatMessages.length-1]?.content, chatHistory: chatMessages.slice(0,-1), files, streamingContext, onToken, providerDetails: providerDetailsForChatModel });
        }
      case 'Mistral':
        const mistralProvider = require('./mistral');
        if (isBatchMode) {
          return await mistralProvider.completion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, providerDetails: providerDetailsForChatModel });
        } else {
          return await mistralProvider.streamCompletion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, streamingContext, onToken, providerDetails: providerDetailsForChatModel });
        }
      case 'Google':
        const googleChatProvider = require('./google');
        if (isBatchMode) {
          return await googleChatProvider.completion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, isImagePrompt: false, model: selectedChatModel, providerDetails: providerDetailsForChatModel });
        } else {
          return await googleChatProvider.streamCompletion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, streamingContext, onToken, isImagePrompt: false, model: selectedChatModel, providerDetails: providerDetailsForChatModel });
        }
      case 'xAI':
        const xaiChatProvider = require('./xai');
        if (isBatchMode) {
          return await xaiChatProvider.completion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, providerDetails: providerDetailsForChatModel });
        } else {
          return await xaiChatProvider.streamCompletion({ apiKey: apiKeyForChatProvider, modelId: chatModelExternalId, messages: chatMessages, files, streamingContext, onToken, providerDetails: providerDetailsForChatModel });
        }
      default:
        console.warn(`[API Handler] Provider '${chatProviderName}' not explicitly listed for chat. Attempting generic OpenAI-compatible call.`);
        let chatEndpointPath = providerDetailsForChatModel.endpoints?.chat || '/v1/chat/completions';
        if (!providerDetailsForChatModel.api_url) throw new Error(`API URL not configured for custom provider ${chatProviderName}`);
        const targetUrl = `${providerDetailsForChatModel.api_url.replace(/\/$/, '')}${chatEndpointPath.startsWith('/') ? '' : '/'}${chatEndpointPath}`;
        const payload = { model: chatModelExternalId, messages: chatMessages, temperature: 0.7, max_tokens: 1000, stream: !!streamingContext };
        const axios = require('axios');
        try {
          if (payload.stream) {
            const responseStream = await axios.post(targetUrl, payload, {
              headers: { 'Authorization': `Bearer ${apiKeyForChatProvider}`, 'Content-Type': 'application/json' },
              responseType: 'stream',
              signal: streamingContext?.abortSignal 
            });
            let fullMessage = '';
            return new Promise((resolve, reject) => {
              responseStream.data.on('data', (chunk) => { 
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
              });
              responseStream.data.on('end', () => resolve({ message: fullMessage, provider: chatProviderName, streaming: true, usage: null }));
              responseStream.data.on('error', (error) => reject(error));
            });
          } else {
            const response = await axios.post(targetUrl, payload, { 
                headers: { 'Authorization': `Bearer ${apiKeyForChatProvider}`, 'Content-Type': 'application/json' },
                signal: null 
            });
            const sanitizedMessage = sanitizeLlmJsonResponse(response.data.choices[0].message.content);
            return { message: sanitizedMessage, usage: response.data.usage, provider: chatProviderName };
          }
        } catch (error) {
          console.error(`[API Handler Default Case] Error calling ${chatProviderName} at ${targetUrl}:`, error.response?.data || error.message);
          throw new Error(`Error with ${chatProviderName}: ${error.response?.data?.error?.message || error.response?.data?.detail || error.message}`);
        }
    }
   }
}

function formatMessagesForProvider(providerName, previousMessages, userMessage) {
  const fullHistory = previousMessages.concat({ role: 'user', content: userMessage });
  
  let formattedMessages;
  switch (providerName) {
    case 'OpenAI':
    case 'xAI': 
      return fullHistory.map(msg => ({ role: msg.role, content: msg.content }));
    case 'Google':
      const googleProviderModule = require('./google');
      if (googleProviderModule && typeof googleProviderModule.prepareMessages === 'function') {
        formattedMessages = googleProviderModule.prepareMessages(fullHistory);
      } else {
        console.error('[Handler formatMessagesForProvider] ERROR: google.js or google.prepareMessages is not available/not a function. Falling back to fullHistory.');
        formattedMessages = fullHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : msg.role,
          parts: [{ text: msg.content || '' }]
        })).filter(msg => msg.role === 'user' || msg.role === 'model');
      }
      break;
    case 'Anthropic':
    case 'Cohere':
    case 'Mistral':
      return fullHistory; 
    default:
      console.warn(`[API Handler] Using default message formatting for provider: ${providerName}`);
      formattedMessages = fullHistory.map(msg => ({ role: msg.role, content: msg.content }));
      break;
  }
  return formattedMessages;
}

module.exports = {
  handleExternalApiRequest
};
