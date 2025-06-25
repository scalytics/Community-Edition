/**
 * Provider Manager Module
 * 
 * Centralizes access to all providers and abstracts provider-specific functionality
 */

// Import all provider modules
const anthropic = require('./anthropic');
const openai = require('./openai');
const cohere = require('./cohere');
const mistral = require('./mistral');
const huggingface = require('./huggingface');
const google = require('./google');
const googleSearch = require('./googleSearch');
const braveSearch = require('./braveSearch');
const courtlistener = require('./courtlistener');
const xai = require('./xai'); 
const local = require('./local') || createLocalProvider();

/**
 * Create a default local provider if not explicitly defined
 * @returns {Object} The local provider object
 */
function createLocalProvider() {
  return {
    name: 'Local',
    description: 'Local model provider',
    discoverModels: async () => [],
    getDefaultModels: () => []
  };
}

/**
 * All available providers
 */
const providers = {
  'OpenAI': openai,
  'Anthropic': anthropic,
  'Cohere': cohere,
  'Mistral': mistral,
  'Hugging Face': huggingface,
  'Google': google, 
  'xAI': xai,
  'Local': local,
  'Google Search': googleSearch,
  'Brave Search': braveSearch,
  'CourtListener': courtlistener,
  'Bing Search': { 
    name: 'Bing Search', 
    description: 'Bing Web Search API', 
    getDefaultModels: () => [] 
  } 
};

/**
 * Gets a provider by name
 * @param {string} name - Provider name
 * @returns {Object|null} Provider object or null if not found
 */
function getProvider(name) {
  return providers[name] || null;
}

/**
 * Gets all providers
 * @returns {Object} All provider objects
 */
function getAllProviders() {
  return providers;
}

module.exports = {
  getProvider,
  getAllProviders
};
