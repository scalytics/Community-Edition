import apiService from '../apiService';
import { ADMIN_ENDPOINTS } from './constants';

/**
 * Admin privacy service - handles privacy-related admin functions
 */
const privacyService = {
  /**
   * Get privacy settings from the server
   * @returns {Promise<Object>} Privacy settings
   */
  getPrivacySettings: async () => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.PRIVACY);
      return response.data;
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      throw error;
    }
  },

  /**
   * Update global privacy mode setting
   * @param {Object} options - Options object
   * @param {boolean} options.enabled - Whether global privacy mode should be enabled
   * @returns {Promise<Object>} Updated privacy settings
   */
  updateGlobalPrivacyMode: async (options) => {
    try {
      // Extract the enabled value from the options object
      const isEnabled = options && typeof options.enabled === 'boolean' ? options.enabled : false;
      
      // Send the request with the proper payload
      const response = await apiService.put(ADMIN_ENDPOINTS.PRIVACY_GLOBAL_MODE, {
        enabled: isEnabled
      });
      
      return response.data;
    } catch (error) {
      console.error('Error updating global privacy mode:', error);
      throw error;
    }
  }
};

export default privacyService;
