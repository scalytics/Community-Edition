import apiService from './apiService';

const FILE_ENDPOINTS = {
  UPLOAD: '/files',
  LIST: '/files/list',
  FILE: (id) => `/files/${id}`
};

const fileService = {
  /**
   * Upload a file with comprehensive error handling
   * @param {File} file - File to upload
   * @param {Function} onProgress - Optional callback for upload progress
   * @returns {Promise<Object>} Uploaded file information
   */
  uploadFile: async (file, onProgress) => {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Set up config with progress tracking if provided
      const config = {};
      if (typeof onProgress === 'function') {
        config.onUploadProgress = (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        };
      }
      
      // Use the improved apiService.post with config support
      const response = await apiService.post(FILE_ENDPOINTS.UPLOAD, formData, config);
      
      return response.data || response;
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  },

  /**
   * Get a list of all files uploaded by the user
   * @returns {Promise<Array>} List of files
   */
  listFiles: async () => {
    try {
      const response = await apiService.get(FILE_ENDPOINTS.LIST);
      return response.data || [];
    } catch (error) {
      console.error('List files error:', error);
      throw error;
    }
  },

  /**
   * Delete a file by ID
   * @param {string|number} fileId File ID to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteFile: async (fileId) => {
    try {
      return await apiService.delete(FILE_ENDPOINTS.FILE(fileId));
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }
};

export default fileService;
