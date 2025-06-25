import apiService from '../apiService';
import { ADMIN_ENDPOINTS } from './constants';

/**
 * Admin services for system statistics and monitoring
 */
const systemService = {
  /**
   * Get system overview statistics
   * @returns {Promise<Object>} System stats
   */
  getSystemStats: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.STATS);
      
      // Handle different response structures
      if (response?.success === true && response?.data) {
        return response.data;
      } else if (response?.data?.success === true && response?.data?.data) {
        return response.data.data;
      } else {
        // Return whatever we got, even if it's not in the expected format
        return response?.data || response || {};
      }
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get usage statistics over time
   * @param {Object} params - Query parameters
   * @param {string} params.period - Time period ('hourly', 'daily', 'weekly', 'monthly')
   * @param {number} params.limit - Number of time periods to return
   * @returns {Promise<Object>} Usage statistics
   */
  getUsageOverTime: async (params = {}) => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.USAGE, params);
      
      // Handle different response structures
      if (response?.success === true && response?.data) {
        return response.data;
      } else if (response?.data?.success === true && response?.data?.data) {
        return response.data.data;
      } else {
        // Return whatever array-like data we can find
        return response?.data || response || [];
      }
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get system logs
   * @param {Object} params - Query parameters
   * @param {number} params.limit - Maximum number of logs to return
   * @param {number} params.offset - Offset for pagination
   * @returns {Promise<Object>} System logs with pagination info
   */
  getSystemLogs: async (params = {}) => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.LOGS, params);
      
      // Check response structure
      if (!response) {
        return { data: [] };
      } else if (Array.isArray(response)) {
        return { data: response };
      } else if (response?.data && Array.isArray(response.data)) {
        return response;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        return { data: response.data.data };
      } else {
        return response || { data: [] };
      }
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get hardware information for monitoring
   * @returns {Promise<Object>} Hardware information including CPU, GPU, and memory
   */
  getHardwareInfo: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.HARDWARE);
      
      // Handle different response structures
      let data;
      
      if (response?.success === true && response?.data) {
        data = response.data;
      } else if (response?.data?.success === true && response?.data?.data) {
        data = response.data.data;
      } else if (response?.data) {
        // Direct data object without success flag
        data = response.data;
      } else {
        // Fall back to the raw response
        data = response || {};
      }
      
      // Fix/normalize OS data to prevent array parsing errors in React components
      const osData = data.system || data.os || {};
      const normalizedSystem = {
        platform: String(osData.platform || 'Unknown'),
        hostname: String(osData.hostname || 'Unknown'),
        uptime: Number(osData.uptime || 0),
        release: String(osData.release || ''),
        type: String(osData.type || ''),
        arch: String(osData.arch || '')
      };
      
      // Transform the data to match what the frontend component expects
      return {
        // Always provide system object in the expected format
        system: normalizedSystem,
        
        // CPU data
        cpu: {
          model: data.cpu?.model || 'Unknown',
          cores: data.cpu?.cores || 0,
          usage: data.cpu?.usage || { total: 0 },
          history: data.cpu?.history || []
        },
        
        // Memory data - handle both percentUsed and usedPercent
        memory: {
          total: data.memory?.total || 0,
          used: data.memory?.used || 0,
          usedPercent: data.memory?.usedPercent || data.memory?.percentUsed || 0,
          history: Array.isArray(data.memory?.history) ? data.memory.history : []
        },
        
        // GPU data - normalize regardless of format
        gpu: typeof data.gpu === 'object' && !Array.isArray(data.gpu)
          ? {
              devices: Array.isArray(data.gpu.devices) ? data.gpu.devices : [],
              history: Array.isArray(data.gpu.history) ? data.gpu.history : [],
              software: data.gpu.software || null
            }
          : {
              devices: Array.isArray(data.gpu) ? data.gpu : [],
              history: [],
              software: null
            }
      };
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get all model directories with information
   * @returns {Promise<Object>} List of model directories with details
   */
  getModelDirectories: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.MODEL_DIRECTORIES);
      // Return the full response object from the API
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete a model directory
   * @param {string} dirName - Name of the directory to delete
   * @returns {Promise<Object>} Response with status
   */
  deleteModelDirectory: async (dirName) => {
    try {
      const response = await apiService.delete(ADMIN_ENDPOINTS.MODEL_DIRECTORY(dirName));
      
      // Ensure we have a properly formatted response
      if (response) {
        return {
          success: response.success || false,
          message: response.message || 'Directory deleted successfully',
          data: response.data || {}
        };
      } else {
        return { 
          success: false, 
          message: 'No response from server' 
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Error deleting directory'
      };
    }
  },

  /**
   * Force delete a model directory even if it contains model files
   * Will still prevent deletion if the directory is referenced in the database
   * @param {string} dirName - Name of the directory to force delete
   * @returns {Promise<Object>} Response with status
   */
  forceDeleteModelDirectory: async (dirName) => {
    try {
      const response = await apiService.delete(ADMIN_ENDPOINTS.FORCE_DELETE_MODEL_DIRECTORY(dirName));
      
      // Ensure we have a properly formatted response
      if (response) {
        return {
          success: response.success || false,
          message: response.message || 'Directory force deleted successfully',
          data: response.data || {}
        };
      } else {
        return { 
          success: false, 
          message: 'No response from server' 
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Error force deleting directory'
      };
    }
  },

  /**
   * Bulk delete multiple model directories
   * @param {string[]} dirNames - Array of directory names to delete
   * @returns {Promise<Object>} Combined response with status
   */
  cleanupModelDirectories: async (dirNames) => {
    try {
      // Create an array of promises, one for each directory deletion
      const deletePromises = dirNames.map(dirName => 
        systemService.deleteModelDirectory(dirName)
      );
      
      // Execute all delete operations and collect the results
      const results = await Promise.allSettled(deletePromises);
      
      // Count successful and failed deletions
      const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
      const failed = results.length - successful;
      
      return {
        success: true,
        message: `Cleanup complete: ${successful} directories deleted, ${failed} operations failed`,
        data: {
          total: dirNames.length,
          successful,
          failed,
          results: results.map((result, index) => ({
            dirName: dirNames[index],
            success: result.status === 'fulfilled' && result.value?.success,
            message: result.status === 'fulfilled' 
              ? result.value?.message 
              : `Failed: ${result.reason?.message || 'Unknown error'}`
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error during cleanup: ' + (error.message || 'Unknown error'),
        data: {
          total: dirNames.length,
          successful: 0,
          failed: dirNames.length
        }
      };
    }
  },

  /**
   * Get system storage information
   * @returns {Promise<Object>} Storage information including disk usage
   */
  getStorageInfo: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.STORAGE_INFO);
      
      // Handle different response structures
      if (response?.success === true && response?.data) {
        return response.data;
      } else if (response?.data?.success === true && response?.data?.data) {
        return response.data.data;
      } else {
        // Return whatever we got, even if it's not in the expected format
        return response?.data || response || {};
      }
    } catch (error) {
      throw error;
    }
  },

  /**
   * Format a number for display
   * @param {number} num - The number to format
   * @returns {string} Formatted number
   */
  formatNumber: (num) => {
    if (num === undefined || num === null) return '0';

    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    } else {
      return num.toString();
    }
  },

  /**
   * Get list of database backups
   * @returns {Promise<Object>} List of database backups
   */
  listDatabaseBackups: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.DATABASE_BACKUPS);
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Create a new database backup
   * @returns {Promise<Object>} Backup details
   */
  createDatabaseBackup: async () => {
    try {
      const response = await apiService.post(ADMIN_ENDPOINTS.DATABASE_BACKUPS);
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Download a database backup file and trigger the browser download
   * @param {string} fileName - Name of the backup file
   * @returns {Promise<boolean>} Promise that resolves to true when download is initiated
   */
  downloadDatabaseBackup: async (fileName) => {
    try {
      // Use the database backup endpoint
      const endpoint = ADMIN_ENDPOINTS.DATABASE_BACKUP(fileName);
      
      // Use apiService with blob responseType to properly handle authentication
      const response = await apiService.get(endpoint, {}, {
        responseType: 'blob',
        headers: {
          'Accept': 'application/octet-stream'
        }
      });
      
      // Create a blob URL from the response data
      const blob = new Blob([response.data], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName); // Set suggested filename
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Restore a database backup
   * @param {string} fileName - Name of the backup file to restore
   * @returns {Promise<Object>} Response with status
   */
  restoreDatabaseBackup: async (fileName) => {
    try {
      const response = await apiService.post(ADMIN_ENDPOINTS.RESTORE_DATABASE_BACKUP(fileName));
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete a database backup
   * @param {string} fileName - Name of the backup file to delete
   * @returns {Promise<Object>} Response with status
   */
  deleteDatabaseBackup: async (fileName) => {
    try {
      const response = await apiService.delete(ADMIN_ENDPOINTS.DATABASE_BACKUP(fileName));
      return response;
    } catch (error) {
      throw error;
    }
  },
  
  /**
   * Upload a database backup file
   * @param {File} file - The file to upload
   * @returns {Promise<Object>} Response with status
   */
  uploadDatabaseBackup: async (file) => {
    try {
      // Create a FormData object to send the file
      const formData = new FormData();
      
      // IMPORTANT: The field name must match what the server expects - 'backupFile'
      formData.append('backupFile', file);
      
      // Use apiService to make the request, passing the FormData
      const response = await apiService.post(ADMIN_ENDPOINTS.UPLOAD_DATABASE_BACKUP, formData, {
        headers: {
          // Don't set Content-Type when sending FormData - browser will set it with correct boundary
          'Content-Type': undefined  
        }
      });
      
      return response?.data || { success: true };
    } catch (error) {
      throw error;
    }
  },
  
  /**
   * Get system information including the current restored backup if any
   * @returns {Promise<Object>} System information
   */
  getSystemInfo: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.SYSTEM_INFO);
      return response?.data?.data || {};
    } catch (error) {
      throw error;
    }
  },
  
  /**
   * Format a file size for display
   * @param {number} bytes - The file size in bytes
   * @param {number} decimals - Number of decimal places to show
   * @returns {string} Formatted file size
   */
  formatFileSize: (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },
  
  /**
   * Validate a database backup file
   * @param {File} file - The file to validate
   * @returns {Object} Validation result with success and message
   */
  validateDatabaseBackupFile: (file) => {
    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB in bytes
    if (file.size > maxSize) {
      return {
        success: false,
        message: `File too large. Maximum size is ${systemService.formatFileSize(maxSize)}`
      };
    }
    
    // Check file extension
    const validExtensions = ['.db'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      return {
        success: false,
        message: `Invalid file type. Only ${validExtensions.join(', ')} files are allowed`
      };
    }
    
    // Check if filename starts with "mcp-db-backup-"
    if (!file.name.startsWith('mcp-db-backup-')) {
      return {
        success: false,
        message: 'Invalid backup file name format. Must start with "mcp-db-backup-"'
      };
    }
    
    return {
      success: true,
      message: 'File is valid'
    };
  },

  /**
   * Restart the server using PM2
   * @returns {Promise<Object>} Response with status
   */
  restartServer: async () => {
    try {
      const response = await apiService.post(ADMIN_ENDPOINTS.RESTART_SERVER);
      return response?.data || { success: true, message: 'Server restart initiated' };
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get available GPU indices from the backend.
   * @returns {Promise<Object>} API response, expecting { success: true, data: ['0', '1', ...] }
   */
  getGpuIndices: async () => {
    try {
      // Use the new endpoint defined in adminRoutes.js
      const response = await apiService.get(ADMIN_ENDPOINTS.GPU_INDICES); 
      // Ensure ADMIN_ENDPOINTS.GPU_INDICES is defined in constants.js
      // Example: GPU_INDICES: '/admin/hardware/gpu-indices'
      return response?.data || { success: false, data: [] }; // Return data structure
    } catch (error) {
      console.error("Error fetching GPU indices:", error);
      // Return a consistent error structure
      return { success: false, message: error.message || 'Failed to fetch GPU indices', data: [] };
    }
  },

  /**
   * Get the preferred local embedding model setting.
   * @returns {Promise<Object>} API response, expecting { success: true, data: { preferredEmbeddingModel: object|null } }
   */
  getPreferredEmbeddingModel: async () => {
    try {
      // Add a cache-busting query parameter
      const cacheBuster = `_=${Date.now()}`;
      const endpoint = `${ADMIN_ENDPOINTS.PREFERRED_EMBEDDING_MODEL}?${cacheBuster}`;

      // apiService.get already returns the 'data' part of the axios response
      const responseData = await apiService.get(endpoint);
      // The actual data we need is nested within responseData
      // Backend now returns { success: true, data: { preferredEmbeddingModel: {...} | null } }
      if (responseData && responseData.success && responseData.hasOwnProperty('data')) { // Check data property exists
          return { success: true, data: responseData.data }; // Return the expected structure
       } else {
          // Handle cases where the structure might be different or request failed
          return { success: false, data: { preferred_local_embedding_model_id: null }, message: responseData?.message || 'Unexpected response structure' };
       }
     } catch (error) {
       // Log the actual error from apiService's handler
       return { success: false, message: error.message || 'Failed to fetch preferred embedding model', data: { preferred_local_embedding_model_id: null } };
     }
  },

  /**
   * Update the preferred local embedding model setting.
   * @param {number|null} modelId - The ID of the model to set as preferred, or null to unset.
   * @returns {Promise<Object>} API response indicating success or failure.
   */
  updatePreferredEmbeddingModel: async (modelId) => {
    try {
      const payload = { preferred_local_embedding_model_id: modelId };
      const response = await apiService.put(ADMIN_ENDPOINTS.PREFERRED_EMBEDDING_MODEL, payload);
      return response?.data || { success: true, message: 'Preferred embedding model updated successfully.' };
    } catch (error) {
      console.error("Error updating preferred embedding model:", error);
       return { success: false, message: error.response?.data?.message || error.message || 'Failed to update preferred embedding model' };
     }
   }
 };

export default systemService;
