import apiService from '../apiService';
import { ADMIN_ENDPOINTS } from './constants';

/**
 * Admin services for model management
 */
const modelService = {
  /**
   * Get model usage statistics
   * @param {string|number} modelId - ID of the model
   * @returns {Promise<Object>} Model usage stats
   */
  getModelStats: async (modelId) => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.MODEL_STATS(modelId));
      return response.data || {};
    } catch (error) {
      console.error('Error getting model stats:', error);
      throw error;
    }
  },

  /**
   * Upload a model file
   * @param {FormData} formData - FormData containing model file and metadata
   * @param {Function} onProgress - Callback for upload progress (0-100)
   * @returns {Promise<Object>} Upload result with model details
   */
  uploadModel: async (formData, onProgress) => {
    try {
      const config = {};
      if (typeof onProgress === 'function') {
        config.onUploadProgress = (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        };
      }
      
      const response = await apiService.post('/admin/models/upload', formData, config);
      return response;
    } catch (error) {
      console.error('Model upload error:', error);
      throw error;
    }
  },

  /**
   * Discover models for a provider
   * @param {string} providerId - Provider ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Discovery results
   */
  discoverProviderModels: async (providerId, options = {}) => {
    try {
      // Make the API request
      const response = await apiService.post('/admin/discover', {
        providerId,
        ...options
      });
      
      // Normalize the response format regardless of what the server returns
      let normalizedResponse;
      
      if (response?.data?.success === true || response?.success === true) {
        // Success response format
        normalizedResponse = {
          success: true,
          message: response?.data?.message || response?.message || 'Models discovered successfully',
          data: response?.data?.data || response?.data || response
        };
      } else if (response?.data?.error || response?.error) {
        // Error response format 
        normalizedResponse = {
          success: false,
          message: response?.data?.error || response?.error || 'Failed to discover models',
          data: response?.data?.data || response?.data || {}
        };
      } else {
        // Unknown response format - assume success if we got a response
        normalizedResponse = {
          success: !!response,
          message: response?.message || 'Discovery completed',
          data: response?.data || response || {}
        };
      }
      
      return normalizedResponse;
    } catch (error) {
      console.error('Error discovering provider models:', error);
      
      // Return a consistent error response format
      return {
        success: false,
        message: error.message || 'Failed to discover models',
        error: error
      };
    }
  },

  /**
   * Reset all models to defaults
   * @returns {Promise<Object>} - Reset confirmation
   */
  resetAllModels: async () => {
    try {
      const response = await apiService.post('/admin/reset'); // Corrected path
      return response;
    } catch (error) {
      console.error('Error resetting all models:', error);
      throw error;
    }
  },

  /**
   * Get the status of the model worker pool (admin only)
   * @returns {Promise<Object>} Worker pool status object
   */
  getWorkerPoolStatus: async () => {
    try {
      // Use the endpoint defined in constants, assuming it's something like '/admin/worker-pool-status'
      const response = await apiService.get(ADMIN_ENDPOINTS.WORKER_POOL_STATUS);
      // Return the data part of the response, which should contain the status object
      return response?.data || null;
    } catch (error) {
      console.error('Error getting worker pool status:', error);
      throw error; // Re-throw error to be handled by the caller
    }
  }
};

export default modelService;
