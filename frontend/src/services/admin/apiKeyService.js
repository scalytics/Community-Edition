import apiService from '../apiService';

/**
 * Admin services for API key management
 */
const apiKeyService = {
  /**
   * Get all API keys (admin view)
   * @returns {Promise<Array>} All API keys with details including user info
   */
  getAllApiKeys: async () => {
    try {
      // Try direct API call with response debugging
      const response = await apiService.get('/admin/api-keys/all');
      
      // Handle different possible response structures
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      } else if (response.data && response.data.success && Array.isArray(response.data.data)) {
        return response.data.data;
      } else {
        console.warn("Unexpected API keys response format:", response.data);
        return [];
      }
    } catch (error) {
      console.error('Get API keys error:', error);
      throw error;
    }
  },

  /**
   * Get API key for a specific provider
   * @param {string|number} providerId - Provider ID
   * @returns {Promise<Object>} API key with details
   */
  getProviderApiKey: async (providerId) => {
    try {
      const response = await apiService.get(`/admin/api-keys/provider/${providerId}`);
      return response.data?.data;
    } catch (error) {
      console.error('Get provider API key error:', error);
      throw error;
    }
  },

  /**
   * Set or update API key
   * @param {Object} keyData - Key data including providerId, keyName, and keyValue
   * @returns {Promise<Object>} Created/updated key
   */
  setApiKey: async (keyData) => {
    try {
      const response = await apiService.post('/admin/api-keys', keyData);
      return response.data;
    } catch (error) {
      console.error('Set API key error:', error);
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
      const response = await apiService.delete(`/admin/api-keys/${keyId}`);
      return response.data;
    } catch (error) {
      console.error('Delete API key error:', error);
      throw error;
    }
  },

  /**
   * Deactivate an API key
   * @param {string|number} keyId - ID of the key to deactivate
   * @returns {Promise<Object>} Updated key
   */
  deactivateApiKey: async (keyId) => {
    try {
      const response = await apiService.put(`/admin/api-keys/${keyId}/deactivate`);
      return response.data;
    } catch (error) {
      console.error('Deactivate API key error:', error);
      throw error;
    }
  },

  /**
   * Activate an API key
   * @param {string|number} keyId - ID of the key to activate
   * @returns {Promise<Object>} Updated key
   */
  activateApiKey: async (keyId) => {
    try {
      const response = await apiService.put(`/admin/api-keys/${keyId}/activate`);
      return response.data;
    } catch (error) {
      console.error('Activate API key error:', error);
      throw error;
    }
  },

  /**
   * Test an API key
   * @param {Object} keyData - Key data including providerId and keyValue
   * @returns {Promise<Object>} Test result
   */
  testApiKey: async (keyData) => {
    try {
      const response = await apiService.post('/admin/api-keys/test', keyData);
      return response.data;
    } catch (error) {
      console.error('Test API key error:', error);
      throw error;
    }
  },
  
  /**
   * Get user's API keys
   * @returns {Promise<Array>} User's API keys
   */
  getUserApiKeys: async () => {
    try {
      const response = await apiService.get('/apikeys');
      return response.data?.data || [];
    } catch (error) {
      console.error('Get user API keys error:', error);
      throw error;
    }
  }
};

export default apiKeyService;
