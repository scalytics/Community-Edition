import axios from 'axios';
import { getBaseUrl } from './apiService';

// Create a specific axios instance for chat with longer timeout
const chatApi = axios.create({
  baseURL: getBaseUrl(),
  timeout: 120000, // 120 seconds timeout for chat operations (2 minutes)
  headers: {
    'Content-Type': 'application/json',
  }
});

// Reuse the same request interceptor for auth token
chatApi.interceptors.request.use(
  (config) => {
    // CRITICAL FIX: Remove Content-Type for FormData requests
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    const token = localStorage.getItem('token');
    if (token) {
      // Check token size to prevent header size errors
      if (token.length > 4000) {
        console.error('Token exceeds safe size limit. Clearing token to prevent header size errors.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?error=token_size';
        }
        return config;
      }
      
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Error handler function (simplified version of the one in apiService)
const handleApiError = (error) => {
  let message = 'An unexpected error occurred';
  
  if (error.response) {
    // The server responded with a status code outside the 2xx range
    let serverMessage = error.response.data?.message;
    message = serverMessage || `Error ${error.response.status}: ${error.response.statusText}`;
  } else if (error.request) {
    // The request was made but no response was received
    message = 'No response from server. Please check your connection.';
  } else {
    // Something happened in setting up the request
    message = error.message;
  }
  
  return { message, originalError: error };
};

// Create a chat-specific API service
const chatApiService = {
  /**
   * POST request with a longer timeout for chat operations
   * @param {string} url - API endpoint path
   * @param {Object} data - Request payload
   * @param {Object} config - Additional axios config
   * @returns {Promise} - Axios response promise
   */
  post: async (url, data = {}, config = {}) => {
    try {
      // console.log('Using chat API service with extended timeout'); // Removed log
      const response = await chatApi.post(url, data, config);
      return response.data;
    } catch (error) {
      console.error('Chat API error:', error);
      throw handleApiError(error);
    }
  }
};

export default chatApiService;
