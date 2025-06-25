import apiService from '../apiService';
import { ADMIN_ENDPOINTS } from './constants';

/**
 * Admin services for user management
 */
const userService = {
  /**
   * Get all users
   * @param {Object} params - Query parameters 
   * @param {number} params.limit - Maximum number of users to return
   * @param {number} params.offset - Offset for pagination
   * @returns {Promise<Object>} List of users with pagination info
   */
  getUsers: async (params = {}) => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.USERS, params);
      return response;
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  },

  /**
   * Get a single user with usage stats
   * @param {string|number} userId - ID of the user to retrieve
   * @returns {Promise<Object>} User data with stats
   */
  getUser: async (userId) => {
    try {
      const response = await apiService.get(ADMIN_ENDPOINTS.USER(userId));
      return response.data || null;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  },

  /**
   * Update a user
   * @param {string|number} userId - ID of the user to update
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} Updated user
   */
  updateUser: async (userId, userData) => {
    try {
      const response = await apiService.put(ADMIN_ENDPOINTS.USER(userId), userData);
      return response.data || null;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Register a new user as admin and provide the registration link
   * @param {Object} userData - User registration data
   * @param {string} userData.username - Username
   * @param {string} userData.email - User email
   * @returns {Promise<Object>} Registration result with link
   */
  registerUser: async (userData) => {
    try {
      const response = await apiService.post('/admin/users/register', userData);
      response.needsFallbackUI = true;
      let registrationLink = null;
      
      // Check all possible places where the link might be
      if (response.data && response.data.registrationLink) {
        registrationLink = response.data.registrationLink;
      } else if (response.registrationLink) {
        registrationLink = response.registrationLink;
      } else if (typeof response.data === 'string' && response.data.includes('http')) {
        registrationLink = response.data;
      }
      
      // If registration was successful and we found a registration link
      if (response.success && registrationLink) {
        response.data = response.data || {};
        response.data.registrationLink = registrationLink;
        response.emailContent = {
          subject: `Your Scalytics Connect Registration Link`,
          body: `Hello ${userData.username},

Hi, I’m Auri.
You’ve been invited to join Scalytics Connect — your private AI Agent System for secure, intelligent collaboration. 
Please click the link below to set your password and activate your account:

${response.data.registrationLink}

This link will expire in 24 hours for security reasons.

If you have any questions, feel free to reach out to your administrator — they’ll be happy to help.

Looking forward to working together,
Auri, your enterprise assistant`
        };
        
        // Always try multiple approaches to open the email client
        const subject = encodeURIComponent(response.emailContent.subject);
        const body = encodeURIComponent(response.emailContent.body);
        
        // Try to open the mail client using a safer method that won't navigate away from the page
        try {
          const mailtoLink = document.createElement('a');
          mailtoLink.href = `mailto:${userData.email}?subject=${subject}&body=${body}`;
          mailtoLink.target = '_blank';
          mailtoLink.rel = 'noopener noreferrer';
          mailtoLink.style.display = 'none';
          
          document.body.appendChild(mailtoLink);
          mailtoLink.click();
          
          setTimeout(() => {
            document.body.removeChild(mailtoLink);
          }, 100);
        } catch (emailErr) {
          console.warn("Mailto method failed:", emailErr);
        }
        
        // No matter what happens with the mailto attempts, always include needsFallbackUI
        // to ensure the copy dialog shows up
        response.needsFallbackUI = true;
      }
      
      return response;
    } catch (error) {
      console.error('Error registering user:', error);
      throw error;
    }
  },

  /**
   * Delete a user
   * @param {string|number} userId - ID of the user to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteUser: async (userId) => {
    try {
      return await apiService.delete(ADMIN_ENDPOINTS.USER(userId));
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },
  
  /**
   * Resend registration link for a pending user
   * @param {string|number} userId - ID of the user
   * @returns {Promise<Object>} Result with new registration link
   */
  resendRegistrationLink: async (userId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/resend-invitation`);
      
      // If request was successful and we have a registration link, open mail client
      if (response.success && response.data && response.data.registrationLink) {
        // Create a mailto link that opens the default email client
        const user = response.data.user;
        const subject = encodeURIComponent(`Your MCP Registration Link`);
        const body = encodeURIComponent(
          `Hello ${user.username},\n\n` +
          `You have been invited to join the Model Context Protocol application. ` +
          `Please click the link below to set your password and activate your account:\n\n` +
          `${response.data.registrationLink}\n\n` +
          `This link will expire in 24 hours for security reasons.\n\n` +
          `If you have any questions, please contact your administrator.\n\n` +
          `Best regards,\nThe MCP Team`
        );
        
        // Store email content for copy functionality
        response.emailContent = {
          subject: `Your MCP Registration Link`,
          body: `Hello ${user.username},\n\n` +
          `You have been invited to join the Model Context Protocol application. ` +
          `Please click the link below to set your password and activate your account:\n\n` +
          `${response.data.registrationLink}\n\n` +
          `This link will expire in 24 hours for security reasons.\n\n` +
          `If you have any questions, please contact your administrator.\n\n` +
          `Best regards,\nThe MCP Team`
        };
        
        // Try to open the mail client using a safer method
        try {
          const mailtoLink = document.createElement('a');
          mailtoLink.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
          mailtoLink.target = '_blank';
          mailtoLink.rel = 'noopener noreferrer';
          mailtoLink.style.display = 'none';
          
          document.body.appendChild(mailtoLink);
          mailtoLink.click();
          
          setTimeout(() => {
            document.body.removeChild(mailtoLink);
          }, 100);
        } catch (emailErr) {
          console.warn("Mailto method failed:", emailErr);
        }
        
        response.needsFallbackUI = true;
      }
      
      return response;
    } catch (error) {
      console.error('Error resending registration link:', error);
      throw error;
    }
  },

  /**
   * Reset a user's password
   * @param {string|number} userId - ID of the user
   * @returns {Promise<Object>} Result with new registration link
   */
  resetUserPassword: async (userId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/reset-password`);
      
      if (response.success && response.data && response.data.registrationLink) {
        const user = response.data.user;
        const subject = encodeURIComponent(`Your Password Reset Link`);
        const body = encodeURIComponent(
          `Hello ${user.username},\n\n` +
          `Your password has been reset. Please click the link below to set a new password:\n\n` +
          `${response.data.registrationLink}\n\n` +
          `This link will expire in 24 hours for security reasons.\n\n` +
          `If you did not request this password reset, please contact your administrator.\n\n` +
          `Best regards,\nThe MCP Team`
        );
        
        // Store email content for copy functionality
        response.emailContent = {
          subject: `Your Password Reset Link`,
          body: `Hello ${user.username},\n\n` +
          `Your password has been reset. Please click the link below to set a new password:\n\n` +
          `${response.data.registrationLink}\n\n` +
          `This link will expire in 24 hours for security reasons.\n\n` +
          `If you did not request this password reset, please contact your administrator.\n\n` +
          `Best regards,\nThe MCP Team`
        };
        
        // Try to open the mail client using a safer method
        try {
          const mailtoLink = document.createElement('a');
          mailtoLink.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
          mailtoLink.target = '_blank';
          mailtoLink.rel = 'noopener noreferrer';
          mailtoLink.style.display = 'none';
          
          document.body.appendChild(mailtoLink);
          mailtoLink.click();
          
          setTimeout(() => {
            document.body.removeChild(mailtoLink);
          }, 100);
        } catch (emailErr) {
          console.warn("Mailto method failed:", emailErr);
        }
        
        // Always indicate we need the fallback UI
        response.needsFallbackUI = true;
      }
      
      return response;
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw error;
    }
  },

  /**
   * Get user's model access
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - User model access data with group information
   */
  getUserModelAccess: async (userId) => {
    try {
      // Use the endpoint that includes group membership information
      const response = await apiService.get(`/admin/users/${userId}/model-access`);
      return response;
    } catch (error) {
      console.error('Error getting user model access:', error);
      throw error;
    }
  },

  /**
   * Get user's model access with detailed group information
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - User model access data with detailed group information
   */
  getUserModelAccessWithGroups: async (userId) => {
    try {
      const response = await apiService.get(`/admin/users/${userId}/models/groups`);
      return response;
    } catch (error) {
      console.error('Error getting user model access with groups:', error);
      throw error;
    }
  },

  /**
   * Update user's model access
   * @param {number} userId - User ID
   * @param {number} modelId - Model ID
   * @param {boolean} canAccess - Whether user can access the model
   * @returns {Promise<Object>} - Update result
   */
  updateUserModelAccess: async (userId, modelId, canAccess) => {
    try {
      const response = await apiService.put(`/admin/users/${userId}/models`, {
        modelId,
        canAccess
      });
      return response;
    } catch (error) {
      console.error('Error updating user model access:', error);
      throw error;
    }
  },

  /**
   * Reset user's model access to defaults
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Reset result
   */
  resetUserModels: async (userId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/reset`);
      return response;
    } catch (error) {
      console.error('Error resetting user models:', error);
      throw error;
    }
  },

  /**
   * Reset user's access to a specific provider's models
   * @param {number} userId - User ID
   * @param {number} providerId - Provider ID
   * @returns {Promise<Object>} - Reset result
   */
  resetUserProviderModels: async (userId, providerId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/providers/${providerId}/reset`);
      return response;
    } catch (error) {
      console.error('Error resetting user provider models:', error);
      throw error;
    }
  },

  /**
   * Copy group permissions to a user
   * @param {number} userId - User ID
   * @param {number} groupId - Group ID to copy permissions from
   * @returns {Promise<Object>} - Copy result
   */
  copyGroupPermissionsToUser: async (userId, groupId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/copy-permissions`, {
        groupId
      });
      return response;
    } catch (error) {
      console.error('Error copying group permissions to user:', error);
      throw error;
    }
  }
};

export default userService;
