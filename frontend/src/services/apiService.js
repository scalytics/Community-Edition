import axios from 'axios';

// Create an axios instance with default config
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor for adding the auth token
api.interceptors.request.use(
  (config) => {
    // CRITICAL FIX: Remove Content-Type for FormData requests
    // This allows the browser to set the correct multipart boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    const token = localStorage.getItem('token');
    if (token) {
      // Check token size to prevent "Request Header Fields Too Large" errors
      if (token.length > 4000) {
        console.error('Token exceeds safe size limit. Clearing token to prevent header size errors.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirect to login page if not already there
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

// Response interceptor for handling errors
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API error intercepted:', error.response?.status, error.response?.data);
    
    // Handle authentication errors (401)
    if (error.response && error.response.status === 401) {
      // Extract specific error type if available
      const errorType = error.response.data?.error || 'session_expired';
      
      // Clear session data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login page if not already there and not in set-password flow
      if (!window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/set-password')) {
        
        let redirectUrl = '/login';
        
        // Add appropriate query parameter based on error type
        switch (errorType) {
          case 'token_expired':
            redirectUrl += '?session=expired';
            break;
          case 'invalid_token':
            redirectUrl += '?session=invalid';
            break;
          case 'user_not_found':
            redirectUrl += '?error=account_deleted';
            break;
          default:
            redirectUrl += '?session=expired';
        }
        
        window.location.href = redirectUrl;
      }
    }
    
    // For set-password and register-redirect routes, don't redirect on auth errors
    // This allows the components to handle errors appropriately
    if ((window.location.pathname.includes('/set-password') || 
         window.location.pathname.includes('/register-redirect')) && 
        error.response && error.response.status === 400) {
      console.log('Token verification error in auth flow:', error.response.data);
      
      // If error contains a dash or en-dash character that might cause frontend issues
      if (error.response.data?.message && 
          (error.response.data.message.includes('-') || 
           error.response.data.message.includes('–'))) {
        console.warn('Sanitizing error message to prevent dash character issues');
        error.response.data.message = error.response.data.message
          .replace(/-/g, ' ')
          .replace(/–/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Just pass the error through to be handled by the component
    }
    
    return Promise.reject(error);
  }
);

// Export the base URL function separately so it can be used without importing the entire service
export const getBaseUrl = () => {
  return process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
};

// Generic API service
const apiService = {
  // Include getBaseUrl in the service for backward compatibility
  getBaseUrl,
  
  // Add a more robust version of getBaseUrl with path joining
  getUrlFor: (path) => {
    const baseUrl = getBaseUrl();
    
    // Remove trailing slash from baseUrl if present
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    // Remove leading slash from path if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    // Join with a slash
    const url = `${cleanBase}/${cleanPath}`;
    
    return url;
  },
  
  // GET request
  get: async (url, params = {}, config = {}) => {
    try {
      // Merge params into config
      const mergedConfig = { 
        ...config,
        params
      };
      
      const response = await api.get(url, mergedConfig);
      
      // Return the data from the response
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // POST request with improved config handling for file uploads
  post: async (url, data = {}, config = {}) => {
    try {
      // Pass through additional config options (like onUploadProgress)
      const response = await api.post(url, data, config);
      
      // Return the data from the response
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // PUT request with config support
  put: async (url, data = {}, config = {}) => {
    try {
      // Removed console.log for PUT request/response
      const response = await api.put(url, data, config);
      
      // Return the data from the response
      return response.data;
    } catch (error) {
      console.error(`PUT request to ${url} failed:`, error);
      throw handleApiError(error);
    }
  },

  // PATCH request with config support
  patch: async (url, data = {}, config = {}) => {
    try {
      const response = await api.patch(url, data, config);
      return response.data;
    } catch (error) {
      console.error(`PATCH request to ${url} failed:`, error);
      throw handleApiError(error);
    }
  },

  // DELETE request
  delete: async (url, config = {}) => {
    try {
      const response = await api.delete(url, config);
      
      // Return the data from the response
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // --- Chat Sharing ---
  // Corrected: Accepts data object directly
  createShareInvitation: async (chatId, data) => {
    // Pass the received data object directly as the POST body
    return apiService.post(`/chat/${chatId}/shares`, data);
  },
  removeShare: async (chatId, targetUserId) => {
    return apiService.delete(`/chat/${chatId}/shares/${targetUserId}`);
  },
  getChatShares: async (chatId) => {
    return apiService.get(`/chat/${chatId}/shares`);
  },
  getPendingShares: async () => {
    return apiService.get('/shares/pending');
  },
  getSharedWithMeChats: async () => { // New function
    return apiService.get('/chat/shared-with-me');
  },
  acceptShare: async (shareId) => {
    return apiService.post(`/shares/${shareId}/accept`);
  },
  declineShare: async (shareId) => {
    return apiService.post(`/shares/${shareId}/decline`);
  },

  // --- User Search ---
  searchUsers: async (query, limit = 10) => {
    return apiService.get('/users/search', { q: query, limit });
  },

  // --- MCP Tools ---
  getAvailableToolDefinitions: async () => {
    return apiService.get('/mcp/tools/definitions');
  },

  // --- Admin: Content Filtering ---
  // Corrected paths based on src/config/routes.js mounting: /api/admin/filters
  getFilterGroups: async () => {
    return apiService.get('/admin/filters/groups');
  },
  createFilterGroup: async (groupData) => {
    return apiService.post('/admin/filters/groups', groupData);
  },
  updateFilterGroup: async (groupId, groupData) => {
    return apiService.put(`/admin/filters/groups/${groupId}`, groupData);
  },
  deleteFilterGroup: async (groupId) => {
    return apiService.delete(`/admin/filters/groups/${groupId}`);
  },
  getFilterRules: async (groupId) => {
    // Rules are nested under groups in the router file (adminFilteringRoutes.js)
    return apiService.get(`/admin/filters/groups/${groupId}/rules`);
  },
  createFilterRule: async (groupId, ruleData) => {
    return apiService.post(`/admin/filters/groups/${groupId}/rules`, ruleData);
  },
  updateFilterRule: async (ruleId, ruleData) => {
    // Rules are accessed directly by ID in the router file
    return apiService.put(`/admin/filters/rules/${ruleId}`, ruleData);
  },
  deleteFilterRule: async (ruleId) => {
    return apiService.delete(`/admin/filters/rules/${ruleId}`);
  },
  updateFilterRuleStatus: async (ruleId, isActive) => {
    // Use the specific status endpoint we created under the rules path
    return apiService.patch(`/admin/filters/rules/${ruleId}/status`, { is_active: isActive });
  }
};

// Error handler with improved error sanitization
const handleApiError = (error) => {
  let message = 'An unexpected error occurred';
  
  if (error.response) {
    // The server responded with a status code outside the 2xx range
    let serverMessage = error.response.data?.message;
    
    // Sanitize error messages containing dashes that could cause frontend issues
    if (serverMessage && (serverMessage.includes('-') || serverMessage.includes('–'))) {
      console.warn('Sanitizing error message that contains problematic dash characters');
      serverMessage = serverMessage
        .replace(/-/g, ' ')
        .replace(/–/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Special handling for common file upload errors
    if (error.response.status === 413) {
      message = 'File too large. The server rejected the upload.';
    } else if (error.response.status === 415) {
      message = 'Unsupported file type. Please try a different format.';
    } else if (error.response.status === 400 && 
              (serverMessage?.includes('file') || error.config?.data instanceof FormData)) {
      message = serverMessage || 'File upload failed. Please check file format and size.';
    } else {
      message = serverMessage || `Error ${error.response.status}: ${error.response.statusText}`;
    }
  } else if (error.request) {
    // The request was made but no response was received
    message = 'No response from server. Please check your connection.';
  } else {
    // Something happened in setting up the request
    message = error.message;
  }
  
  return { message, originalError: error };
};

export default apiService;
