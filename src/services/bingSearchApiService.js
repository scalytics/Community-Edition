const axios = require('axios');

/**
 * Performs a web search using the official Bing Web Search API.
 * Requires a user-provided API key.
 *
 * @param {string} query - The search query.
 * @param {string} apiKey - The user's Bing Search API key.
 * @returns {Promise<Array<{title: string, snippet: string, link: string}>>} - A promise that resolves to an array of search results.
 * @throws {Error} - Throws an error if the API call fails.
 */
async function searchBingApi(query, apiKey) {
  if (!apiKey) {
    throw new Error('Bing Search API Key is required.');
  }
  console.log(`[BingSearchAPI] Performing search for: "${query}"`);

  const endpoint = 'https://api.bing.microsoft.com/v7.0/search';
  const params = {
    q: query,
    // count: 10, // Optional: Number of results
    // offset: 0, // Optional: Offset for pagination
    // mkt: 'en-US', // Optional: Market code
    // safesearch: 'Moderate', // Optional: Safe search level ('Off', 'Moderate', 'Strict')
  };
  const headers = {
    'Ocp-Apim-Subscription-Key': apiKey,
  };

  try {
    const response = await axios.get(endpoint, { params, headers });

    if (!response.data || !response.data.webPages || !response.data.webPages.value) {
      console.warn('[BingSearchAPI] No results found or unexpected response format.');
      return [];
    }

    // Map the results to a consistent format
    const formattedResults = response.data.webPages.value.map(item => ({
      title: item.name || '',
      snippet: item.snippet || '',
      link: item.url || '',
    }));

    console.log(`[BingSearchAPI] Found ${formattedResults.length} results.`);
    return formattedResults;

  } catch (error) {
    console.error('[BingSearchAPI] Error during API call:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(`Bing Search API request failed: ${errorMessage}`);
  }
}

module.exports = { searchBingApi };
