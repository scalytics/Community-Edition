import modelService from '../../../../services/modelService';

/**
 * Polls the server to check if a model with the given name exists
 * @param {string} modelName - The name of the model to check for
 * @param {number} intervalMs - The polling interval in milliseconds
 * @param {number} maxAttempts - Maximum number of polling attempts
 * @param {Function} onSuccess - Callback when model is found
 * @param {Function} onFailure - Callback when polling fails after max attempts
 * @param {Function} onAttempt - Callback for each attempt (optional)
 * @returns {Function} - A function to cancel polling
 */
export const pollForModelFiles = (
  modelName,
  intervalMs = 3000,
  maxAttempts = 10,
  onSuccess,
  onFailure,
  onAttempt
) => {
  let attemptCount = 0;
  let timeoutId = null;
  
  const checkModelFiles = () => {
    attemptCount++;
    
    if (onAttempt) {
      onAttempt(attemptCount, maxAttempts);
    }
    
    // Fetch the models list to see if our model is there
    modelService.getModels()
      .then(response => {
        let models = extractModelsArray(response);
        
        // Filter to local models
        const localModels = models.filter(model => !model.external_provider_id);
        
        // Check if our model name is in the list
        const foundModel = localModels.find(model => 
          model.name.includes(modelName) || 
          (model.model_path && model.model_path.includes(modelName))
        );
        
        if (foundModel) {
          
          if (onSuccess) {
            onSuccess(foundModel);
          }
          
          return true;
        }
        
        if (attemptCount < maxAttempts) {
          timeoutId = setTimeout(checkModelFiles, intervalMs);
        } else {
          
          if (onFailure) {
            onFailure();
          }
        }
        
        return false;
      })
      .catch(err => {
        console.error('Error checking model files:', err);
        if (attemptCount < maxAttempts) {
          timeoutId = setTimeout(checkModelFiles, intervalMs);
        } else {
          if (onFailure) {
            onFailure(err);
          }
        }
      });
  };
  
  // Start the polling
  checkModelFiles();
  
  // Return a function to cancel the polling
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
};

/**
 * Extracts the models array from various response formats
 * @param {Object|Array} response - The API response
 * @returns {Array} - The models array
 */
export const extractModelsArray = (response) => {
  // Direct array response
  if (Array.isArray(response)) {
    return response;
  }
  
  // Nested in data property
  if (response?.data && Array.isArray(response.data)) {
    return response.data;
  }
  
  // Deeply nested data
  if (response?.data?.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  
  // In models property
  if (response?.models && Array.isArray(response.models)) {
    return response.models;
  }
  
  // Fallback to empty array if no valid data format is found
  return [];
};

export default {
  pollForModelFiles,
  extractModelsArray
};
