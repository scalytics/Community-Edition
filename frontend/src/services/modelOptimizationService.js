/**
 * Model Optimization Service
 * 
 * Handles API calls related to model parameter optimization
 */
import apiService from './apiService';

/**
 * Start model parameter optimization
 * 
 * @param {string|number} modelId - The ID of the model to optimize
 * @returns {Promise<Object>} The API response
 */
export const optimizeModelParameters = async (modelId) => {
  try {
    return await apiService.post(`/admin/models/${modelId}/optimize`);
  } catch (error) {
    throw error;
  }
};

/**
 * Get the optimization status for a model
 * 
 * @param {string|number} modelId - The ID of the model
 * @returns {Promise<Object>} The optimization status and parameters
 */
export const getModelOptimizationStatus = async (modelId) => {
  try {
    const response = await apiService.get(`/admin/models/${modelId}/optimization-status`);
    
    // Ensure we have correct shaped data
    if (response && response.data) {
      console.log('Optimization status raw response:', response);
      
      return {
        has_optimization: !!response.data.has_optimization,
        optimization: response.data.optimization || null,
        model_id: response.data.model_id,
        model_name: response.data.model_name
      };
    }
    
    // If response has unexpected shape, try to handle it
    if (response && response.success && response.data) {
      console.log('Restructuring optimization response:', response);
      return {
        has_optimization: !!response.data.has_optimization,
        optimization: response.data.optimization || null,
        model_id: response.data.model_id,
        model_name: response.data.model_name
      };
    }
    
    // Fallback for any unexpected response format
    console.warn('Unexpected optimization status response format:', response);
    return {
      has_optimization: false,
      optimization: null
    };
  } catch (error) {
    console.error('Error fetching optimization status:', error);
    throw error;
  }
};
