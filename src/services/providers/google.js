/**
 * Google Gemini Provider Module - Fixed Version
 *
 * Handles discovery, management, and streaming of Google Gemini models
 */
const nodeFetch = require('node-fetch');
const webStreams = require('web-streams-polyfill');

if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = webStreams.ReadableStream;
  globalThis.WritableStream = webStreams.WritableStream;
  globalThis.TransformStream = webStreams.TransformStream;
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = require('util').TextEncoder;
}
if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = require('util').TextDecoder;
}
if (!globalThis.TextEncoderStream) {
  globalThis.TextEncoderStream = webStreams.TextEncoderStream;
}
if (!globalThis.TextDecoderStream) {
  globalThis.TextDecoderStream = webStreams.TextDecoderStream;
}

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const axios = require('axios');
const { broadcastToRoom } = require('../../config/socketHandlers');

/**
 * Discover Google models using the API key
 */
async function discoverModels(options = {}) {
  try {
    const apiKey = options.apiKey;

    if (!apiKey) {
      console.log('No API key provided for Google model discovery');
      return { models: [], error: 'API key is required' };
    }

    const validationResult = await validateApiKey(apiKey);

    if (!validationResult.isValid) {
      console.error(`Invalid API key provided for Google model discovery: ${validationResult.errorMessage}`);
      return { models: [], error: validationResult.errorMessage };
    }

    const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      }
    });

    if (!response.data || !response.data.models) {
      console.error('Unexpected API response format from Google API');
      const models = getDefaultModels();
      return { models, error: 'Unexpected API response format, using default models' };
    }

    const models = response.data.models
      .filter(model => {
        return (
          model.supportedGenerationMethods &&
          model.supportedGenerationMethods.includes('generateContent') &&
          !model.name.includes('embedding') &&
          !model.name.includes('vision')
        );
      })
      .map(apiModel => {
        const modelId = apiModel.name.split('/').pop();
        return {
          id: modelId,
          name: formatModelName(modelId),
          description: apiModel.description || `Google ${modelId} model`,
          context_window: getContextWindow(modelId),
          raw_capabilities_info: apiModel
        };
      });

    console.log(`Discovered ${models.length} Google models with valid API key.`);
    return { models, error: null };
  } catch (error) {
    console.error('Error discovering Google models:', error.message);

    const models = getDefaultModels();
    const errorMessage = error.response ?
      `API error (${error.response.status}): ${error.response.data?.error?.message || error.message}` :
      `Network error: ${error.message}`;

    return {
      models,
      error: `${errorMessage} - using default models`
    };
  }
}

/**
 * Format a model ID into a friendly name
 */
function formatModelName(modelId) {
  return modelId
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Get context window size for a model
 */
function getContextWindow(modelId) {
  if (modelId.includes('gemini-1.5-pro')) return 1048576; 
  if (modelId.includes('gemini-1.5-flash')) return 1048576; 
  if (modelId.includes('gemini-2.0-flash')) return 1048576; 
  if (modelId.includes('gemini-pro')) return 30720; 
  return 30720; 
}

/**
 * Get default Google models
 */
function getDefaultModels() {
  return [
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Stable version of Gemini 1.5 Pro with large context window',
      context_window: 1048576
    },
    {
      id: 'gemini-1.5-pro-latest',
      name: 'Gemini 1.5 Pro Latest',
      description: 'Latest version of Gemini 1.5 Pro with large context window',
      context_window: 2000000
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      description: 'Faster, more efficient Gemini model for responsive applications',
      context_window: 1000000
    },
    {
      id: 'gemini-1.5-flash-latest',
      name: 'Gemini 1.5 Flash Latest',
      description: 'Latest version of Gemini 1.5 Flash',
      context_window: 1000000
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      description: 'Gemini 2.0 Flash model',
      context_window: 1048576
    }
  ];
}

/**
 * Validate a Google API key
 */
async function validateApiKey(apiKey) {
  if (!apiKey) {
    return {
      isValid: false,
      errorMessage: "API key is required"
    };
  }

  try {
    const response = await axios.get(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        }
      }
    );

    return {
      isValid: true,
      errorMessage: null
    };
  } catch (error) {
    let errorMessage = error.message;

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 400 && data?.error?.message?.includes('API key')) {
        errorMessage = "The Google API key is invalid";
      } else if (status === 401) {
        errorMessage = "The API key is invalid or unauthorized";
      } else if (status === 403) {
        errorMessage = "The API key doesn't have permission to access Gemini models";
      } else if (status === 429) {
        errorMessage = "Your Google API key quota has been exceeded";
      } else if (data?.error?.message) {
        errorMessage = data.error.message;
      } else {
        errorMessage = `API returned error status ${status}`;
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
      errorMessage: `Google API validation error: ${errorMessage}`
    };
  }
}

/**
 * Prepare messages for Google Gemini API format.
 * Fixed version that properly handles message conversion
 */
function prepareMessages(messages) {
  let history = [];
  let systemPrompt = null;

  const systemMsgIndex = messages.findIndex(msg => msg.role === 'system');
  if (systemMsgIndex !== -1) {
    systemPrompt = messages[systemMsgIndex].content;
    messages = messages.filter((_, index) => index !== systemMsgIndex);
  }

  messages.forEach(msg => {
    let content = msg.content;
    if (msg.role === 'user' && content && typeof content === 'string') {
      const imageRegex = /!\[.*?\]\(data:image\/[^;]+;base64,[^\)]+\)|data:image\/[^;]+;base64,[\w\/\+=]+/gi;
      if (imageRegex.test(content)) {
        content = content.replace(imageRegex, '[Image content removed by user message filter]').trim();
      }
    }

    if (!content?.trim()) return; 

    const role = msg.role === 'user' ? 'user' : 'model';
    const parts = [{ text: content }]; 

    if (history.length > 0 && history[history.length - 1].role === role) {
      history[history.length - 1].parts[0].text += "\n\n" + msg.content;
    } else {
      history.push({ role, parts });
    }
  });

  if (systemPrompt && history.length > 0 && history[0].role === 'user') {
    history[0].parts[0].text = `${systemPrompt}\n\n${history[0].parts[0].text}`;
  } else if (systemPrompt) {
    history.unshift({ role: 'user', parts: [{ text: systemPrompt }] });
  }

  return history;
}

// --- Safety Settings ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Message Post-Processing ---

/**
 * Post-process streamed messages to fix common issues
 */
function postProcessMessage(message) {
  if (!message || typeof message !== 'string') return message;
  
  let processed = message;
  
  // Fix incomplete code fences
  const codeStartMatches = processed.match(/```[\w]*\n/g) || [];
  const codeEndMatches = processed.match(/\n```/g) || [];
  
  if (codeStartMatches.length > codeEndMatches.length) {
    const missingClosing = codeStartMatches.length - codeEndMatches.length;
    for (let i = 0; i < missingClosing; i++) {
      if (!processed.endsWith('\n')) processed += '\n';
      processed += '```';
    }
    console.log(`[WARN] Added ${missingClosing} missing code fence closing(s)`);
  }
  
  processed = processed.replace(/\n{4,}/g, '\n\n\n');
  
  processed = processed.replace(/[ \t]+$/gm, '');
  
  return processed;
}

// --- Streaming Response Parser ---

/**
 * Extract content from a candidate object
 */
function extractContentFromCandidate(parsed) {
  const candidate = parsed.candidates?.[0];
  if (!candidate?.content?.parts) return null;

  let content = '';
  for (const part of candidate.content.parts) {
    if (part.text) {
      content += part.text;
    } else if (part.inlineData?.data) {
      const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      content += `\n![Generated Image](${dataUrl})\n`;
    }
  }
  
  return content;
}

/**
 * Extract JSON chunks from a buffer
 */
function extractJsonChunks(buffer) {
  const chunks = [];
  let braceCount = 0;
  let currentChunk = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    currentChunk += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0 && currentChunk.trim().startsWith('{')) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
    }
  }

  return chunks;
}

// --- API Calls ---

/**
 * Stream completion from Google Gemini API - Working Version
 */
async function streamCompletion(options) {
  let { apiKey, modelId, messages, streamingContext, abortSignal, onToken, isImagePrompt, model } = options;

  if (isImagePrompt && modelId === 'gemini-2.0-flash-exp-image-generation') {
    console.warn(`[Google Stream] Correcting model ID from ${modelId} to gemini-2.0-flash-preview-image-generation`);
    modelId = 'gemini-2.0-flash-preview-image-generation';
  }

  if (typeof onToken !== 'function') {
    console.warn('[Google Stream] onToken callback is not a function');
    onToken = () => {}; 
  }

  try {
    let currentPrompt = '';
    let conversationHistory = [];

    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage.role === 'user') {
        if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
          currentPrompt = lastMessage.parts.map(p => p.text || '').join('');
          conversationHistory = messages.slice(0, -1);
        } else if (lastMessage.content) {
          currentPrompt = lastMessage.content;
          conversationHistory = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }));
        }
      }
    }

    if (!currentPrompt.trim()) {
      throw new Error("No user message found to process");
    }

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: currentPrompt }]
        }
      ],
      safetySettings,
      generationConfig: {
        temperature: 0.7,
      }
    };

    if (isImagePrompt && model?.can_generate_images) {
      payload.generationConfig.responseModalities = ["TEXT", "IMAGE"];
      console.log(`[Google Stream] Requesting IMAGE and TEXT for model ${modelId}`);
    }

    if (conversationHistory.length > 0 && !isImagePrompt) {
      payload.contents = [...conversationHistory, ...payload.contents];
    }

    console.log(`[Google Stream] Starting stream for model ${modelId}, prompt length: ${currentPrompt.length}`);

    const response = await axios({
      method: 'post',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      data: payload,
      responseType: 'stream',
      signal: abortSignal
    });

    let fullMessage = '';
    let buffer = '';
    let chunkCount = 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        try {
          chunkCount++;
          const chunkStr = chunk.toString();
          buffer += chunkStr;
          let jsonStart = buffer.indexOf('[{');
          if (jsonStart === -1) jsonStart = buffer.indexOf('{');
          
          if (jsonStart !== -1) {
            let braceCount = 0;
            let bracketCount = 0;
            let inString = false;
            let escaped = false;
            let jsonEnd = -1;
            
            for (let i = jsonStart; i < buffer.length; i++) {
              const char = buffer[i];
              
              if (escaped) {
                escaped = false;
                continue;
              }
              
              if (char === '\\') {
                escaped = true;
                continue;
              }
              
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
                else if (char === '[') bracketCount++;
                else if (char === ']') bracketCount--;
                
                if (braceCount === 0 && bracketCount === 0 && (char === '}' || char === ']')) {
                  jsonEnd = i;
                  break;
                }
              }
            }
            
            if (jsonEnd !== -1) {
              const jsonStr = buffer.substring(jsonStart, jsonEnd + 1);
              
              try {
                const parsed = JSON.parse(jsonStr);
                
                if (Array.isArray(parsed)) {
                  for (const item of parsed) {
                    const content = extractContentFromCandidate({ candidates: item.candidates });
                    if (content) {
                      fullMessage += content;
                      if (typeof onToken === 'function') onToken(content);
                    }
                  }
                } else {
                  const content = extractContentFromCandidate(parsed);
                  if (content) {
                    fullMessage += content;
                    if (typeof onToken === 'function') onToken(content);
                  }
                }
                
                buffer = buffer.substring(jsonEnd + 1);
              } catch (parseError) {
                console.warn('[Google Stream] Failed to parse JSON chunk:', parseError.message);
              }
            }
          }
        } catch (error) {
          console.error('[Google Stream] Error processing chunk:', error);
        }
      });

      response.data.on('end', () => {
        if (buffer.trim()) {
          let jsonStart = buffer.indexOf('[{');
          if (jsonStart === -1) jsonStart = buffer.indexOf('{');
          
          if (jsonStart !== -1) {
            try {
              const jsonStr = buffer.substring(jsonStart).trim();
              const parsed = JSON.parse(jsonStr);
              
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  const content = extractContentFromCandidate({ candidates: item.candidates });
                  if (content) {
                    fullMessage += content;
                    if (typeof onToken === 'function') onToken(content);
                  }
                }
              } else {
                const content = extractContentFromCandidate(parsed);
                if (content) {
                  fullMessage += content;
                  if (typeof onToken === 'function') onToken(content);
                }
              }
            } catch (parseError) {
              console.warn('[Google Stream] Failed to parse remaining buffer:', parseError.message);
            }
          }
        }

        fullMessage = postProcessMessage(fullMessage);
        
        console.log(`[Google Stream] Stream completed. Message length: ${fullMessage.length}, chunks: ${chunkCount}`);
        
        if (fullMessage.length === 0) {
          console.warn('[Google Stream] Received empty response - this may indicate an API issue');
        }

        resolve({
          message: fullMessage,
          provider: 'Google (Stream)',
          streaming: true
        });
      });

      response.data.on('error', (error) => {
        console.error('[Google Stream] Stream error:', error);
        reject(new Error(`Stream error: ${error.message}`));
      });
    });

  } catch (error) {
    console.error('[Google Stream] API call failed:', error);
    
    if (error.response) {
      console.error('[Google Stream] Error Status:', error.response.status);
      console.error('[Google Stream] Error Data:', error.response.data);
    }
    
    throw new Error(`Google API streaming error: ${error.message}`);
  }
}

/**
 * Regular completion from Google Gemini API (non-streaming) - Fixed Version
 */
async function completion(options) {
  let { apiKey, modelId, messages, abortSignal, isImagePrompt, model } = options;

  if (isImagePrompt && modelId === 'gemini-2.0-flash-exp-image-generation') {
    console.warn(`[Google Completion] Correcting model ID from ${modelId} to gemini-2.0-flash-preview-image-generation`);
    modelId = 'gemini-2.0-flash-preview-image-generation';
  }

  try {
    let currentPrompt = '';
    let conversationHistory = [];

    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage.role === 'user') {
        if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
          currentPrompt = lastMessage.parts.map(p => p.text || '').join('');
          conversationHistory = messages.slice(0, -1);
        } else if (lastMessage.content) {
          currentPrompt = lastMessage.content;
          conversationHistory = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }));
        }
      }
    }

    if (!currentPrompt.trim()) {
      throw new Error("No user message found to process");
    }

    const payload = {
      contents: [{ role: "user", parts: [{ text: currentPrompt }] }],
      safetySettings,
      generationConfig: {
        temperature: 0.7,
      }
    };

    if (isImagePrompt && model?.can_generate_images) {
      payload.generationConfig.responseModalities = ["TEXT", "IMAGE"];
      console.log(`[Google Completion] Requesting IMAGE and TEXT for model ${modelId}`);
    }

    if (conversationHistory.length > 0 && !isImagePrompt) {
      payload.contents = [...conversationHistory, ...payload.contents];
    }

    const response = await axios({
      method: 'post',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: payload,
      signal: abortSignal
    });

    if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
      throw new Error("Unexpected response format from Google API");
    }

    const candidate = response.data.candidates[0];
    let assembledMessage = extractContentFromCandidate({ candidates: [candidate] }) || '';
    
    assembledMessage = postProcessMessage(assembledMessage);
    
    const usage = response.data.usageMetadata || {};

    return {
      message: assembledMessage.trim(),
      provider: 'Google',
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
      }
    };
  } catch (error) {
    console.error('[Google Completion] API call failed:', error.response?.data || error.message);
    const errMessage = error.response?.data?.error?.message || error.message;
    throw new Error(`Google API completion error: ${errMessage}`);
  }
}

module.exports = {
  name: 'Google',
  description: 'Google Gemini API',
  discoverModels,
  getDefaultModels,
  validateApiKey,
  streamCompletion,
  completion,
  prepareMessages,
  generateImage 
};

async function generateImage(options) {
  const { apiKey, modelId, prompt, providerDetails, size, n } = options; 

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    
    const generativeModel = genAI.getGenerativeModel({ 
        model: modelId,
        safetySettings,
        generationConfig: { 
            responseModalities: ["TEXT", "IMAGE"]
        }
    });

    const result = await generativeModel.generateContent({ contents });
    const response = result.response;

    if (!response || !response.candidates || !response.candidates[0]) {
      throw new Error("Unexpected response format from Google API during image generation.");
    }

    const candidate = response.candidates[0];
    let imageUrl = null;
    let imageMimeType = 'image/png'; 

    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          imageMimeType = part.inlineData.mimeType || imageMimeType;
          imageUrl = `data:${imageMimeType};base64,${part.inlineData.data}`;
          break; 
        }
      }
    }

    if (!imageUrl) {
      const textContent = extractContentFromCandidate(response);
      if (textContent && textContent.startsWith('http')) {
          try {
              new URL(textContent); 
              imageUrl = textContent;
          } catch (e) { /* not a valid URL */ }
      }
      if (!imageUrl) {
        console.error("No image data found in Google API response. Response:", JSON.stringify(response, null, 2));
        throw new Error("No image data (inlineData or URL) found in Google API response for image generation.");
      }
    }
    
    const usage = response.usageMetadata || {};

    return {
      message: `![Generated Image by ${modelId}](${imageUrl})`,
      provider: 'Google',
      model: modelId,
      usage: {
        image_count: 1, 
        image_size: size || "1024x1024", 
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 1, 
        total_tokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 1),
      }
    };

  } catch (error) {
    console.error(`[google.js] Image generation API error for model ${modelId}:`, error.response?.data || error.message, error.stack);
    const errMessage = error.response?.data?.error?.message || error.message || 'Unknown Google image generation error';
    throw new Error(`Google Image API error: ${errMessage}`);
  }
}
