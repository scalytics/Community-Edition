const axios = require('axios');

/**
 * Performs a web search using the official Google Custom Search JSON API.
 * Requires a user-provided API key and a Custom Search Engine ID (CX).
 *
 * @param {string} query - The search query.
 * @param {string} apiKey - The user's Google API key.
 * @param {string} cx - The user's Google Custom Search Engine ID.
 * @returns {Promise<Array<{title: string, snippet: string, link: string}>>} - A promise that resolves to an array of search results.
 * @throws {Error} - Throws an error if the API call fails.
 */
async function searchGoogleApi(query, apiKey, cx) {
  if (!apiKey || !cx) {
    throw new Error('Google API Key and Custom Search Engine ID (CX) are required.');
  }
  console.log(`[GoogleSearchAPI] Performing search for: "${query}"`);

  const endpoint = 'https://www.googleapis.com/customsearch/v1';
  const params = {
    key: apiKey,
    cx: cx,
    q: query,
    // num: 10, // Optional: Number of results (default is 10)
    // safe: 'medium', // Optional: Safe search level ('high', 'medium', 'off')
  };

  try {
    const response = await axios.get(endpoint, { params });

    if (!response.data || !response.data.items) {
      console.warn('[GoogleSearchAPI] No results found or unexpected response format.');
      return [];
    }

    // Map the results to a consistent format
    const formattedResults = response.data.items.map(item => ({
      title: item.title || '',
      snippet: item.snippet || '',
      link: item.link || '',
    }));

    console.log(`[GoogleSearchAPI] Found ${formattedResults.length} results.`);
    return formattedResults;

  } catch (error) {
    console.error('[GoogleSearchAPI] Error during API call:', error.response?.data || error.message);
    throw new Error(`Google Search API request failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

module.exports = { searchGoogleApi };
