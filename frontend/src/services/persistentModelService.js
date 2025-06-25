/**
 * Persistent Model Service
 * 
 * This service provides functions to interact with the persistent model API
 * which allows keeping a single model in memory for faster responses.
 */
import apiService from './apiService';

/**
 * Set a model as the primary model (to be kept in memory)
 * 
 * @param {string} modelId - ID of the model to set as primary
 * @returns {Promise<Object>} API response
 */
export const setPrimaryModel = async (modelId) => {
  try {
    const response = await apiService.post(`/admin/models/${modelId}/set-primary`);
    return response.data;
  } catch (error) {
    console.error('Error setting primary model:', error);
    throw error;
  }
};

/**
 * Get the status of the current primary model
 * 
 * @returns {Promise<Object>} API response with status information
 */
export const getPrimaryModelStatus = async () => {
  try {
    const response = await apiService.get('/admin/primary-model');
    return response.data;
  } catch (error) {
    console.error('Error getting primary model status:', error);
    throw error;
  }
};

/**
 * Unset the current primary model
 * 
 * @returns {Promise<Object>} API response
 */
export const unsetPrimaryModel = async () => {
  try {
    const response = await apiService.post('/admin/primary-model/unset');
    return response.data;
  } catch (error) {
    console.error('Error unsetting primary model:', error);
    throw error;
  }
};
