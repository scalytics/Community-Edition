const Joi = require('joi');
const { db } = require('../models/db');
const Model = require('../models/Model');
const UsageStatsService = require('../services/usageStatsService');
const inferenceRouter = require('../services/inferenceRouter');
const vllmService = require('../services/vllmService');
const { formatOpenAIStreamChunk, formatOpenAIResponse } = require('../utils/openaiFormatter');
const { approximateTokenCount } = require('../utils/tokenizer');
const { applyFilters } = require('../services/responseFilteringService');
const providerService = require('../services/providers/index.js');
const apiKeyService = require('../services/apiKeyService.js');

// --- Validation Schemas ---
const chatCompletionSchema = Joi.object({
  messages: Joi.array().min(1).items(Joi.object({
    role: Joi.string().valid('user', 'assistant', 'system').required(),
    content: Joi.alternatives().try(Joi.string().required().allow(''), Joi.array().items(Joi.object()).min(1)).required()
  })).required(),
  stream: Joi.boolean().optional().default(false),
  model: Joi.string().optional(),
  // Add other OpenAI params
  temperature: Joi.number().optional(),
  max_tokens: Joi.number().integer().optional(),
  top_p: Joi.number().optional(),
  frequency_penalty: Joi.number().optional(),
  presence_penalty: Joi.number().optional(),
  stream_options: Joi.object({
    include_usage: Joi.boolean().optional()
  }).optional()
});

// --- Controller ---

exports.handleChatCompletion = async (req, res) => {
  const { error, value } = chatCompletionSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: { message: error.details[0].message, type: 'invalid_request_error' } });
  }

  const { messages, stream, ...restParams } = value;
  const userId = req.userId;
  let model;

  try {
    // --- 1. Identify the Model ---
    const modelIdentifier = value.model;
    if (modelIdentifier) {
      // Try finding by ID first, then by external_model_id as a fallback for string-based IDs
      model = await db.getAsync(`SELECT * FROM models WHERE (id = ? OR external_model_id = ?) AND is_active = 1`, [modelIdentifier, modelIdentifier]);
    } else {
      // If no model is specified, use the currently active vLLM model as the primary
      const primaryModelId = vllmService.activeModelId;
      if (primaryModelId) {
        model = await db.getAsync(`SELECT * FROM models WHERE id = ? AND is_active = 1 AND is_embedding_model = 0`, [primaryModelId]);
      }
    }

    if (!model) {
      const errorMsg = modelIdentifier ? `Model '${modelIdentifier}' not found or is not active.` : `No primary model configured for the API.`;
      return res.status(404).json({ success: false, error: { message: errorMsg, type: 'invalid_request_error' } });
    }

    // --- 2. Route Based on Model Type (Internal vs. External) ---

    // EXTERNAL MODEL LOGIC
    if (model.external_provider_id) {
      // This part can be expanded later if needed, for now we focus on local vLLM
      return res.status(501).json({ success: false, error: { message: 'External provider models are not yet supported via this endpoint.', type: 'api_error' } });
    }

    // INTERNAL (vLLM) MODEL LOGIC
    const inputTokens = approximateTokenCount(messages.map(m => m.content).join(' '));

    if (stream) {
      // --- Streaming Response ---
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let fullResponseContent = '';
      const handleToken = (token) => {
        fullResponseContent += token;
        const chunk = formatOpenAIStreamChunk(model.name, token);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      try {
        await inferenceRouter.routeInferenceRequest({
          modelId: model.id,
          messages: messages,
          parameters: restParams,
          onToken: handleToken,
          userId: userId,
          disableDefaultSystemPrompt: true, // API should be raw
        });
        
        const outputTokens = approximateTokenCount(fullResponseContent);
        if (restParams.stream_options?.include_usage) {
            const usageChunk = formatOpenAIStreamChunk(model.name, null, { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens });
            res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');

      } catch (e) {
        console.error(`API Stream Error: ${e.message}`);
      } finally {
        res.end();
      }

    } else {
      // --- Non-Streaming Response ---
      try {
        const result = await inferenceRouter.routeInferenceRequest({
          modelId: model.id,
          messages: messages,
          parameters: restParams,
          userId: userId,
          disableDefaultSystemPrompt: true,
        });

        const filteredMessage = await applyFilters(result.message, userId);
        const outputTokens = approximateTokenCount(filteredMessage);
        const response = formatOpenAIResponse(model.name, filteredMessage, { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens });
        
        res.status(200).json(response);
        logTokenUsage(userId, model.id, inputTokens, outputTokens, Date.now() - req.requestStartTime);

      } catch (serviceError) {
        console.error(`API Non-Stream Error: ${serviceError.message}`);
        res.status(500).json({ success: false, error: { message: 'Failed to process request.', type: 'api_error' } });
      }
    }

  } catch (error) {
    console.error('Unexpected error in handleChatCompletion:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { message: 'An unexpected error occurred.', type: 'api_error' } });
    }
  }
};

async function logTokenUsage(userId, modelId, inputTokens, outputTokens, latencyMs) {
    try {
      await UsageStatsService.recordTokens({
        userId, modelId, chatId: null, 
        promptTokens: inputTokens, completionTokens: outputTokens,
        latencyMs, source: 'scalyticsApiController'
      });
    } catch (dbError) {
      console.error(`Failed to log API token usage for user ${userId}, model ${modelId}: ${dbError.message}`);
    }
}

// --- Other handlers (listModels, generateImageApi) ---

exports.listModelsHandler = async (req, res) => {
    try {
        const userId = req.userId;
        const activeUserModels = await Model.getActiveForUser(userId);
        const formattedModels = activeUserModels.map(model => ({
            id: model.id.toString(),
            name: model.name,
            object: "model",
            created: model.created_at ? Math.floor(new Date(model.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
            owned_by: model.external_provider_id ? (model.provider_name || 'external') : "system",
        }));
        res.status(200).json({ object: "list", data: formattedModels });
    } catch (error) {
        console.error('Error in listModelsHandler:', error);
        res.status(500).json({ success: false, error: { message: 'Failed to retrieve models.', type: 'api_error' } });
    }
};

exports.generateImageApi = async (req, res) => {
    // Placeholder for image generation logic
    res.status(501).json({ success: false, error: { message: 'Image generation not implemented.' } });
};
