/**
 * Authentication services related to login and registration
 */

import apiService from '../apiService';
import { AUTH_ENDPOINTS } from './constants';
import { parseResponse, extractErrorMessage } from './utils';

/**
 * Login service with methods for user authentication
 */
const loginService = {
  /**
   * Login with username/email and password
   * @param {Object} credentials - User credentials
   * @param {string} credentials.username - Username or email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} User data with token
   */
  login: async (credentials) => {
    try {
      const rawResponse = await apiService.post(AUTH_ENDPOINTS.LOGIN, credentials);
      const { response, isSuccess } = parseResponse(rawResponse, ['token']);
      
      // Extract token and user data
      const token = response.token;
      const user = response.user;
      
      return {
        success: isSuccess,
        message: response.message || response.error || (response.data && response.data.message),
        token: token,
        user: user
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: extractErrorMessage(error, 'Login failed'),
        originalError: error
      };
    }
  },

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.username - Desired username
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @returns {Promise<Object>} Registered user data with token
   */
  register: async (userData) => {
    try {
      const response = await apiService.post(AUTH_ENDPOINTS.REGISTER, userData);
      
      if (response.success && response.token) {
        localStorage.setItem('token', response.token);
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },
  
  /**
   * Logout user - This function is now primarily handled by AuthContext.
   * Components should call the logout function from useAuth().
   * This remains for potential direct use but is discouraged.
   */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    apiService.setAuthToken(null); 
    console.warn("Direct call to authService.logout(). Consider using useAuth().logout() instead for proper state management and redirection.");
  }
};

export default loginService;
