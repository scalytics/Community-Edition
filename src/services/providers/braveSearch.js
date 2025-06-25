const axios = require('axios');

/**
 * Brave Search Provider Module
 */
const braveSearchProvider = {
  /**
   * Validates an API key for Brave Search.
   * @param {string} apiKey - The API key (X-Subscription-Token).
   * @param {Object} providerConfig - The provider's database record from api_providers.
   *                                  (api_url should ideally be https://api.search.brave.com/res/v1)
   * @returns {Promise<{isValid: boolean, errorMessage?: string}>}
   */
  validateApiKey: async (apiKey, providerConfig) => {
    if (!apiKey) {
      return { isValid: false, errorMessage: 'API key (X-Subscription-Token) is required for Brave Search.' };
    }

    const braveApiUrl = providerConfig?.api_url && providerConfig.api_url.includes('api.search.brave.com') 
      ? providerConfig.api_url 
      : 'https://api.search.brave.com/res/v1'; 

    const testUrl = `${braveApiUrl.replace(/\/$/, '')}/web/search?q=test&count=1`;

    try {
      await axios.get(testUrl, {
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json'
        },
        timeout: 7000 
      });
      return { isValid: true, message: 'Brave Search API key appears valid.' };
    } catch (axiosError) {
      let errorMessage = `Brave Search API validation request failed: ${axiosError.message}`;
      if (axiosError.response) {
        errorMessage = `Brave Search API validation failed with status ${axiosError.response.status}: ${axiosError.response.data?.message || axiosError.response.data?.error?.message || axiosError.response.statusText || axiosError.message}`;
        if (axiosError.response.status === 401 || axiosError.response.status === 403) {
          errorMessage = `Brave Search API key is invalid or not authorized (HTTP ${axiosError.response.status}).`;
        } else if (axiosError.response.status === 429) {
          errorMessage = `Brave Search API rate limit exceeded (HTTP ${axiosError.response.status}).`;
        }
      }
      console.error(`[BraveSearchProvider] Validation Axios Error: ${errorMessage}`);
      return { isValid: false, errorMessage: errorMessage };
    }
  },

  /**
   * Brave Search does not have discoverable "models" in the traditional sense.
   * Returns an empty list.
   * @returns {Promise<{models: Array, error?: string}>}
   */
  discoverModels: async () => {
    return { models: [], error: null }; 
  },
};

module.exports = braveSearchProvider;
