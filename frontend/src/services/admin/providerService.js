import apiService from '../apiService';

/**
 * Admin services for provider management
 */
const providerService = {
  /**
   * Get all providers (admin view)
   * @returns {Promise<Array>} All providers with full details
   */
  getProviders: async () => {
    try {
      const response = await apiService.get('/admin/providers');
      
      // Handle different possible response structures
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      } else if (response.data && response.data.success && Array.isArray(response.data.data)) {
        return response.data.data;
      } else {
        console.warn("Unexpected providers response format:", response.data);
        return [];
      }
    } catch (error) {
      console.error('Get providers error:', error);
      throw error;
    }
  },

  /**
   * Update a provider
   * @param {string|number} providerId - ID of the provider to update
   * @param {Object} providerData - Data to update
   * @returns {Promise<Object>} Updated provider
   */
  updateProvider: async (providerId, providerData) => {
    try {
      const response = await apiService.put(`/admin/providers/${providerId}`, providerData);
      return response.data;
    } catch (error) {
      console.error('Update provider error:', error);
      throw error;
    }
  },

  /**
   * Add a new provider
   * @param {Object} providerData - Provider data
   * @returns {Promise<Object>} Created provider
   */
  addProvider: async (providerData) => {
    try {
      // Validate required fields
      if (!providerData.name || !providerData.name.trim()) {
        throw new Error("Provider name is required");
      }
      
      if (!providerData.api_url || !providerData.api_url.trim()) {
        throw new Error("API URL is required");
      }
      
      // Ensure URL format is valid
      if (!providerData.api_url.startsWith('http://') && !providerData.api_url.startsWith('https://')) {
        throw new Error("API URL must start with http:// or https://");
      }
      
      // Map frontend model to match the database schema
      // Based on the api_providers table structure:
      // (id, name, description, api_url, endpoints, api_version, is_active, created_at, updated_at)
      const backendData = {
        name: providerData.name.trim(),
        description: providerData.description?.trim() || '',
        api_url: providerData.api_url.trim(),
        is_active: providerData.is_active ? 1 : 0,
        // Store endpoints as JSON string
        endpoints: JSON.stringify({
          models: providerData.endpoints?.models?.trim() || '',
          chat: providerData.endpoints?.chat?.trim() || '',
          validate: providerData.endpoints?.validate?.trim() || ''
        })
      };
      
      // Make the API call using apiService
      const response = await apiService.post('/admin/providers', backendData);
      return response.data;
    } catch (error) {
      // Enhanced error handling with more details
      console.error('Add provider error:', error);
      
      // Extract more meaningful error information
      const errorDetails = {
        message: "Error adding provider",
        originalError: error
      };
      
      if (error.response) {
        // Server responded with an error status
        errorDetails.status = error.response.status;
        errorDetails.serverMessage = error.response.data?.message || error.response.data || 'Unknown server error';
        
        if (error.response.status === 400) {
          errorDetails.message = `Validation error: ${errorDetails.serverMessage}`;
        } else if (error.response.status === 409) {
          errorDetails.message = `Provider with this name already exists: ${errorDetails.serverMessage}`;
        } else if (error.response.status === 500) {
          errorDetails.message = `Server error: ${errorDetails.serverMessage}`;
          // Add the specific SQLite error message if available
          if (typeof errorDetails.serverMessage === 'string' && 
              errorDetails.serverMessage.includes('SQLITE_ERROR')) {
            errorDetails.message += ` (${errorDetails.serverMessage})`;
          }
        }
      } else if (error.request) {
        // No response received
        errorDetails.message = "No response received from server. Please check your network connection.";
      }
      
      // Throw the enhanced error
      throw errorDetails;
    }
  },

  /**
   * Delete a provider
   * @param {string|number} providerId - ID of the provider to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteProvider: async (providerId) => {
    try {
      const response = await apiService.delete(`/admin/providers/${providerId}`);
      return response.data;
    } catch (error) {
      console.error('Delete provider error:', error);
      throw error;
    }
  },

  /**
   * Get all API providers
   * @returns {Promise<Object>} Provider list
   */
  getApiProviders: async () => {
    try {
      const response = await apiService.get('/admin/providers');
      return response;
    } catch (error) {
      console.error('Get API providers error:', error);
      throw error;
    }
  }
};

export default providerService;
