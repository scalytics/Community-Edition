/**
 * Token verification and management services
 */

import apiService from '../apiService';
import { AUTH_ENDPOINTS } from './constants';
// Unused imports removed: parseResponse, sanitizeToken

/**
 * Token service with methods for token verification and password management
 */
const tokenService = {
  /**
   * Verify a registration token
   * @param {string} token - Registration token
   * @returns {Promise<Object>} Result of verification
   */
  verifyRegistrationToken: async (token) => {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Token is required',
        };
      }
      
      // Use the token exactly as is, without any sanitization
      const rawResponse = await apiService.post(AUTH_ENDPOINTS.VERIFY_TOKEN, { token });
      
      // Handle different response formats directly
      let response;
      let isSuccess;
      
      if (rawResponse && typeof rawResponse === 'object') {
        // It's an object, could be an Axios response or already processed
        if (rawResponse.data) {
          // It's likely an Axios response
          response = rawResponse.data;
          
          // If we have a data object with user details, consider it successful
          // regardless of the explicit success flag
          isSuccess = response.success === true || 
                     rawResponse.status === 200 ||
                     (response.data && (response.data.userId || response.data.username));
        } else {
          // It's already the data
          response = rawResponse;
          isSuccess = response.success === true;
        }
      } else {
        // Unexpected response format
        return {
          success: false,
          message: 'Invalid response format from server'
        };
      }
      
      // Extract data directly from the response
      const userData = response.data || {};
      
      // If the data contains user information, the token is valid
      if (userData && (userData.userId || userData.username)) {
        isSuccess = true;
      }
      
      const user = response.user || userData.user;
      
      return {
        success: isSuccess,
        message: response.message || 'Token verified successfully',
        data: userData,
        user: user
      };
    } catch (error) {
      // Create a standardized error response with a clean message
      let errorMessage = 'Failed to verify token';
      
      try {
        if (error.response && error.response.data) {
          // If we have a details field, use it (new format)
          if (error.response.data.details) {
            errorMessage = 'Token verification failed: ' + error.response.data.message;
          } else if (error.response.data.message) {
            // Otherwise use the message field directly
            errorMessage = error.response.data.message;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      } catch (e) {
        // Error handling fallback
      }
      
      return {
        success: false,
        message: errorMessage,
        originalError: error
      };
    }
  },

  /**
   * Set password using registration token
   * @param {string} token - Registration token
   * @param {string} password - New password
   * @returns {Promise<Object>} Result of password setting
   */
  setPassword: async (token, password) => {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Token is required',
        };
      }
      
      if (!password || password.length < 6) {
        return {
          success: false,
          message: 'Password must be at least 6 characters long',
        };
      }
      
      // Send the token exactly as provided, without any modifications
      const rawResponse = await apiService.post(AUTH_ENDPOINTS.SET_PASSWORD, { 
        token, 
        password 
      });
      
      // Check if the raw response has a specific structure we need to handle
      let response;
      let isSuccess;
      
      if (rawResponse && typeof rawResponse === 'object') {
        // It's an object, could be an Axios response or already processed
        if (rawResponse.data) {
          // It's likely an Axios response
          response = rawResponse.data;
          isSuccess = response.success === true || 
                     rawResponse.status === 200 ||
                     !!response.token;
        } else {
          // It's already the data
          response = rawResponse;
          isSuccess = response.success === true || !!response.token;
        }
      } else {
        // Unexpected response format
        return {
          success: false,
          message: 'Invalid response format from server'
        };
      }
      
      // Extract token from response (direct property)
      const authToken = response.token;
      
      // Extract user data (direct property)
      const user = response.user;
      
      if (isSuccess && authToken) {
        // Store token and user data if login is automatic
        localStorage.setItem('token', authToken);
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
        }
      }
      
      // Create a standardized response format
      return {
        success: isSuccess,
        message: response.message || 'Password set successfully',
        token: authToken,
        user: user
      };
    } catch (error) {
      // Create a standardized error response with a clean message
      let errorMessage = 'Failed to set password';
      
      try {
        if (error.response && error.response.data) {
          // If we have a details field, use it (new format)
          if (error.response.data.details) {
            errorMessage = 'Password setting failed: ' + error.response.data.message;
          } else if (error.response.data.message) {
            // Otherwise use the message field directly
            errorMessage = error.response.data.message;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      } catch (e) {
        // Error handling fallback
      }
      
      return {
        success: false,
        message: errorMessage,
        originalError: error
      };
    }
  }
};

export default tokenService;
