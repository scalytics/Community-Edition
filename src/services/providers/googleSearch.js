const axios = require('axios');

/**
 * Google Search Provider Module
 */
const googleSearchProvider = {
  /**
   * Validates an API key for Google Custom Search.
   * Requires the API key and a CX (Custom Search Engine ID).
   * The CX is expected to be in providerConfig.endpoints.cx
   * @param {string} apiKey - The API key.
   * @param {Object} providerConfig - The provider's database record from api_providers.
   * @returns {Promise<{isValid: boolean, errorMessage?: string}>}
   */
  validateApiKey: async (apiKey, providerConfig) => {
    if (!apiKey) {
      return { isValid: false, errorMessage: 'API key is required.' };
    }

    let cx;
    try {
      if (providerConfig && providerConfig.endpoints) {
        const endpoints = JSON.parse(providerConfig.endpoints);
        cx = endpoints.cx;
      }
    } catch (e) {
      console.error('[GoogleSearchProvider] Error parsing endpoints JSON:', e); 
      return { isValid: false, errorMessage: 'Invalid CX configuration in provider endpoints.' };
    }

    if (!cx) {
      return { 
        isValid: false, 
        errorMessage: 'CX (Custom Search Engine ID) is not configured for this Google Search provider. Please set it in the provider\'s "endpoints" configuration as {"cx": "YOUR_CX_ID"}.' 
      };
    }

    const testUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=test&num=1`; 

    try {
      const response = await axios.get(testUrl, { timeout: 7000 });
      
      if (response.data && response.data.error) {
        let errorMessage = `Google Search API error: ${response.data.error.message || 'Unknown error'}`;
        if (response.data.error.code === 403 || response.data.error.code === 400) {
           errorMessage = `Google Search API key or CX may be invalid, or access is restricted. Details: ${response.data.error.message}`;
        }
        return { isValid: false, errorMessage: errorMessage };
      }
      
      return { isValid: true, message: 'Google Search API key and CX appear valid.' };

    } catch (axiosError) {
      let errorMessage = `Google Search API validation request failed: ${axiosError.message}`;
      if (axiosError.response) {
        errorMessage = `Google Search API validation failed with status ${axiosError.response.status}: ${axiosError.response.data?.error?.message || axiosError.response.statusText || axiosError.message}`;
         if (axiosError.response.status === 401 || axiosError.response.status === 403) {
            errorMessage = `Google Search API key or CX may be invalid, or access is restricted (HTTP ${axiosError.response.status}).`;
        } else if (axiosError.response.status === 400) {
            errorMessage = `Google Search API validation failed with status 400: Request contains an invalid argument. This may be due to an incorrect CX ID, an issue with the query 'test', or API key restrictions. Original error: ${axiosError.response.data?.error?.message || axiosError.response.statusText || axiosError.message}`;
        }
      }
      console.error(`[GoogleSearchProvider] Validation Axios Error: ${errorMessage}`); 
      return { isValid: false, errorMessage: errorMessage };
    }
  },

  /**
   * Google Search does not have discoverable "models" in the traditional sense.
   * Returns an empty list.
   * @returns {Promise<{models: Array, error?: string}>}
   */
  discoverModels: async () => {
    return { models: [], error: null }; // No discoverable models for a search service
  },
};

module.exports = googleSearchProvider;
