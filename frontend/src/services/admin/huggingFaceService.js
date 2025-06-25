import apiService from '../apiService';

/**
 * Admin services for Hugging Face operations
 */
const huggingFaceService = {
  /**
   * Search for models on Hugging Face Hub
   * @param {string} family - The selected model family (e.g., 'llama', 'mistral')
   * @param {Object} options - Search options (sort, direction, limit)
   * @returns {Promise<Object>} - Search results
   */
  searchModels: async (family, options = {}) => { // Renamed 'query' to 'family'
    try {
      // Ensure family is properly encoded in the URL and pass additional options
      const trimmedFamily = family.trim(); // Trim whitespace
      
      // Construct URL with 'family' parameter instead of 'query'
      const response = await apiService.get(`/admin/huggingface/search?family=${encodeURIComponent(trimmedFamily)}`, { params: options });
      return response;
    } catch (error) {
      // console.error('Error searching Hugging Face models:', error); // Removed log
      throw error;
    }
  },

  /**
   * Download a model from Hugging Face Hub
   * @param {string} modelId - Hugging Face model ID
   * @param {Object} config - Model configuration
   * @returns {Promise<Object>} - Download information
   */
  downloadModel: async (modelId, config) => {
    try {
      // Use a much longer timeout (5 minutes) for model download requests
      // Large models can take time to initialize
      const customConfig = {
        timeout: 300000 // 5 minutes (300,000ms)
      };

      // Remove the duplicate /api prefix
      const response = await apiService.post(
        `/admin/huggingface/models/${encodeURIComponent(modelId)}/download`, 
        config,
        customConfig
      );
      return response;
    } catch (error) {
      // console.error('Error downloading Hugging Face model:', error); // Removed log
      // Add a more helpful error message for timeouts
      if (error.originalError?.code === 'ECONNABORTED') {
        error.message = 'The download request is taking longer than expected. The model may still be downloading in the background. Please check the Models tab to see if it appears after a few minutes.';
      }
      throw error;
    }
  },

  /**
   * List available files for a model
   * @param {string} modelId - Hugging Face model ID
   * @returns {Promise<Object>} - List of available files
   */
  listModelFiles: async (modelId) => {
    try {
      const response = await apiService.get(`/admin/huggingface/models/${encodeURIComponent(modelId)}/files`);
      return response;
    } catch (error) {
      // console.error('Error listing model files:', error); // Removed log
      throw error;
    }
  },

  /**
   * Get download progress
   * @param {string} downloadId - Download ID
   * @returns {Promise<Object>} - Download progress information
   */
  getDownloadProgress: async (downloadId) => {
    try {
      // Remove the duplicate /api prefix
      const response = await apiService.get(`/admin/huggingface/downloads/${downloadId}`);
      return response;
    } catch (error) {
      // console.error('Error getting download progress:', error); // Removed log
      throw error;
    }
  },

  /**
   * Cancel a download
   * @param {string} downloadId - Download ID
   * @returns {Promise<Object>} - Cancellation result
   */
  cancelDownload: async (downloadId) => {
    try {
      // Remove the duplicate /api prefix
      const response = await apiService.delete(`/admin/huggingface/downloads/${downloadId}`);
      return response;
    } catch (error) {
      // console.error('Error cancelling download:', error); // Removed log
      throw error;
    }
  },

  /**
   * Get all active downloads
   * @returns {Promise<Object>} - Active downloads
   */
  getActiveDownloads: async () => {
    try {
      // Remove the duplicate /api prefix
      const response = await apiService.get('/admin/huggingface/downloads');
      return response;
    } catch (error) {
      // console.error('Error getting active downloads:', error); // Removed log
      throw error;
    }
  }
};

export default huggingFaceService;
