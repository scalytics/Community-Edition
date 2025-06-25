/**
 * Auth service utility functions
 */

/**
 * Parse and standardize API responses
 * @param {Object} rawResponse - Raw API response
 * @param {Array} successIndicators - Additional indicators of success
 * @returns {Object} Standardized response
 */
export const parseResponse = (rawResponse, successIndicators = []) => {
  // Handle various response formats to extract the actual data
  let response;
  
  // First check if it's an Axios response with a data property
  if (rawResponse?.data) {
    // It's an Axios response
    response = rawResponse.data;
  } else {
    // It's already the data object
    response = rawResponse;
  }
  
  // Check if operation was successful using various indicators
  const isSuccess = response.success || 
                    response.status === 'success' || 
                    response.status === 200 || 
                    rawResponse.status === 200 ||
                    successIndicators.some(indicator => 
                      !!response[indicator] || !!(response.data && response.data[indicator])
                    );
  
  return {
    response,
    isSuccess
  };
};

/**
 * Extract error message from error object
 * @param {Error} error - Error object
 * @param {string} defaultMessage - Default error message
 * @returns {string} Extracted error message
 */
export const extractErrorMessage = (error, defaultMessage = 'An unexpected error occurred') => {
  let errorMessage = defaultMessage;
  
  if (error.response && error.response.data) {
    const responseData = error.response.data;
    
    // Check for the newer format which has a details field
    if (responseData.details) {
      errorMessage = responseData.message ? 
                    `${responseData.message}` : 
                    defaultMessage;
    } else {
      errorMessage = responseData.message || 
                    responseData.error || 
                    (typeof responseData === 'string' ? responseData : errorMessage);
    }
  } else if (error.message) {
    errorMessage = error.message;
  }
  
  // Final check to ensure no problematic characters remain
  if (errorMessage && typeof errorMessage === 'string') {
    // If there's an unexpected dash in the error string (often causes issues with console display)
    if (errorMessage.includes('–') || errorMessage.includes('—')) {
      errorMessage = errorMessage.replace(/[–—]/g, '-');
    }
  }
  
  return errorMessage;
};

/**
 * Sanitize token to ensure it's properly formatted
 * @param {string} token - Token to sanitize
 * @returns {string} Sanitized token
 */
export const sanitizeToken = (token) => {
  // Only trim the token but preserve all characters including dashes/hyphens
  // Tokens often include characters like dashes which are valid and needed
  const sanitizedToken = token.trim();
  
  if (sanitizedToken !== token) {
    console.warn('Token was trimmed. Original:', token, 'Trimmed:', sanitizedToken);
  }
  
  return sanitizedToken;
};
