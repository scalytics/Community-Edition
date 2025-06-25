const Model = require('../models/Model');
const { routeInferenceRequest } = require('./inferenceRouter'); 
const { db } = require('../models/db'); 
const apiKeyService = require('./apiKeyService');


const MAX_SUMMARY_TOKENS = 512; 
const MESSAGES_TO_KEEP_AFTER_SUMMARY = 4; 

const temperaturePresets = {
  strict: 0.1,
  balanced: 0.4,
  detailed: 0.7,
};

/**
 * Summarizes a chat history when it exceeds a token threshold.
 *
 * @param {Array<Object>} messages - The original message history.
 * @param {number|null} preferredModelId - The model ID selected in user settings (or null).
 * @param {number} currentChatModelId - The ID of the model being used for the main chat.
 * @param {string} temperaturePreset - The user's selected temperature preset ('strict', 'balanced', 'detailed').
 * @param {number} userId - The ID of the user requesting the chat.
 * @returns {Promise<Array<Object>>} - A new message history array, potentially containing a summary.
 * @throws {Error} If summarization fails critically.
 */
async function summarizeHistory(messages, preferredModelId, currentChatModelId, temperaturePreset, userId) {
  console.log(`[Summarization Service] Attempting to summarize history for chat. Preferred Model: ${preferredModelId}, Current Model: ${currentChatModelId}`);

  let summarizationModelId = preferredModelId;
  let summarizationModel = null;

  if (summarizationModelId) {
    try {
      summarizationModel = await Model.findById(summarizationModelId);
      if (!summarizationModel || !summarizationModel.is_active || summarizationModel.external_provider_id) {
        console.warn(`[Summarization Service] Preferred summarization model ${summarizationModelId} is inactive, external, or not found. Falling back to chat model.`);
        summarizationModelId = currentChatModelId;
        summarizationModel = await Model.findById(summarizationModelId);
      }
    } catch (err) {
      console.error(`[Summarization Service] Error fetching preferred model ${summarizationModelId}. Falling back.`, err);
      summarizationModelId = currentChatModelId;
      summarizationModel = await Model.findById(summarizationModelId);
    }
  } else {
    summarizationModelId = currentChatModelId;
    summarizationModel = await Model.findById(summarizationModelId);
  }

  if (!summarizationModel || !summarizationModel.is_active) {
    console.error(`[Summarization Service] Failed to find an active model (tried ${preferredModelId} and ${currentChatModelId}). Cannot summarize.`);
    return messages;
  }

  console.log(`[Summarization Service] Using model ${summarizationModel.name} (ID: ${summarizationModelId}) for summarization.`);

  const conversationMessagesToSummarize = messages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => ({ role: msg.role, content: msg.content })); 

  const systemInstruction = "You are an expert summarization AI. Your task is to provide a concise summary of the following conversation history. Focus on extracting key information, decisions, and main topics. Output only the summary text itself, without any conversational preamble or commentary.";
  
  const userPromptForSummary = "CONCISE SUMMARY OF THE ABOVE CONVERSATION HISTORY:";

  const summarizationMessages = [
    { role: 'system', content: systemInstruction },
    ...conversationMessagesToSummarize, 
    { role: 'user', content: userPromptForSummary } 
  ];

  const temperature = temperaturePresets[temperaturePreset] || temperaturePresets.balanced; 

  try {
    const result = await routeInferenceRequest({
      modelId: summarizationModelId,
      messages: summarizationMessages, 
      parameters: {
        temperature: temperature,
        max_tokens: MAX_SUMMARY_TOKENS,
        stop: ["\nUser:", "\nAssistant:"]
      },
      userId: userId,
      onToken: null, 
      autoTruncate: true 
    });

    if (!result || !result.message || result.message.trim() === '') {
      throw new Error('Summarization model returned an empty response.');
    }

    const summaryContent = result.message.trim();
    console.log(`[Summarization Service] Summary generated successfully (${summaryContent.length} chars).`);

    const newHistory = [];

    const systemMessages = messages.filter(msg => msg.role === 'system');
    newHistory.push(...systemMessages);

    newHistory.push({
      role: 'system', 
      content: `Summary of earlier conversation:\n${summaryContent}`,
      tokens: Math.ceil(summaryContent.length / 4) 
    });

    const lastMessages = messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-MESSAGES_TO_KEEP_AFTER_SUMMARY);
    newHistory.push(...lastMessages);

    return newHistory;

  } catch (error) {
    console.error(`[Summarization Service] Failed to generate summary using model ${summarizationModelId}:`, error);
    return messages;
  }
}

module.exports = {
  summarizeHistory,
};
