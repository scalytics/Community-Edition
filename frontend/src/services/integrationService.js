import apiService from './apiService';

/**
 * Service for managing integration configurations (OAuth, API keys, etc.)
 */
const integrationService = {
  /**
   * Get all integrations
   * @returns {Promise<Array>} List of all integrations
   */
  async getAllIntegrations() {
    try {
      const response = await apiService.get('/integrations');
      return response;
    } catch (error) {
      console.error('Error in getAllIntegrations:', error);
      throw error;
    }
  },

  /**
   * Get a specific integration by ID
   * @param {string} id - Integration ID
   * @returns {Promise<Object>} Integration details
   */
  async getIntegrationById(id) {
    try {
      const response = await apiService.get(`/integrations/${id}`);
      return response;
    } catch (error) {
      console.error(`Error in getIntegrationById(${id}):`, error);
      throw error;
    }
  },

  /**
   * Create a new integration
   * @param {Object} integrationData - Integration data
   * @returns {Promise<Object>} Created integration
   */
  async createIntegration(integrationData) {
    try {
      const response = await apiService.post('/integrations', integrationData);
      return response;
    } catch (error) {
      console.error('Error in createIntegration:', error);
      throw error;
    }
  },

  /**
   * Update an existing integration
   * @param {string} id - Integration ID
   * @param {Object} integrationData - Updated integration data
   * @returns {Promise<Object>} Updated integration
   */
  async updateIntegration(id, integrationData) {
    try {
      const response = await apiService.put(`/integrations/${id}`, integrationData);
      return response;
    } catch (error) {
      console.error(`Error in updateIntegration(${id}):`, error);
      throw error;
    }
  },

  /**
   * Delete an integration
   * @param {string} id - Integration ID
   * @returns {Promise<Object>} Response data
   */
  async deleteIntegration(id) {
    try {
      const response = await apiService.delete(`/integrations/${id}`);
      return response;
    } catch (error) {
      console.error(`Error in deleteIntegration(${id}):`, error);
      throw error;
    }
  },

  /**
   * Toggle an integration's enabled status
   * @param {string} id - Integration ID
   * @returns {Promise<Object>} Updated integration
   */
  async toggleIntegrationStatus(id) {
    try {
      const response = await apiService.patch(`/integrations/${id}/toggle`);
      return response;
    } catch (error) {
      console.error(`Error in toggleIntegrationStatus(${id}):`, error);
      throw error;
    }
  },

  /**
   * Get test client configuration
   * @param {string} id - Integration ID
   * @returns {Promise<Object>} Test client configuration
   */
  async getTestClientConfig(id) {
    try {
      const response = await apiService.get(`/integrations/${id}/test-config`);
      return response;
    } catch (error) {
      console.error(`Error in getTestClientConfig(${id}):`, error);
      throw error;
    }
  },

  /**
   * Get authentication configuration for all enabled integrations
   * @returns {Promise<Object>} Authentication configuration object with OAuth providers as keys
   */
  async getAuthConfig() {
    try {
      const response = await apiService.get('/integrations/auth/config');
      
      // If no enabled OAuth providers, will be empty object {}
      return response;
    } catch (error) {
      console.error('Error in getAuthConfig:', error);
      // Return empty object on error to avoid breaking OAuth checks
      return {};
    }
  },

  /**
   * Validate an API key without saving it
   * @param {string} provider - Provider name (e.g., 'OpenAI', 'Anthropic')
   * @param {string} apiKey - API key to validate
   * @returns {Promise<Object>} Validation result with isValid flag and message
   */
  async validateApiKey(provider, apiKey) {
    try {
      const response = await apiService.post('/integrations/validate-key', { provider, apiKey });
      return response;
    } catch (error) {
      console.error('Error in validateApiKey:', error);
      throw error;
    }
  }
};

export default integrationService;
