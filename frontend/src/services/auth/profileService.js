/**
 * User profile and settings management services
 */

import apiService from '../apiService';
import { AUTH_ENDPOINTS } from './constants';
import { extractErrorMessage } from './utils';

/**
 * Profile service with methods for user profile management
 */
const profileService = {
  /**
   * Get current user profile
   * @returns {Promise<Object>} User profile data
   */
  getProfile: async () => {
    try {
      const response = await apiService.get(AUTH_ENDPOINTS.PROFILE);
      
      if (response.success && response.data) {
        // Update stored user data
        localStorage.setItem('user', JSON.stringify(response.data));
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update user settings
   * @param {Object} settings - User settings to update
   * @param {boolean} logoutAfterPasswordChange - Whether to logout after password change
   * @returns {Promise<Object>} Updated settings
   */
  updateSettings: async (settings, logoutAfterPasswordChange = true) => {
    try {
      const response = await apiService.put(AUTH_ENDPOINTS.SETTINGS, settings);
      
      if (settings.password && response.success && logoutAfterPasswordChange) {
        setTimeout(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }, 2000);
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Upload user avatar image
   * @param {FormData} formData - FormData containing the image file with 'avatar' key
       * @returns {Promise<Object>} Result with success status and avatar path
       */
      uploadAvatar: async (formData) => {
        try {
          const config = {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          };

          const rawResponse = await apiService.post('/users/avatar', formData, config);
          
          // Check if the response indicates success and contains the avatar path
          const isSuccess = rawResponse?.success === true;
          const avatarPath = rawResponse?.data?.avatarPath;

          if (isSuccess && avatarPath) {
            const userStr = localStorage.getItem('user'); 
            let updatedUser = null;
            if (userStr) {
              try {
                const currentUser = JSON.parse(userStr);
                updatedUser = { ...currentUser, avatar: avatarPath };
              } catch (e) {
                console.error('Error parsing current user for avatar update', e); 
              }
            }
            
            return {
              success: true,
              message: rawResponse.message || 'Avatar uploaded successfully.',
              data: { avatarPath: avatarPath, updatedUser: updatedUser } 
            };
          } else {
             const errorMessage = rawResponse?.message || 'API response missing avatar path.';
             console.error('Avatar upload API response error:', errorMessage, rawResponse); 
             return { success: false, message: errorMessage };
          }
        } catch (error) {
      console.error('Error uploading avatar:', error); 
      
      return {
        success: false,
        message: extractErrorMessage(error, 'Failed to upload avatar'),
        originalError: error
      };
    }
  },

  /**
   * Delete user avatar
   * @returns {Promise<Object>} Result object
   */
  deleteAvatar: async () => {
    try {
      const rawResponse = await apiService.delete('/users/avatar'); 
      const isSuccess = rawResponse?.success === true;

      if (isSuccess) {
        const userStr = localStorage.getItem('user'); 
        let updatedUser = null;
        if (userStr) {
          try {
            const currentUser = JSON.parse(userStr);
            updatedUser = { ...currentUser, avatar: null };
          } catch (e) {
            console.error('Error parsing current user for avatar deletion update', e);
          }
        }
        return { success: true, message: 'Avatar deleted successfully.', data: { updatedUser: updatedUser } };
      } else {
        const errorMessage = rawResponse?.message || 'Failed to delete avatar.';
        console.error('Avatar deletion API response error:', errorMessage, rawResponse);
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Error deleting avatar:', error);
      return {
        success: false,
        message: extractErrorMessage(error, 'Failed to delete avatar'),
        originalError: error
      };
    }
  },
  
  // getCurrentUser, isAdmin, and isPowerUser removed as they are deprecated
  // and functionality is now handled by AuthContext (useAuth hook).
};

export default profileService;
