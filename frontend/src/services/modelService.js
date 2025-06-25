import apiService from './apiService';

const MODEL_ENDPOINTS = {
  MODELS: '/models',
  MODEL: (id) => `/models/${id}`,
  CONTEXTS: (id) => `/models/${id}/contexts`
};

const API_KEY_ENDPOINTS = {
  PROVIDERS: '/apikeys/providers',
  KEYS: '/apikeys/keys',
  KEY: (id) => `/apikeys/keys/${id}`
};

const modelService = {
  /**
   * Get all available models
   * @returns {Promise<Array>} List of models
   */
  getModels: async () => {
    try {
      const response = await apiService.get(MODEL_ENDPOINTS.MODELS);
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get a single model by ID
   * @param {string|number} modelId - ID of the model to retrieve
   * @returns {Promise<Object>} Model data
   */
  getModel: async (modelId) => {
    try {
      const response = await apiService.get(MODEL_ENDPOINTS.MODEL(modelId));
      return response.data || null;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Add a new model (admin only)
   * @param {Object} modelData - Model data
   * @returns {Promise<Object>} Created model
   */
  addModel: async (modelData) => {
    try {
      const response = await apiService.post(MODEL_ENDPOINTS.MODELS, modelData);
      return response.data || null;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update a model (admin only)
   * @param {string|number} modelId - ID of the model to update
   * @param {Object} modelData - Updated model data
   * @returns {Promise<Object>} Updated model
   */
  updateModel: async (modelId, modelData) => {
    try {
      const response = await apiService.put(MODEL_ENDPOINTS.MODEL(modelId), modelData);
      return response.data || null;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Activate a local model (admin only)
   * @param {string|number} modelId - ID of the model to activate
   * @returns {Promise<Object>} Activation confirmation
   */
  activateModel: async (modelId) => {
    try {
      // Assuming the endpoint is POST /admin/models/:id/activate
      // Adjust if the actual endpoint differs
      return await apiService.post(`/admin/models/${modelId}/activate`);
    } catch (error) {
      
      throw error; 
    }
  },

  /**
   * Deactivate the currently active local model (admin only)
   * @returns {Promise<Object>} Deactivation confirmation
   */
  deactivateModel: async () => {
    try {
      return await apiService.post(`/admin/models/deactivate`);
    } catch (error) {
      
      throw error; 
    }
  },

  /**
   * Update only the active status of a model (admin only)
   * @param {string|number} modelId - ID of the model to update
   * @param {Object} statusData - Object containing the new status, e.g., { isActive: boolean }
   * @returns {Promise<Object>} Updated model status confirmation
   */
  updateModelStatus: async (modelId, statusData) => {
    try {
      return await apiService.patch(`/admin/models/${modelId}/status`, statusData);
    } catch (error) {
      
      throw error; 
    }
  },

  /**
   * Delete a model (admin only)
   * @param {string|number} modelId - ID of the model to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteModel: async (modelId) => {
    try {
      return await apiService.delete(MODEL_ENDPOINTS.MODEL(modelId));
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get model contexts
   * @param {string|number} modelId - ID of the model
   * @returns {Promise<Array>} List of contexts for the model
   */
  getModelContexts: async (modelId) => {
    try {
      const response = await apiService.get(MODEL_ENDPOINTS.CONTEXTS(modelId));
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Add a new context to a model (admin only)
   * @param {string|number} modelId - ID of the model
   * @param {Object} contextData - Context data
   * @returns {Promise<Object>} Created context
   */
  addModelContext: async (modelId, contextData) => {
    try {
      const response = await apiService.post(MODEL_ENDPOINTS.CONTEXTS(modelId), contextData);
      return response.data || null;
    } catch (error) {
      throw error;
    }
  },

  // ----- API Key Management -----

  /**
   * Get all available API providers
   * @returns {Promise<Array>} List of API providers
   */
  getApiProviders: async () => {
    try {
      const response = await apiService.get(API_KEY_ENDPOINTS.PROVIDERS);
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get user's API keys
   * @returns {Promise<Array>} List of user's API keys
   */
  getUserApiKeys: async () => {
    try {
      const response = await apiService.get(API_KEY_ENDPOINTS.KEYS);
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Add a new API key
   * @param {Object} keyData - API key data
   * @param {number} keyData.providerId - ID of the provider
   * @param {string} keyData.apiKey - The API key to add
   * @returns {Promise<Object>} Added key info
   */
  addApiKey: async (keyData) => {
    try {
      const response = await apiService.post(API_KEY_ENDPOINTS.KEYS, keyData);
      return response.data || null;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete an API key
   * @param {string|number} keyId - ID of the key to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteApiKey: async (keyId) => {
    try {
      return await apiService.delete(API_KEY_ENDPOINTS.KEY(keyId));
    } catch (error) {
      throw error;
    }
  },

  /**
 * Get API providers with detailed information including URLs
 * @returns {Promise<Array>} List of API providers with details
 */
  getApiProviderDetails: async () => {
    try {
      const response = await apiService.get(API_KEY_ENDPOINTS.PROVIDERS + '/details');
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get models for a specific provider
   * @param {number} providerId - The ID of the provider
   * @returns {Promise<Array>} List of models for the provider
   */
  getModelsByProvider: async (providerId) => {
    try {
      const response = await apiService.get(MODEL_ENDPOINTS.MODELS, {
        params: { provider_id: providerId }
      });
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get models available to the current user (based on group permissions)
   * @returns {Promise<Array>} List of models the user can access
   */
  getAvailableModels: async () => {
    try {
      // This endpoint should filter models based on group access
      const response = await apiService.get('/admin/available');

      // Transform the response structure to match what ModelSelector expects
      const availableModels = [];
      const data = response.data || {};

      // Flatten the provider-grouped structure into a simple array of models
      Object.entries(data).forEach(([providerName, models]) => {
        models.forEach(model => {
          availableModels.push({
            ...model,
            provider_name: providerName !== 'Local' ? providerName : undefined,
            external_provider_id: providerName !== 'Local' ? true : undefined,
            is_active: true
          });
        });
      });

      return availableModels;
    } catch (error) {
      
      throw error;
    }
  },

  /**
   * Get all Scalytics MCP agents
   * @returns {Promise<Array>} - Agent objects
   */
  getMCPAgents: async () => {
    try {
      // Use existing models endpoint and filter for MCP models
      const models = await modelService.getModels();
      return models.filter(model => 
        model.provider_name === 'Scalytics MCP' || 
        model.provider_name === 'MCP'
      );
    } catch (error) {
      
      throw error;
    }
  },
  
  /**
   * Get capabilities for a specific MCP agent/model
   * @param {number|string} id - Model ID
   * @returns {Promise<Object>} - Agent capabilities
   */
  /**
   * Get active models for the current user
   * This includes models the user has permission to access and
   * external provider models for which the user has an active API key
   * If global privacy mode is enabled, only local models will be returned
   * @returns {Promise<Array>} List of active models available to the user
   */
  getActiveModels: async () => {
    // Simplified: Try fetching from /models/active. Let errors propagate.
    // The component calling this should handle errors and loading states.
    const response = await apiService.get('/models/active');

    // Expecting response format { success: true, data: [...] } or similar
    if (response && response.success && Array.isArray(response.data)) {
      // Ensure every model has at least the minimum required fields
      return response.data.map(model => ({
        id: model.id,
        name: model.name || 'Unknown Model',
        is_active: model.is_active !== false,
        can_use: model.can_use !== false,
        provider_name: model.provider_name || null,
        ...model
      }));
    } else {
      // Throw an error if the response format is unexpected
      console.error('Unexpected response format from /models/active:', response);
      throw new Error('Failed to fetch active models: Invalid response format.');
    }
    // Removed internal catch block and fallback logic. Errors will now throw.
  },

  getMCPAgentCapabilities: async (id) => {
    try {
      // Get the model info using the existing endpoint
      const model = await modelService.getModel(id);
      
      if (model.provider_name === 'Scalytics MCP' || model.provider_name === 'MCP') {
        return {
          ...model,
          capabilities: {
            context_window: model.context_window || 8192,
            supports_tools: true,
            supports_functions: true,
            supports_vision: false,
            tools: ['web-search', 'code-interpreter', 'data-analysis']
          }
        };
      }
      
      return model;
    } catch (error) {
      
      throw error;
    }
  },
  
  /**
   * Start a chat with a Scalytics MCP agent
   * @param {number|string} agentId - Agent ID
   * @param {Array} tools - Selected tools to enable
   * @param {string} title - Chat title
   * @returns {Promise<Object>} - Created chat
   */
  startMCPChat: async (agentId, tools = [], title = null) => {
    try {
      const chatResponse = await modelService.post('/api/chats', {
        modelId: agentId,
        title: title || `Chat with Scalytics MCP Agent`
      });
      
      // Future enhancement: Store selected tools as chat metadata when that API is available
      
      return chatResponse.data.data;
    } catch (error) {
      
      throw error;
    }
  },

  /**
   * Format the model name for display
   * @param {Object} model - Model object
   * @returns {string} Formatted model name
   */
  formatModelName: (model) => {
    if (!model) return 'Unknown Model';

    if (model.external_provider_id) {
      // For external models, show the provider
      const providerPrefix = model.provider_name ? `${model.provider_name}: ` : '';
      return `${providerPrefix}${model.name}`;
    }

    return model.name;
  },

  /**
   * Get the currently active embedding model
   * @returns {Promise<Object>} Object containing success status and the active embedding model data, or an error message.
   */
  getActiveEmbeddingModel: async () => {
    try {
      // 1. Fetch the ID of the preferred embedding model
      const idResponse = await apiService.get('/admin/settings/preferred-embedding-model');

      // This check was incorrect as the controller always returns success:true
      // if (!idResponse || !idResponse.success || !idResponse.data) {
      //   return { success: false, message: 'Could not determine active embedding model.', data: null };
      // }

      // Accessing idResponse.data.preferred_local_embedding_model_id was also incorrect
      // The controller returns { success: true, data: { preferredEmbeddingModel: { ... } | null } }
      const modelId = idResponse?.data?.preferredEmbeddingModel?.id; // Attempt to get ID if details are present

      if (modelId === null || modelId === undefined) {
        return { success: true, message: 'No active embedding model configured.', data: null };
      }

      // 2. Fetch the full model details using the ID (This part was redundant as controller returns details)
      // Use the existing getModel function
      const modelData = await modelService.getModel(modelId); // This fetch is likely unnecessary now

      if (modelData) {
        return { success: true, data: modelData };
      } else {
        
        return { success: false, message: `Could not fetch details for active embedding model (ID: ${modelId}). It might have been deleted.`, data: null };
      }

    } catch (error) {
      
      return { success: false, message: error.message || 'Failed to fetch embedding model', data: null };
    }
  }
};

export default modelService;
