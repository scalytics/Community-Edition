const { db } = require('../models/db');
const fs = require('fs').promises;
const path = require('path');

/**
 * Initialize default API provider configurations
 * This ensures all providers have proper URLs and endpoints configured
 */
async function initializeProviderConfigs() {
  try {
    // Default provider configurations
    const defaultProviders = [
      {
        name: 'OpenAI',
        description: 'OpenAI API for ChatGPT, GPT-4, and other models',
        api_url: 'https://api.openai.com',
        endpoints: {
          models: '/v1/models',
          chat: '/v1/chat/completions',
          validate: '/v1/models'
        }
      },
      {
        name: 'Anthropic',
        description: 'Anthropic API for Claude models',
        api_url: 'https://api.anthropic.com',
        endpoints: {
          models: '/v1/models',
          chat: '/v1/messages',
          validate: '/v1/models'
        },
        // Updated API version for Claude 3 models
        api_version: '2023-06-01'
      },
      {
        name: 'Cohere',
        description: 'Cohere API for Command models',
        api_url: 'https://api.cohere.ai',
        endpoints: {
          chat: '/v1/chat',
          validate: '/v1/tokenize'
        }
      },
      {
        name: 'Mistral',
        description: 'Mistral API for Mistral models',
        api_url: 'https://api.mistral.ai',
        endpoints: {
          models: '/v1/models',
          chat: '/v1/chat/completions',
          validate: '/v1/models'
        }
      },
      {
        name: 'Scalytics MCP',
        description: 'Model Context Protocol provider for standardized AI interactions',
        api_url: process.env.MCP_API_BASE_URL || 'https://api.example.com/mcp',
        endpoints: {
          models: '/models',
          chat: '/chat/completions',
          validate: '/status'
        },
        // Flag indicating no API key required
        requires_api_key: false
      }
    ];

    // Check if we need to add an endpoints column to api_providers
    try {
      await db.getAsync("SELECT endpoints FROM api_providers LIMIT 1");
      console.log('Endpoints column already exists in api_providers table');
    } catch (error) {
      // Column doesn't exist, so create it
      console.log('Adding endpoints column to api_providers table');
      await db.runAsync("ALTER TABLE api_providers ADD COLUMN endpoints TEXT");
    }

    // Check if we need to add an api_version column to api_providers
    try {
      await db.getAsync("SELECT api_version FROM api_providers LIMIT 1");
      console.log('API version column already exists in api_providers table');
    } catch (error) {
      // Column doesn't exist, so create it
      console.log('Adding api_version column to api_providers table');
      await db.runAsync("ALTER TABLE api_providers ADD COLUMN api_version TEXT");
    }

    // Update or insert providers
    for (const provider of defaultProviders) {
      // Check if provider exists
      const existingProvider = await db.getAsync(
        'SELECT * FROM api_providers WHERE name = ?',
        [provider.name]
      );

      // Add requires_api_key column if it doesn't exist
      try {
        await db.getAsync("SELECT requires_api_key FROM api_providers LIMIT 1");
      } catch (error) {
        console.log('Adding requires_api_key column to api_providers table');
        await db.runAsync("ALTER TABLE api_providers ADD COLUMN requires_api_key BOOLEAN DEFAULT 1");
      }

      if (existingProvider) {
        // Update existing provider
        await db.runAsync(
          `UPDATE api_providers 
           SET description = ?, api_url = ?, endpoints = ?, api_version = ?, requires_api_key = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [
            provider.description,
            provider.api_url,
            JSON.stringify(provider.endpoints),
            provider.api_version || null,
            provider.requires_api_key === false ? 0 : 1,
            existingProvider.id
          ]
        );
        console.log(`Updated configuration for provider: ${provider.name}`);
      } else {
        // Insert new provider
        await db.runAsync(
          `INSERT INTO api_providers (name, description, api_url, endpoints, api_version, requires_api_key, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [
            provider.name,
            provider.description,
            provider.api_url,
            JSON.stringify(provider.endpoints),
            provider.api_version || null,
            provider.requires_api_key === false ? 0 : 1
          ]
        );
        console.log(`Added new provider: ${provider.name}`);
      }
    }
  } catch (error) {
    console.error('=== PROVIDER CONFIG: Error initializing provider configurations ===', error);
  }
}

/**
 * Get provider configuration including endpoints
 * @param {string} providerName - Name of the provider
 * @returns {Promise<Object>} - Provider configuration
 */
async function getProviderConfig(providerName) {
  try {
    const provider = await db.getAsync(
      'SELECT * FROM api_providers WHERE name = ?',
      [providerName]
    );

    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    // Parse endpoints JSON
    let endpoints = {};
    if (provider.endpoints) {
      try {
        endpoints = JSON.parse(provider.endpoints);
      } catch (e) {
        console.error(`Error parsing endpoints for ${providerName}:`, e);
      }
    }

    return {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      apiUrl: provider.api_url,
      endpoints: endpoints,
      apiVersion: provider.api_version,
      isActive: Boolean(provider.is_active)
    };
  } catch (error) {
    console.error(`Error getting provider config for ${providerName}:`, error);
    throw error;
  }
}

/**
 * Get a full API endpoint URL for a provider and endpoint type
 * @param {string} providerName - Name of the provider
 * @param {string} endpointType - Type of endpoint (chat, models, validate, etc.)
 * @returns {Promise<string>} - Full URL
 */
async function getProviderEndpoint(providerName, endpointType) {
  try {
    const config = await getProviderConfig(providerName);

    if (!config.endpoints || !config.endpoints[endpointType]) {
      throw new Error(`Endpoint ${endpointType} not configured for ${providerName}`);
    }

    return `${config.apiUrl}${config.endpoints[endpointType]}`;
  } catch (error) {
    console.error(`Error getting endpoint for ${providerName}/${endpointType}:`, error);
    throw error;
  }
}

/**
 * Get the API version for a provider
 * @param {string} providerName - Name of the provider
 * @returns {Promise<string|null>} - API version or null if not specified
 */
async function getProviderApiVersion(providerName) {
  try {
    const config = await getProviderConfig(providerName);
    return config.apiVersion || null;
  } catch (error) {
    console.error(`Error getting API version for ${providerName}:`, error);
    return null;
  }
}



module.exports = {
  initializeProviderConfigs,
  getProviderConfig,
  getProviderEndpoint,
  getProviderApiVersion
};