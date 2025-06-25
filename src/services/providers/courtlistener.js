const axios = require('axios');

class SearchResultItem {
  constructor({ url, title, snippet, provider_name, query_phrase_used, position, raw_provider_data }) {
    this.url = url;
    this.title = title;
    this.snippet = snippet;
    this.provider_name = provider_name;
    this.query_phrase_used = query_phrase_used;
    this.position = position;
    this.raw_provider_data = raw_provider_data;
  }
}

/**
 * CourtListener Search Provider
 *
 * Communicates with the CourtListener API to search for legal documents.
 */

const courtlistenerProvider = {
  name: 'CourtListener',
  description: 'Search for legal documents from the CourtListener API.',
  requiresApiKey: true,

  /**
   * Executes a search query against the CourtListener API.
   * @param {string} query - The search query.
   * @param {Object} providerConfig - The provider's database record from api_providers.
   * @param {number} maxResults - The maximum number of results to return.
   * @returns {Promise<Array<SearchResultItem>>} - A list of search result items.
   */
  search: async (query, providerConfig, maxResults = 10, apiKey) => {
    const baseUrl = providerConfig.api_url || 'https://www.courtlistener.com/api/rest/v4/';
    const searchEndpoint = providerConfig.endpoints?.search || 'opinions/';
    const searchUrl = `${baseUrl}${searchEndpoint}?q=${encodeURIComponent(query)}`;

    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Token ${apiKey}`
        }
      });

      if (response.data && response.data.results) {
        return response.data.results.slice(0, maxResults).map(item => new SearchResultItem({
          url: item.absolute_url,
          title: item.cluster.case_name,
          snippet: item.plain_text.substring(0, 500),
          provider_name: 'CourtListener',
          query_phrase_used: query,
          position: response.data.results.indexOf(item) + 1,
          raw_provider_data: item
        }));
      } else {
        return [];
      }
    } catch (error) {
      console.error(`[CourtListenerProvider] Error searching for query "${query}":`, error.response ? error.response.data : error.message);
      return [];
    }
  },

  /**
   * Validates the provider configuration.
   * @param {Object} providerConfig - The provider's database record from api_providers.
   * @returns {Promise<{isValid: boolean, errorMessage?: string}>}
   */
  validateApiKey: async (apiKey, providerConfig) => {
    if (!apiKey) {
      return { isValid: false, errorMessage: 'API key is required for CourtListener.' };
    }

    const courtlistenerApiUrl = providerConfig?.api_url && providerConfig.api_url.includes('api.courtlistener.com') 
      ? providerConfig.api_url 
      : 'https://www.courtlistener.com/api/rest/v4/'; 

    const testUrl = `${courtlistenerApiUrl.replace(/\/$/, '')}/opinions/?q=test&count=1`;

    try {
      await axios.get(testUrl, {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 7000 
      });
      return { isValid: true, message: 'CourtListener API key appears valid.' };
    } catch (axiosError) {
      let errorMessage = `CourtListener API validation request failed: ${axiosError.message}`;
      if (axiosError.response) {
        errorMessage = `CourtListener API validation failed with status ${axiosError.response.status}: ${axiosError.response.data?.detail || axiosError.response.statusText || axiosError.message}`;
        if (axiosError.response.status === 401 || axiosError.response.status === 403) {
          errorMessage = `CourtListener API key is invalid or not authorized (HTTP ${axiosError.response.status}).`;
        }
      }
      console.error(`[CourtListenerProvider] Validation Axios Error: ${errorMessage}`);
      return { isValid: false, errorMessage: errorMessage };
    }
  }
};

module.exports = courtlistenerProvider;
