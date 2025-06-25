const path = require('path');
const fs = require('fs').promises;
const { db } = require('../models/db');
const apiKeyController = require('../controllers/apiKeyController');
const { getProviderConfig, getProviderEndpoint, getProviderApiVersion } = require('../utils/providerConfig');
const { handleExternalApiRequest } = require('./providers/handler');
const Message = require('../models/Message');
const Chat = require('../models/Chat'); 
const eventBus = require('../utils/eventBus');

// Default System Prompt
const SCALA_SYSTEM_PROMPT = `You are Auri, the friendly and concise enterprise AI assistant. Follow these core guidelines:

1. CONTEXT ADHERENCE: Respond using only information from provided documents and conversation history. Never draw from external knowledge or make assumptions beyond what is explicitly available.

2. TRANSPARENCY: When information is unavailable in the provided context, clearly state: "I don't have this information in the available documents." Always distinguish between factual responses and necessary speculation.

3. PRIVACY PROTECTION: Never request, store, or share sensitive information. Treat all user data as confidential, processing only information provided within the current session and following enterprise data protection protocols.

4. POLICY COMPLIANCE: Operate within enterprise guidelines and compliance requirements. Provide factual, unbiased information without offering unauthorized advice (financial, legal, medical, etc.) or generating harmful content.

Deliver honest, respectful, and accurate responses. When uncertain, acknowledge limitations rather than providing potentially false information. For unclear questions, explain the issue instead of attempting to answer. Maintain unbiased, constructive communication free from harmful or inappropriate content.`;


// Modified function signature to accept a single options object
exports.createChatCompletion = async (options) => {
  const {
    userModel: model,
    previousMessages,
    content: userMessage,
    privateMode = false,
    userId = null,
    files = [],
    streamingContext = null,
    onToken = null,
    disableDefaultSystemPrompt = false, 
    isImagePrompt = false 
  } = options;

  const placeholderAssistantMessageId = streamingContext?.messageId;

  // --- Internal Tool Command Check ---
  if (userMessage && userMessage.toLowerCase().startsWith('/livesearch ')) {
    const MCPService = require('./agents/MCPService'); 
    const toolName = 'live-search';
    const query = userMessage.substring('/livesearch '.length).trim();

    if (placeholderAssistantMessageId && streamingContext && streamingContext.chatId) {
      try {
        const informationalContent = `[Tool: ${toolName}] process initiated for query: "${query.substring(0,50)}...". Updates will follow as new messages.`;
        await Message.update(placeholderAssistantMessageId, {
            content: informationalContent,
            isLoading: false
        });
        eventBus.publish('chat:complete', {
            chatId: streamingContext.chatId,
            messageId: placeholderAssistantMessageId,
            message: informationalContent,
            usage: null,
            status: 'completed_tool_initiated',
            timestamp: new Date().toISOString()
        });
      } catch (updateError) {
        console.error(`[chatService] Failed to update placeholder for tool ${toolName}:`, updateError);
      }
    }

    try {
      const configRow = await db.getAsync(
          'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
          [userId, toolName]
      );
      if (!configRow || !configRow.config) {
        throw new Error(`Configuration for tool '${toolName}' not found for user ${userId}.`);
      }
      const toolConfig = JSON.parse(configRow.config);
      let reasoningModelIdentifier = toolConfig.reasoningModelName;
      if (!reasoningModelIdentifier) throw new Error(`Reasoning model not configured for ${toolName}.`);

      if (/^\d+$/.test(reasoningModelIdentifier)) { 
           const modelRecord = await db.getAsync('SELECT name, external_model_id FROM models WHERE id = ?', [parseInt(reasoningModelIdentifier, 10)]);
           if (!modelRecord) throw new Error(`Configured reasoning model ID ${reasoningModelIdentifier} not found.`);
           reasoningModelIdentifier = modelRecord.external_model_id || modelRecord.name;
      }

      const toolArgs = {
          query: query,
          reasoningModelName: reasoningModelIdentifier,
          search_providers: toolConfig.search_providers || [],
          max_iterations: toolConfig.max_iterations !== undefined ? toolConfig.max_iterations : 10,
          fileIds: files || [] 
      };
      const toolContext = { userId, chatId: streamingContext?.chatId };

      // Asynchronously call the internal tool. Don't await its full completion here.
      // The tool itself will post messages.
      MCPService.callInternalTool(toolName, toolArgs, toolContext)
        .then(toolResult => {
        })
        .catch(toolError => {
          console.error(`[chatService] Error executing internal tool '${toolName}' (invoked via command):`, toolError);
          // The tool itself should ideally post an error message to the chat if it fails during its run.
          // For now, just log. A more robust error handling might involve another system message.
           Message.create({
               chatId: streamingContext?.chatId,
               role: 'system',
               content: `[Tool: ${toolName}] Error during execution: ${toolError.message}`
           }).catch(console.error);
        });

      // Return a marker indicating an internal tool was executed.
      // This tells chatController.sendMessage not to expect a typical LLM completion for the placeholder.
      return { internalToolExecuted: true, toolName: toolName, statusMessage: "Tool process initiated." };

    } catch (toolSetupError) {
      console.error(`[chatService] Error setting up or calling internal tool '${toolName}':`, toolSetupError);
      if (placeholderAssistantMessageId && streamingContext && streamingContext.chatId) {
        await Message.update(placeholderAssistantMessageId, { content: `Error starting tool ${toolName}: ${toolSetupError.message}`, isLoading: false });
        eventBus.publish('chat:error', { 
            chatId: streamingContext.chatId,
            messageId: placeholderAssistantMessageId,
            error: `Error starting tool ${toolName}: ${toolSetupError.message}`
        });
      }
      throw toolSetupError; 
    }
  }
  // --- End Internal Tool Command Check ---


  if (streamingContext && !placeholderAssistantMessageId) {
    console.error("[createChatCompletion] Error: streamingContext was provided but messageId (placeholder ID) is missing for non-tool path.");
    throw new Error("Internal error: Missing placeholder message ID for streaming context.");
  }

  try {
    // --- External Model Handling OR Image Prompt Handling ---
    if (isImagePrompt || model.external_provider_id) {
      if (model.external_provider_id && privateMode && !process.env.ALLOW_EXTERNAL_IN_PRIVATE) { 
        await Message.update(placeholderAssistantMessageId, { content: 'External APIs cannot be used in private mode', isLoading: false });
        throw new Error('External APIs cannot be used in private mode.');
      }

      const fileContentsForExternal = await processFilesForContext(files, userId);
      const combinedUserMessageForExternal = fileContentsForExternal ? `${fileContentsForExternal}\n\n${userMessage}` : userMessage;

      // Determine the prompt to send: direct user message for images, combined for text.
      const promptForProvider = isImagePrompt ? userMessage : combinedUserMessageForExternal;
      const filesForProvider = isImagePrompt ? [] : files; 

      // Call handleExternalApiRequest, passing isImagePrompt and the correct model object
      const externalResult = await handleExternalApiRequest({
          model, 
          prompt: promptForProvider,
          isImagePrompt, 
          parameters: {}, 
          previousMessages: isImagePrompt ? [] : previousMessages, 
          userId,
          files: filesForProvider,
          streamingContext: isImagePrompt ? null : streamingContext, 
          onToken: isImagePrompt ? null : onToken 
      });

      if (!streamingContext || isImagePrompt) { 
          if (isImagePrompt && placeholderAssistantMessageId) {
            await Message.update(placeholderAssistantMessageId, { content: externalResult.message, isLoading: false });
            eventBus.publish('chat:complete', {
              chatId: streamingContext.chatId, 
              messageId: placeholderAssistantMessageId,
              message: externalResult.message,
              usage: externalResult.usage,
              status: 'completed_image', 
              timestamp: new Date().toISOString()
            });
          }
          return externalResult; 
      } else { 
          await Message.update(placeholderAssistantMessageId, { content: externalResult.message, isLoading: false });
          eventBus.publish('chat:complete', {
            chatId: streamingContext.chatId,
            messageId: placeholderAssistantMessageId,
            message: externalResult.message,
            usage: externalResult.usage,
            elapsed: (Date.now() - Date.parse(streamingContext.startTime || Date.now())) / 1000
          });
          return externalResult;
      }
    }

    // --- Local Model Handling (Text-only, no changes needed for image generation here) ---
    const fileContents = await processFilesForContext(files, userId);
    let combinedUserMessage = fileContents ? `${fileContents}\n\n${userMessage}` : userMessage;

    // --- Start Feedback Integration ---
    try {
      const lastAssistantMessage = previousMessages.filter(m => m.role === 'assistant').pop();
      if (lastAssistantMessage) {
        const feedback = await db.getAsync(
          `SELECT rating FROM message_feedback WHERE message_id = ? AND user_id = ?`,
          [lastAssistantMessage.id, userId]
        );
        if (feedback && feedback.rating === -1) {
          console.log(`[chatService] Applying grounding prompt due to negative feedback on message ${lastAssistantMessage.id}`);
          const groundingInstruction = "[System Note: Previous response was rated negatively for grounding/accuracy. Please ensure this response is factually accurate and directly supported by the provided context.]\n";
          combinedUserMessage = groundingInstruction + combinedUserMessage;
        }
      }
    } catch (feedbackError) {
      console.error("[chatService] Error fetching feedback for grounding prompt:", feedbackError);
    }
    // --- End Feedback Integration ---

    const streamProvider = require('./providers/stream'); 

    function getDefaultStopTokens(model, isJsonGeneration = false) {
      if (isJsonGeneration) {
        return ['<end_of_turn>', '<start_of_turn>', '\n\nUser:', '\n\nAssistant:', '</s>', '<|endoftext|>', '\n\n\n'];
      }

      let formatType = 'default';
      const modelName = model.name?.toLowerCase() || '';
      const modelPath = model.model_path?.toLowerCase() || '';

      if (model.prompt_format_type) formatType = model.prompt_format_type;
      else if (model.model_family) {
         const family = model.model_family.toLowerCase();
         if (['mistral', 'llama', 'deepseek', 'phi', 'gemma'].includes(family)) formatType = family;
      } else {
         if (modelName.includes('mistral') || modelPath.includes('mistral') || modelName.includes('mixtral') || modelPath.includes('mixtral')) formatType = 'mistral';
         else if (modelName.includes('llama') || modelPath.includes('llama') || modelName.includes('vicuna') || modelPath.includes('vicuna')) formatType = 'llama';
         else if (modelName.includes('deepseek') || modelPath.includes('deepseek')) formatType = 'deepseek';
         else if (modelName.includes('phi') || modelPath.includes('phi')) formatType = 'phi';
         else if (modelName.includes('gemma') || modelPath.includes('gemma')) formatType = 'gemma';
      }

      switch (formatType) {
        case 'llama': return ['</s>', '<|eot_id|>', '[INST]', '[/INST]']; // Llama 2/3 EOS, Llama 3 EOT, and instruction tags
        case 'mistral': return ['</s>', '<|im_end|>']; // Mistral/Mixtral EOS and chat end token
        case 'phi': return ['<|end|>']; // Standard Phi EOS token
        case 'gemma': return ['<end_of_turn>', '<start_of_turn>']; // Gemma EOS and turn tags
        case 'deepseek': return ['<｜end of sentence｜>', '<｜fim begin｜>', '<｜fim end｜>', '<｜fim middle｜>']; // Deepseek Coder/Chat specific tokens
        default: return ['<|endoftext|>', '\nUser:', '\nAssistant:']; // Common defaults
      }
    }

    // Define base parameters, adding default stop tokens
    const baseParameters = {
      temperature: 0.7,
      stop: getDefaultStopTokens(model) 
    };

    const parameters = { ...baseParameters, ...(options.parameters || {}) };

    // --- Determine Effective System Prompt (User Prompt + Optional Enforced Scala Prompt) ---
    let finalSystemPrompt = ''; 

    // Only apply default/enforced prompts if not explicitly disabled (User Prompt + Enforced Scala Prompt)
    if (!disableDefaultSystemPrompt) {
        let userCustomPromptText = ''; 

    // 1. Get User's Custom Prompt
    if (userId) {
      try {
        const userSettings = await db.getAsync('SELECT custom_system_prompt FROM users WHERE id = ?', [userId]);
        if (userSettings && userSettings.custom_system_prompt && userSettings.custom_system_prompt.trim() !== '') {
          userCustomPromptText = userSettings.custom_system_prompt.trim();
          finalSystemPrompt = userCustomPromptText; // Start with user prompt
          console.log(`[chatService] Using user custom prompt for user ${userId}.`);
        } else {
           console.log(`[chatService] No user custom prompt found for user ${userId}.`);
        }
      } catch (userSettingsError) {
        console.error(`[chatService] Error fetching user settings for user ${userId}:`, userSettingsError);
        console.log(`[chatService] Proceeding without user custom prompt due to error.`);
      }
    } else {
       console.log(`[chatService] No user ID provided, cannot fetch user custom prompt.`);
    }

    // 2. Check if Scala System Prompt is enforced and append it
    if (model.enable_scala_prompt) {
      if (finalSystemPrompt) {
        finalSystemPrompt += `\n\n${SCALA_SYSTEM_PROMPT}`;
        console.log(`[chatService] Appending enforced Scala System Prompt for model ${model.id} after user prompt.`);
      } else {
        finalSystemPrompt = SCALA_SYSTEM_PROMPT;
        console.log(`[chatService] Using enforced Scala System Prompt for model ${model.id} (no user prompt found).`);
      }
    } else {
       if (finalSystemPrompt) {
           console.log(`[chatService] Scala prompt disabled. Using only user custom prompt.`);
       } else {
           console.log(`[chatService] Scala prompt disabled and no user custom prompt. No system prompt will be used.`);
       }
    }
    // --- End Determine Effective System Prompt ---
    } // End of the !disableDefaultSystemPrompt block



    // --- Prepare Messages for Router (including Effective System Prompt) ---
    let messagesForRouter = [...previousMessages]; 

    if (finalSystemPrompt) {
      const existingSystemMessageIndex = messagesForRouter.findIndex(msg => msg.role === 'system');
      if (existingSystemMessageIndex !== -1) {
        // If a system message already exists, prepend the new one.
        // This handles cases where history might already contain a system message.
        // Avoid duplicating if it's somehow already there (unlikely with current logic but safe).
        if (!messagesForRouter[existingSystemMessageIndex].content.startsWith(finalSystemPrompt)) {
             messagesForRouter[existingSystemMessageIndex].content = `${finalSystemPrompt}\n\n${messagesForRouter[existingSystemMessageIndex].content}`;
        }
      } else {
        // Insert the final system message at the beginning if none exists
        messagesForRouter.unshift({ role: 'system', content: finalSystemPrompt });
      }
    }
    messagesForRouter.push({ role: 'user', content: combinedUserMessage });
    // --- End Prepare Messages ---


    // Call the Inference Router which handles context management, summarization, formatting, and provider routing
    const inferenceRouter = require('./inferenceRouter'); 
    const responsePromise = inferenceRouter.routeInferenceRequest({
      modelId: model.id,
      messages: messagesForRouter, 
      parameters: parameters, 
      userId: userId, 
      streamingContext: streamingContext, 
      onToken: onToken, 
      autoTruncate: true 
    });

    // Return the promise - the controller's .then/.catch will handle DB updates
    return responsePromise;

  } catch (error) {
    console.error('[createChatCompletion] Initial setup error:', error);
    try {
      await Message.update(placeholderAssistantMessageId, { content: `Error: ${error.message}`, isLoading: false });
    } catch (dbError) {
      console.error(`[createChatCompletion] Failed to update placeholder message ${placeholderAssistantMessageId} with error:`, dbError);
    }
    throw error; 
  }
};

async function processFilesForContext(fileIds, userId) {
  try {
    if (!fileIds || fileIds.length === 0) return '';

    const fileProcessingService = require('./fileProcessingService');
    const fileResults = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const fileData = await fileProcessingService.processFileForModel(fileId, userId);

          return `--- File: ${fileData.filename} (${fileData.type}) ---\n${fileData.contents}\n`;
        } catch (error) {
          console.error(`Error processing file ${fileId}:`, error);
          return `[Error processing file]`;
        }
      })
    );

    return fileResults.join('\n');
  } catch (error) {
    console.error('Error processing files for context:', error);
    return '[Error processing attached files]';
  }
}
