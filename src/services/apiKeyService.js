const axios = require('axios'); // Import axios for making HTTP requests
const { db } = require('../models/db');
const { encryptionHelpers } = require('../utils/encryptionUtils'); // Import from new util file

/**
 * Service for API key operations with proper abstraction
 */
const apiKeyService = {
  /**
   * Get a global API key for a provider
   * @param {number} providerId - The provider ID
   * @returns {Promise<Object|null>} - The API key or null if not found
   */
  getGlobalApiKey: async (providerId) => {
    try {
      const apiKey = await db.getAsync(`
        SELECT id, key_value, is_encrypted
        FROM api_keys
        WHERE provider_id = ? 
          AND is_active = 1 
          AND (is_global = 1 OR user_id IS NULL)
        ORDER BY updated_at DESC
        LIMIT 1
      `, [providerId]);

      if (!apiKey) return null;

      // Decrypt if necessary
      let keyValue = apiKey.key_value;
      if (apiKey.is_encrypted) {
        try {
          keyValue = encryptionHelpers.decrypt(keyValue);
        } catch (decryptErr) {
          console.error(`Error decrypting global key:`, decryptErr);
        }
      }

      return {
        id: apiKey.id,
        key: keyValue
      };
    } catch (error) {
      console.error('Error getting global API key:', error);
      return null;
    }
  },

  /**
   * Get a user's API key for a provider
   * @param {number} userId - The user ID
   * @param {number} providerId - The provider ID
   * @returns {Promise<Object|null>} - The API key or null if not found
   */
  getUserApiKey: async (userId, providerId) => {
    try {
      const apiKey = await db.getAsync(`
        SELECT id, key_value, is_encrypted
        FROM api_keys
        WHERE user_id = ?
          AND provider_id = ? 
          AND is_active = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [userId, providerId]);

      if (!apiKey) return null;

      // Decrypt if necessary
      let keyValue = apiKey.key_value;
      if (apiKey.is_encrypted) {
        try {
          keyValue = encryptionHelpers.decrypt(keyValue);
        } catch (decryptErr) {
          console.error(`Error decrypting user key:`, decryptErr);
        }
      }

      return {
        id: apiKey.id,
        key: keyValue
      };
    } catch (error) {
      console.error('Error getting user API key:', error);
      return null;
    }
  },

  /**
   * Get the best available API key for a user and provider
   * Checks global keys first, then user keys
   * @param {number} userId - The user ID
   * @param {string} providerName - The provider name
   * @returns {Promise<Object|null>} - The API key or null if not found
   */
  getBestApiKey: async (userId, providerName) => {
    try {
      // Get the provider by name
      const provider = await db.getAsync(`SELECT id FROM api_providers WHERE name = ?`, [providerName]);
      if (!provider) {
        return null;
      }

      // Try global key first
      const globalKey = await apiKeyService.getGlobalApiKey(provider.id);
      if (globalKey) {
        return globalKey;
      }

      // Fall back to user key
      const userKey = await apiKeyService.getUserApiKey(userId, provider.id);
      if (userKey) {
        return userKey;
      }

      // No active key found
      return null;
    } catch (error) {
      console.error('Error getting best API key:', error);
      return null;
    }
  },

  /**
   * Check if a user has any valid API key for a provider
   * (either a global key or their own)
   * @param {number} userId - The user ID
   * @param {number} providerId - The provider ID
   * @returns {Promise<boolean>} - Whether a valid key exists
   */
  hasValidApiKey: async (userId, providerId) => {
    try {
      // Check global key
      const hasGlobalKey = await db.getAsync(`
        SELECT 1 FROM api_keys 
        WHERE provider_id = ? AND is_active = 1 AND (is_global = 1 OR user_id IS NULL)
        LIMIT 1
      `, [providerId]);

      if (hasGlobalKey) return true;

      // Check user key
      const hasUserKey = await db.getAsync(`
        SELECT 1 FROM api_keys 
        WHERE user_id = ? AND provider_id = ? AND is_active = 1
        LIMIT 1
      `, [userId, providerId]);

      return !!hasUserKey;
    } catch (error) {
      console.error('Error checking for valid API key:', error);
      return false;
    }
  },

  /**
   * Activate all global API keys
   * @returns {Promise<boolean>} - Success status
   */
  activateAllGlobalKeys: async () => {
    try {
      await db.runAsync(`
        UPDATE api_keys 
        SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
        WHERE (is_global = 1 OR user_id IS NULL)
      `);
      return true;
    } catch (error) {
      console.error('Error activating global API keys:', error);
      return false;
    }
  },

  /**
   * Deactivate all external API keys
   * @returns {Promise<boolean>} - Success status
   */
  deactivateAllExternalKeys: async () => {
    try {
      // Check if api_providers has an is_external column
      const providersTableInfo = await db.allAsync(`PRAGMA table_info(api_providers)`);
      const hasIsExternalColumn = providersTableInfo.some(column => column.name === 'is_external');
      
      let query;
      if (hasIsExternalColumn) {
        // If we have an is_external column, use it for more reliable identification
        query = `
          UPDATE api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE provider_id IN (
            SELECT id FROM api_providers 
            WHERE is_external = 1
          )
        `;
      } else {
        // If no is_external column, use a more specific name pattern matching
        query = `
          UPDATE api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE provider_id IN (
            SELECT id FROM api_providers 
            WHERE name LIKE '%OpenAI%' 
               OR name LIKE '%Anthropic%'
               OR name LIKE '%Claude%'
               OR name LIKE '%GPT%'
               OR name LIKE '%Google AI%' 
               OR name LIKE '%Azure OpenAI%'
               OR name LIKE '%Cohere%'
               OR name LIKE '%Mistral%'
               OR name LIKE '%Hugging Face%'
               OR (name LIKE '%External%' AND name NOT LIKE '%Internal%')
          )
          -- Explicitly exclude any critical internal providers
          AND provider_id NOT IN (
            SELECT id FROM api_providers
            WHERE name LIKE '%Internal Auth%'
               OR name LIKE '%User Service%'
               OR name LIKE '%Core%'
          )
        `;
      }
      
      await db.runAsync(query);
      return true;
    } catch (error) {
      console.error('Error deactivating external API keys:', error);
      return false;
    }
  },

  /**
   * Deactivate API keys for providers belonging to specified categories.
   * @param {string[]} categoriesArray - Array of category names (e.g., ['ext_llm', 'hf'])
   * @returns {Promise<boolean>} - Success status
   */
  deactivateKeysByCategories: async (categoriesArray) => {
    if (!categoriesArray || categoriesArray.length === 0) {
      console.warn('[apiKeyService.deactivateKeysByCategories] No categories provided.');
      return false;
    }
    try {
      const placeholders = categoriesArray.map(() => '?').join(',');
      const query = `
        UPDATE api_keys 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
        WHERE provider_id IN (
          SELECT id FROM api_providers 
          WHERE category IN (${placeholders})
        )
      `;
      await db.runAsync(query, categoriesArray);
      return true;
    } catch (error) {
      console.error(`[apiKeyService] Error deactivating API keys for categories ${categoriesArray.join(', ')}:`, error);
      return false;
    }
  },

  /**
   * Activate global API keys for providers belonging to specified categories.
   * @param {string[]} categoriesArray - Array of category names
   * @returns {Promise<boolean>} - Success status
   */
  activateGlobalKeysByCategories: async (categoriesArray) => {
    if (!categoriesArray || categoriesArray.length === 0) {
      console.warn('[apiKeyService.activateGlobalKeysByCategories] No categories provided.');
      return false;
    }
    try {
      const placeholders = categoriesArray.map(() => '?').join(',');
      const query = `
        UPDATE api_keys 
        SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
        WHERE (is_global = 1 OR user_id IS NULL) 
          AND provider_id IN (
            SELECT id FROM api_providers 
            WHERE category IN (${placeholders})
          )
      `;
      await db.runAsync(query, categoriesArray);
      return true;
    } catch (error) {
      console.error(`[apiKeyService] Error activating global API keys for categories ${categoriesArray.join(', ')}:`, error);
      return false;
    }
  },

  /**
   * Verify a Brave Search API key by making a test request.
   * @param {string} apiKey - The Brave Search API key to verify.
   * @returns {Promise<boolean>} - True if the key is valid, false otherwise.
   */
  verifyBraveApiKey: async (apiKey) => {
    if (!apiKey) {
      return false;
    }
    const testUrl = 'https://api.search.brave.com/res/v1/web/search?q=test'; // Simple test query
    try {
      const response = await axios.get(testUrl, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        timeout: 5000, // 5 second timeout
      });
      // Expecting a 2xx status code for a valid key, even if the query is basic
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.warn(`Brave API key verification failed: ${error.message}`);
      // Specifically check for common auth errors (401, 403) if possible from error response
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      }
      return false;
    }
  },
};

module.exports = apiKeyService;
