// Use the wrapper instead of direct import
const mcpWrapper = require('./mcpWrapper');
const { getProviderConfig } = require('../../utils/providerConfig');

/**
 * Scalytics MCP Provider Definition
 * Enhanced with client caching and ESM compatibility
 */
const MCPProvider = {
  name: 'Scalytics MCP',
  description: 'Model Context Protocol provider for standardized model interactions',
  
  // Client instance cache to avoid creating new instances for every request
  _clientInstances: {},
  
  /**
   * Initialize or retrieve cached MCP client instance
   * @private
   */
  _getClient: async function(options = {}) {
    // Create a cache key based on baseUrl
    const baseUrl = options.baseUrl || process.env.MCP_API_BASE_URL || 'https://api.example.com/mcp';
    const cacheKey = baseUrl;
    
    // Return cached instance if available
    if (this._clientInstances[cacheKey]) {
      return this._clientInstances[cacheKey];
    }
    
    try {
      // Use the wrapper to create a client instance
      this._clientInstances[cacheKey] = await mcpWrapper.createClient({
        baseURL: baseUrl,
        defaultOptions: {
          temperature: 0.7,
          max_tokens: 1000
        }
      });
      
      return this._clientInstances[cacheKey];
    } catch (error) {
      console.error('Error initializing MCP client:', error);
      throw error;
    }
  },
  
  /**
   * Discover available MCP-compatible models
   * @param {Object} options - Discovery options
   * @returns {Promise<Array>} - Array of model objects
   */
  discoverModels: async function(options = {}) {
    try {
      const { baseUrl } = options;
      
      const client = await this._getClient({ baseUrl });
      
      try {
        // Try both potential API patterns for model listing
        let models;
        if (client.models && typeof client.models.list === 'function') {
          // Modern MCP client pattern
          models = await client.models.list();
        } else if (typeof client.listModels === 'function') {
          // Legacy/alternative pattern
          models = await client.listModels();
        } else {
          throw new Error('No method available to list models in MCP client');
        }
        
        // Handle both array and object with data property responses
        const modelArray = Array.isArray(models) ? models : 
                          (models.data && Array.isArray(models.data)) ? models.data : 
                          [];
        
        return modelArray.map(model => ({
          id: model.id,
          name: model.name || model.id,
          description: model.description || `Scalytics MCP model: ${model.id}`,
          context_window: model.context_length || model.contextLength || 4096,
          provider: 'Scalytics MCP'
        }));
      } catch (apiError) {
        console.error('Error calling MCP models API:', apiError);
        
        // Fall back to default models if API call fails
        return this.getDefaultModels().map(model => ({
          ...model,
          provider: 'Scalytics MCP'
        }));
      }
    } catch (error) {
      console.error('Error discovering MCP models:', error);
      throw error;
    }
  },
  
  /**
   * Validate service availability (no API key needed)
   * @returns {Promise<boolean>} - True if service is available
   */
  validateService: async function(baseUrl = null) {
    try {
      const client = await this._getClient({ baseUrl });
      
      // Try different methods to check service availability
      if (client.models && typeof client.models.list === 'function') {
        await client.models.list();
        return true;
      } else if (typeof client.listModels === 'function') {
        await client.listModels();
        return true;
      }
      
      // If no validation method available, assume service is available
      console.warn('No method available to validate MCP service, assuming available');
      return true;
    } catch (error) {
      console.error('MCP service validation error:', error.message);
      return false;
    }
  },
  
  /**
   * Get default models that should always be available
   * @returns {Array} - Array of default model objects
   */
  getDefaultModels: function() {
    return [
      {
        id: 'scalytics-mcp-standard',
        name: 'Scalytics MCP Standard',
        description: 'Standard model using Scalytics MCP',
        context_window: 8192
      },
      {
        id: 'scalytics-mcp-large',
        name: 'Scalytics MCP Large',
        description: 'Large context model using Scalytics MCP',
        context_window: 32768
      }
    ];
  },
  
  /**
   * Format messages for the MCP API
   * @param {Array} messages - Previous messages
   * @param {string} userMessage - New user message
   * @returns {Object} - Formatted messages for the API
   */
  formatMessages: function(messages, userMessage) {
    // Extract system messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const systemPrompt = systemMessages.length > 0 
      ? systemMessages.map(msg => msg.content).join('\n')
      : '';
    
    // Format conversation history - ensure role is 'user' or 'assistant'
    const conversationHistory = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
    
    // Add the new user message
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });
    
    // Create MCP context object
    return {
      system: systemPrompt,
      messages: conversationHistory,
      // Add MCP-specific metadata
      metadata: {
        protocol: 'mcp',
        version: '1.0',
        permissions: ['readInputs', 'writeOutputs']
      }
    };
  },
  
  /**
   * Call the MCP API
   * @param {string} apiKey - API key (not used for MCP)
   * @param {string} modelId - Model ID to use
   * @param {Object} formattedMessages - Formatted messages object
   * @returns {Promise<Object>} - API response
   */
  callApi: async function(apiKey = null, modelId, formattedMessages) {
    try {
      const client = await this._getClient({ 
        baseUrl: process.env.MCP_API_BASE_URL
      });
      
      // Prepare request parameters
      const params = {
        model: modelId,
        messages: formattedMessages.messages,
        max_tokens: 1000,
        temperature: 0.7
      };
      
      // Add system prompt if available
      if (formattedMessages.system) {
        params.system = formattedMessages.system;
      }
      
      // Add metadata if available
      if (formattedMessages.metadata) {
        params.metadata = formattedMessages.metadata;
      }
      
      // Try different API patterns for creating completions
      let response;
      if (client.completions && typeof client.completions.create === 'function') {
        response = await client.completions.create(params);
      } else if (client.chat && client.chat.completions && typeof client.chat.completions.create === 'function') {
        response = await client.chat.completions.create(params);
      } else if (typeof client.create === 'function') {
        response = await client.create(params);
      } else {
        throw new Error('No appropriate method found to create completions in MCP client');
      }
      
      // Handle different possible response formats
      let content = '';
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        if (choice.message && choice.message.content) {
          content = choice.message.content;
        } else if (choice.text) {
          content = choice.text;
        } else if (typeof choice.content === 'string') {
          content = choice.content;
        }
      }
      
      return {
        message: content,
        usage: response.usage || {},
        provider: 'Scalytics MCP'
      };
    } catch (error) {
      console.error('Scalytics MCP API error:', error);
      throw new Error(`Scalytics MCP API error: ${error.message}`);
    }
  },
  
  // Flag indicating this provider doesn't require an API key
  requiresApiKey: false
};

module.exports = MCPProvider;