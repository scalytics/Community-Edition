const { db } = require('../models/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const apiService = require('../services/apiService');
const apiKeyService = require('../services/apiKeyService');
const { encryptionHelpers } = require('../utils/encryptionUtils');
const { triggerPythonServiceRestart } = require('../utils/pythonServiceUtils');

const RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE = ['Google Search', 'Brave Search', 'Bing Search'];

/**
 * Get API keys for the current user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getUserApiKeys = async (req, res) => {
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return res.status(200).json({
        success: true,
        message: 'API keys table not yet initialized',
        data: []
      });
    }

    const apiKeys = await db.allAsync(`
      SELECT
        k.id,
        k.provider_id,
        p.name as provider_name,
        k.key_name,
        k.is_encrypted,
        k.created_at,
        k.updated_at,
        k.is_active,
        k.is_global
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE k.user_id = ?
      ORDER BY p.name, k.key_name
    `, [req.user.id]);

    // Filter out hashed values for Scalytics API keys
    const filteredKeys = apiKeys.map(key => {
      if (key.provider_name === 'Scalytics API') {
        return { ...key, key_value: undefined, is_encrypted: undefined, is_hashed: true };
      }
      return { ...key, is_hashed: false };
    });

    return res.status(200).json({
      success: true,
      count: filteredKeys.length,
      data: filteredKeys
    });
  } catch (error) {
    console.error('Error getting user API keys:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching API keys'
    });
  }
};

/**
 * Get a list of service names for which the current user has active API keys.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getServicesWithActiveKeys = async (req, res) => {
  try {
    const userId = req.user.id;

    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return res.status(200).json({
        success: true,
        message: 'API keys table not yet initialized',
        data: [] // Return empty array if table doesn't exist
      });
    }

    // Query for distinct service names where the user has an active key
    // OR where an active global key exists for that service.
    const servicesWithKeys = await db.allAsync(`
      SELECT DISTINCT p.name as service_name
      FROM api_providers p
      JOIN api_keys k ON p.id = k.provider_id
      WHERE k.is_active = 1 AND (k.user_id = ? OR k.is_global = 1)
      ORDER BY p.name
    `, [userId]);

    const serviceNames = servicesWithKeys.map(row => row.service_name);

    return res.status(200).json({
      success: true,
      data: serviceNames
    });

  } catch (error) {
    console.error('Error getting services with active keys:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching services with active keys',
      data: [] // Return empty array on error
    });
  }
};

/**
 * Get all API keys (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getAllApiKeys = async (req, res) => {
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return res.status(200).json({
        success: true,
        message: 'API keys table not yet initialized',
        data: []
      });
    }

    const apiKeys = await db.allAsync(`
      SELECT
        k.id,
        k.provider_id,
        p.name as provider_name,
        k.key_name,
        k.is_encrypted,
        k.created_at,
        k.updated_at,
        k.user_id,
        k.is_active,
        k.is_global,
        u.username as user_username,
        u.email as user_email
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      LEFT JOIN users u ON k.user_id = u.id
      WHERE k.is_global = 0 AND k.user_id IS NOT NULL -- Filter for user-specific keys only
      ORDER BY p.name, k.key_name
    `);

    // Filter out hashed values for Scalytics API keys
    const filteredKeys = apiKeys.map(key => {
      if (key.provider_name === 'Scalytics API') {
        return { ...key, key_value: undefined, is_encrypted: undefined, is_hashed: true };
      }
      return { ...key, is_hashed: false };
    });

    return res.status(200).json({
      success: true,
      count: filteredKeys.length,
      data: filteredKeys
    });
  } catch (error) {
    console.error('Error getting API keys:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching API keys'
    });
  }
};

/**
 * Get all global API keys (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getGlobalApiKeys = async (req, res) => {
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return res.status(200).json({
        success: true,
        message: 'API keys table not yet initialized',
        data: []
      });
    }

    const apiKeys = await db.allAsync(`
      SELECT
        k.id,
        k.provider_id,
        p.name as provider_name,
        k.key_name,
        k.is_encrypted,
        k.created_at,
        k.updated_at,
        k.is_active
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE k.is_global = 1 OR k.user_id IS NULL
      ORDER BY p.name, k.key_name
    `);

    // Filter out hashed values for Scalytics API keys
    const filteredKeys = apiKeys.map(key => {
      if (key.provider_name === 'Scalytics API') {
        return { ...key, key_value: undefined, is_encrypted: undefined, is_hashed: true };
      }
      return { ...key, is_hashed: false };
    });

    return res.status(200).json({
      success: true,
      count: filteredKeys.length,
      data: filteredKeys
    });
  } catch (error) {
    console.error('Error getting global API keys:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching API keys'
    });
  }
};

/**
 * Get API key for a specific provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getProviderApiKey = async (req, res) => {
  try {
    const { providerId } = req.params;

    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return res.status(404).json({
        success: false,
        message: 'API keys table not initialized'
      });
    }

    // Prioritize global key, fall back to user's key
    const globalKey = await db.getAsync(`
      SELECT
        k.id,
        k.provider_id,
        p.name as provider_name,
        k.key_name,
        k.is_encrypted,
        k.is_global,
        k.created_at,
        k.updated_at
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE k.provider_id = ? AND k.is_active = 1 AND (k.is_global = 1 OR k.user_id IS NULL)
      LIMIT 1
    `, [providerId]);

    if (globalKey) {
      return res.status(200).json({
        success: true,
        data: globalKey,
        isGlobal: true
      });
    }

    const userKey = await db.getAsync(`
      SELECT
        k.id,
        k.provider_id,
        p.name as provider_name,
        k.key_name,
        k.is_encrypted,
        k.is_global,
        k.created_at,
        k.updated_at
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE k.provider_id = ? AND k.is_active = 1 AND k.user_id = ?
      LIMIT 1
    `, [providerId, req.user.id]);

    if (!userKey) {
      return res.status(404).json({
        success: false,
        message: `No API key found for provider ${providerId}`
      });
    }

    return res.status(200).json({
      success: true,
      data: userKey,
      isGlobal: false
    });
  } catch (error) {
    console.error('Error getting provider API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching API key'
    });
  }
};

/**
 * Create or update a user's API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.setApiKey = async (req, res) => {
  try {
    // Add extraConfig to destructuring
    const { providerId, keyName, keyValue, encrypt, extraConfig } = req.body;

    if (!providerId || !keyName || !keyValue) {
      return res.status(400).json({
        success: false,
        message: 'Provider ID, key name, and key value are required'
      });
    }

    // Check if global privacy mode is enabled
    const privacyMode = await db.getAsync(
      'SELECT value FROM system_settings WHERE key = ?',
      ['global_privacy_mode']
    );

    const isPrivacyModeEnabled = privacyMode && privacyMode.value === 'true';

    // First check if the provider exists (fetch is_external as well)
    // Ensure providerId is treated as a number for the SQL query
    const numericProviderId = Number(providerId);
    if (isNaN(numericProviderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Provider ID format.'
      });
    }

    const provider = await db.getAsync('SELECT id, name, is_external FROM api_providers WHERE id = ?', [numericProviderId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: `Provider with ID ${numericProviderId} not found.` // More specific error
      });
    }

    // If privacy mode is enabled, prevent adding keys for external providers
    if (isPrivacyModeEnabled && provider.is_external === 1) {
      return res.status(403).json({
        success: false,
        message: `Cannot add API keys for external provider '${provider.name}' while Privacy Mode is enabled.`
      });
    }

    // --- Key Verification ---
    // The apiService (from ../services/apiService) now handles provider-specific vs generic validation.
    const validationResult = await apiService.validateApiKey(provider.name, keyValue);
    
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        message: validationResult.message || `API key validation failed for ${provider.name}.`
      });
    }
    // If validationResult.isValid is true, proceed to save the key.
    // Apply encryption if requested
    const isEncrypted = encrypt === true;
    const storedKeyValue = isEncrypted
      ? encryptionHelpers.encrypt(keyValue)
      : keyValue;

    const userId = req.user.id;

    // Check if an API key already exists for this provider and user (ensure providerId is treated as a number)
    const existingKey = await db.getAsync(
      'SELECT id FROM api_keys WHERE provider_id = ? AND user_id = ?',
      [Number(providerId), userId]
    );

    if (existingKey) {
      // Update existing key
      await db.runAsync(
        `UPDATE api_keys
         SET key_name = ?, key_value = ?, is_encrypted = ?, extra_config = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        // Add extraConfig to the update query
        [keyName, storedKeyValue, isEncrypted ? 1 : 0, extraConfig ? JSON.stringify(extraConfig) : null, existingKey.id]
      );

      // Audit Log
      try {
        await db.runAsync(
          `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
          [userId, 'update_user_api_key', JSON.stringify({ keyId: existingKey.id, keyName: keyName, providerName: provider.name }), req.ip]
        );
      } catch (logError) { console.error('Failed to log update_user_api_key action:', logError); }

      return res.status(200).json({
        success: true,
        message: `API key for ${provider.name} updated successfully`,
        data: {
          id: existingKey.id,
          providerId,
          providerName: provider.name,
          keyName,
          isEncrypted,
          userId,
          isGlobal: false
        }
      });
    } else {
      // Create new key (ensure providerId is treated as a number)
      const result = await db.runAsync(
        `INSERT INTO api_keys (provider_id, key_name, key_value, is_encrypted, user_id, is_active, is_global)
         VALUES (?, ?, ?, ?, ?, 1, 0)`, // is_global = 0 for user keys
        [providerId, keyName, storedKeyValue, isEncrypted ? 1 : 0, userId]
      );

      // Discover models for this provider
      try {
        const modelDiscoveryService = require('../services/modelDiscoveryService');
        await modelDiscoveryService.discoverProviderModels(
          provider.name,
           isEncrypted ? encryptionHelpers.decrypt(storedKeyValue) : storedKeyValue
         );

       } catch (discoveryError) {
         console.error(`Error auto-discovering models: ${discoveryError.message}`);
        // Continue despite discovery error - we don't want to fail the API key addition
      }

      // Audit Log
      try {
        await db.runAsync(
          `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
          [userId, 'create_user_api_key', JSON.stringify({ keyId: result.lastID, keyName: keyName, providerName: provider.name }), req.ip]
        );
      } catch (logError) { console.error('Failed to log create_user_api_key action:', logError); }

      return res.status(201).json({
        success: true,
        message: `API key for ${provider.name} created successfully`,
        data: {
          id: result.lastID,
          providerId,
          providerName: provider.name,
          keyName,
          isEncrypted,
          userId,
          isActive: true,
          isGlobal: false
        }
      });
    }
  } catch (error) {
    console.error('Error setting user API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error saving API key'
    });
  }
};

/**
 * Create or update a global API key (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.setGlobalApiKey = async (req, res) => {
  try {
    const { providerId, keyName, keyValue, encrypt } = req.body;

    if (!providerId || !keyName || !keyValue) {
      return res.status(400).json({
        success: false,
        message: 'Provider ID, key name, and key value are required'
      });
    }

    // First check if the provider exists
    let provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // If Google Search and CX is provided in extraConfig, update provider's endpoints *before* validation
    if (provider.name === 'Google Search' && req.body.extraConfig && req.body.extraConfig.cx) {
      const newCx = req.body.extraConfig.cx.trim();
      try {
        const currentEndpoints = provider.endpoints ? JSON.parse(provider.endpoints) : {};
        // Only update if CX is different or not set
        if (currentEndpoints.cx !== newCx) {
          const newEndpoints = { ...currentEndpoints, cx: newCx };
          await db.runAsync(
            'UPDATE api_providers SET endpoints = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(newEndpoints), providerId]
          );
          provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
          if (!provider) { // Should not happen, but as a safeguard
             return res.status(500).json({ success: false, message: 'Failed to reload provider after CX update.' });
          }
        }
      } catch (e) {
      }
    }
    
    // --- Specific Key Verification ---
    let isValid = false;
    let verificationError = 'Verification failed or not supported for this provider.';

    const validationResult = await apiService.validateApiKey(provider.name, keyValue);
    isValid = validationResult.isValid;
    if (!isValid) {
      verificationError = validationResult.message || `Invalid API key for ${provider.name}`;
    }
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: verificationError
      });
    }

    // Apply encryption if requested
    const isEncrypted = encrypt === true;
    const storedKeyValue = isEncrypted
      ? encryptionHelpers.encrypt(keyValue)
      : keyValue;

    // Check if a global API key already exists for this provider
    const existingKey = await db.getAsync(
      'SELECT id FROM api_keys WHERE provider_id = ? AND (is_global = 1 OR user_id IS NULL)',
      [providerId]
    );

    if (existingKey) {
      // Update existing global key
      await db.runAsync(
        `UPDATE api_keys
         SET key_name = ?, key_value = ?, is_encrypted = ?,
         is_global = 1, user_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [keyName, storedKeyValue, isEncrypted ? 1 : 0, existingKey.id]
      );

      // Audit Log
      try {
        await db.runAsync(
          `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
          [req.user.id, 'update_global_api_key', JSON.stringify({ keyId: existingKey.id, keyName: keyName, providerName: provider.name }), req.ip]
        );
      } catch (logError) { console.error('Failed to log update_global_api_key action:', logError); }

      if (RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE.includes(provider.name)) {
        triggerPythonServiceRestart();
      }

      return res.status(200).json({
        success: true,
        message: `Global API key for ${provider.name} updated successfully`,
        data: {
          id: existingKey.id,
          providerId,
          providerName: provider.name,
          keyName,
          isEncrypted,
          isGlobal: true
        }
      });
    } else {
      // Create new global key
      const result = await db.runAsync(
        `INSERT INTO api_keys (provider_id, key_name, key_value, is_encrypted, is_active, is_global, user_id)
         VALUES (?, ?, ?, ?, 1, 1, NULL)`, // is_global = 1, user_id = NULL
        [providerId, keyName, storedKeyValue, isEncrypted ? 1 : 0]
      );

      // Discover models for this provider
      try {
        const modelDiscoveryService = require('../services/modelDiscoveryService');
        await modelDiscoveryService.discoverProviderModels(
          provider.name,
           isEncrypted ? encryptionHelpers.decrypt(storedKeyValue) : storedKeyValue
         );

       } catch (discoveryError) {
         console.error(`Error auto-discovering models: ${discoveryError.message}`);
        // Continue despite discovery error - we don't want to fail the API key addition
      }

       // Audit Log
       try {
        await db.runAsync(
          `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
          [req.user.id, 'create_global_api_key', JSON.stringify({ keyId: result.lastID, keyName: keyName, providerName: provider.name }), req.ip]
        );
      } catch (logError) { console.error('Failed to log create_global_api_key action:', logError); }

      if (RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE.includes(provider.name)) {
        triggerPythonServiceRestart();
      }

      return res.status(201).json({
        success: true,
        message: `Global API key for ${provider.name} created successfully`,
        data: {
          id: result.lastID,
          providerId,
          providerName: provider.name,
          keyName,
          isEncrypted,
          isActive: true,
          isGlobal: true
        }
      });
    }
  } catch (error) {
    console.error('Error setting global API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error saving global API key'
    });
  }
};

/**
 * Delete a user's own API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.deleteUserApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Check permissions
    if ((apiKey.user_id !== req.user.id) || (apiKey.is_global && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'API key not found or you do not have permission to delete it'
      });
    }

    const logDetails = { keyId: apiKey.id, keyName: apiKey.key_name, providerId: apiKey.provider_id };
    await db.runAsync('DELETE FROM api_keys WHERE id = ?', [id]);

    // Audit Log
    try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'delete_user_api_key', JSON.stringify(logDetails), req.ip]
      );
    } catch (logError) { console.error('Failed to log delete_user_api_key action:', logError); }

    return res.status(200).json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting API key'
    });
  }
};

/**
 * Delete any API key (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.deleteApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const logDetails = { keyId: apiKey.id, keyName: apiKey.key_name, providerId: apiKey.provider_id, originalUserId: apiKey.user_id, isGlobal: apiKey.is_global };
    const providerForDeletedKey = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [apiKey.provider_id]); // Get provider name before deleting key

    await db.runAsync('DELETE FROM api_keys WHERE id = ?', [id]);

     // Audit Log
     try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'delete_api_key_admin', JSON.stringify(logDetails), req.ip]
      );
    } catch (logError) { console.error('Failed to log delete_api_key_admin action:', logError); }

    if (apiKey.is_global && providerForDeletedKey && RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE.includes(providerForDeletedKey.name)) {
      triggerPythonServiceRestart();
    }

    return res.status(200).json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting API key'
    });
  }
};

/**
 * Test an API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.testApiKey = async (req, res) => {
  try {
    const { providerId, keyValue } = req.body;

    if (!providerId || !keyValue) {
      return res.status(400).json({
        success: false,
        message: 'Provider ID and key value are required'
      });
    }

    const provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const validationResult = await apiService.validateApiKey(provider.name, keyValue);

    return res.status(200).json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    console.error('Error testing API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error testing API key'
    });
  }
};

/**
 * Get an API key for internal use (prioritizes global keys).
 * Not exposed as an endpoint.
 * @param {number} providerId - Provider ID
 * @returns {Promise<string|null>} - API key value or null if not found
 */
exports.getApiKeyForProvider = async (providerId) => {
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      return null;
    }

    // Get active global API key
    const apiKey = await db.getAsync(
      'SELECT key_value, is_encrypted FROM api_keys WHERE provider_id = ? AND is_active = 1 AND (is_global = 1 OR user_id IS NULL)',
      [providerId]
    );

    if (!apiKey) {
      return null;
    }

    // Decrypt if necessary
    return apiKey.is_encrypted
      ? encryptionHelpers.decrypt(apiKey.key_value)
      : apiKey.key_value;
  } catch (error) {
    console.error('Error getting API key for provider:', error);
    return null;
  }
};

/**
 * Get an API key by user ID and provider name
 * This is used by chatService to retrieve a user's API key for a specific provider
 * Priority is given to global keys, with fallback to user-specific keys
 * @param {number} userId - User ID
 * @param {string} providerName - Provider name
 * @returns {Promise<{key: string}|null>} - API key object or null if not found
 */
exports.getApiKeyByProvider = async (userId, providerName) => {
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );

    if (!tableExists) {
      console.error(`api_keys table does not exist`);
      return null;
    }

    const provider = await db.getAsync('SELECT id, name FROM api_providers WHERE name = ?', [providerName]);

    if (!provider) {
      console.error(`Provider not found with name: ${providerName}`);
      return null;
    }

    // First try to get a global key
    let apiKey = await db.getAsync(`
      SELECT id, key_value, is_encrypted, key_name
      FROM api_keys
      WHERE provider_id = ?
      AND is_active = 1
      AND (is_global = 1 OR user_id IS NULL)
    `, [provider.id]);

    if (!apiKey) {
      // Try to get user's specific key
      apiKey = await db.getAsync(`
        SELECT id, key_value, is_encrypted, key_name
        FROM api_keys
        WHERE provider_id = ? AND user_id = ? AND is_active = 1
      `, [provider.id, userId]);

      if (!apiKey) {
        return null; // No active global or user-specific key found
      }
    }

    // Decrypt if necessary
    const key = apiKey.is_encrypted
      ? encryptionHelpers.decrypt(apiKey.key_value)
      : apiKey.key_value;

    return { key };
  } catch (error) {
    console.error(`Error getting API key for user ${userId} and provider ${providerName}:`, error);
    return null;
  }
};

/**
 * Activate a user's own API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.activateUserApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Check permissions
    if ((apiKey.user_id !== req.user.id) || (apiKey.is_global && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'API key not found or you do not have permission to activate it'
      });
    }

    const privacyMode = await db.getAsync(
      'SELECT value FROM system_settings WHERE key = ?',
      ['global_privacy_mode']
    );

    const isPrivacyModeEnabled = privacyMode && privacyMode.value === 'true';

    if (isPrivacyModeEnabled) {
      // Prevent activation of external keys in privacy mode by checking the flag
      const provider = await db.getAsync(
        'SELECT name, is_external FROM api_providers WHERE id = ?',
        [apiKey.provider_id]
      );

      // Check if provider exists and if it's external
      if (provider && provider.is_external === 1) {
        return res.status(403).json({
          success: false,
          message: `Cannot activate API key for external provider '${provider.name}' while Privacy Mode is enabled`
        });
      }
    }

    await db.runAsync(
      'UPDATE api_keys SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Audit Log
    try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'activate_user_api_key', JSON.stringify({ keyId: id }), req.ip]
      );
    } catch (logError) { console.error('Failed to log activate_user_api_key action:', logError); }

    return res.status(200).json({
      success: true,
      message: 'API key activated successfully'
    });
  } catch (error) {
    console.error('Error activating API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error activating API key'
    });
  }
};

/**
 * Activate any API key (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.activateApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    const privacyMode = await db.getAsync(
      'SELECT value FROM system_settings WHERE key = ?',
      ['global_privacy_mode']
    );

    const isPrivacyModeEnabled = privacyMode && privacyMode.value === 'true';

    if (isPrivacyModeEnabled) {
      // Prevent activation of external keys in privacy mode by checking the flag
      const provider = await db.getAsync(
        'SELECT name, is_external FROM api_providers WHERE id = ?',
        [apiKey.provider_id]
      );

      // Check if provider exists and if it's external
      if (provider && provider.is_external === 1) {
        return res.status(403).json({
          success: false,
          message: `Cannot activate API key for external provider '${provider.name}' while Privacy Mode is enabled`
        });
      }
    }

    await db.runAsync(
      'UPDATE api_keys SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Audit Log
    try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'activate_api_key_admin', JSON.stringify({ keyId: id }), req.ip]
      );
    } catch (logError) { console.error('Failed to log activate_api_key_admin action:', logError); }

    if (apiKey.is_global) {
      const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [apiKey.provider_id]);
      if (provider && RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE.includes(provider.name)) {
        triggerPythonServiceRestart();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'API key activated successfully'
    });
  } catch (error) {
    console.error('Error activating API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error activating API key'
    });
  }
};

/**
 * Deactivate a user's own API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.deactivateUserApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Check permissions
    if ((apiKey.user_id !== req.user.id) || (apiKey.is_global && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'API key not found or you do not have permission to deactivate it'
      });
    }

    await db.runAsync(
      'UPDATE api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Audit Log
    try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'deactivate_user_api_key', JSON.stringify({ keyId: id }), req.ip]
      );
    } catch (logError) { console.error('Failed to log deactivate_user_api_key action:', logError); }

    return res.status(200).json({
      success: true,
      message: 'API key deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deactivating API key'
    });
  }
};

/**
 * Deactivate any API key (admin only)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.deactivateApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await db.getAsync('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    await db.runAsync(
      'UPDATE api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Audit Log
    try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [req.user.id, 'deactivate_api_key_admin', JSON.stringify({ keyId: id }), req.ip]
      );
    } catch (logError) { console.error('Failed to log deactivate_api_key_admin action:', logError); }

    if (apiKey.is_global) {
      const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [apiKey.provider_id]);
      if (provider && RELEVANT_SEARCH_PROVIDERS_FOR_PYTHON_SERVICE.includes(provider.name)) {
        triggerPythonServiceRestart();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'API key deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deactivating API key'
    });
  }
};

const SCALYTICS_API_PROVIDER_NAME = 'Scalytics API';
const BCRYPT_SALT_ROUNDS = 10; // Standard salt rounds for bcrypt

/**
 * Generate a new Scalytics API key for the current user
 * @param {Object} req - Request object (expects { keyName: '...' } in body)
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.generateScalyticsApiKey = async (req, res) => {
  try {
    const { keyName } = req.body;
    const userId = req.user.id;

    if (!keyName || typeof keyName !== 'string' || keyName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Key name is required and must be a non-empty string.'
      });
    }

    const provider = await db.getAsync('SELECT id FROM api_providers WHERE name = ?', [SCALYTICS_API_PROVIDER_NAME]);
    if (!provider) {
      console.error(`Critical: Provider '${SCALYTICS_API_PROVIDER_NAME}' not found in database.`);
      return res.status(500).json({
        success: false,
        message: `API provider '${SCALYTICS_API_PROVIDER_NAME}' not configured.`
      });
    }
    const providerId = provider.id;

    // Generate a secure random key (sk-scalytics-<random_base62_chars>)
    const randomBytes = crypto.randomBytes(24);
    const base62Chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomString = '';
    for (let i = 0; i < randomBytes.length; i++) {
        randomString += base62Chars[randomBytes[i] % 62];
    }
    const rawApiKey = `sk-scalytics-${randomString.slice(0, 32)}`;

    const hashedApiKey = await bcrypt.hash(rawApiKey, BCRYPT_SALT_ROUNDS);

    // Store the HASHED key in the database (is_encrypted = 0)
    const result = await db.runAsync(
      `INSERT INTO api_keys (provider_id, key_name, key_value, is_encrypted, user_id, is_active, is_global)
       VALUES (?, ?, ?, 0, ?, 1, 0)`,
      [providerId, keyName.trim(), hashedApiKey, userId]
    );

     // Audit Log
     try {
      await db.runAsync(
        `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
        [userId, 'generate_scalytics_api_key', JSON.stringify({ keyId: result.lastID, keyName: keyName.trim() }), req.ip]
      );
    } catch (logError) { console.error('Failed to log generate_scalytics_api_key action:', logError); }

    // Return the RAW key ONCE to the user
    return res.status(201).json({
      success: true,
      message: `Scalytics API key generated successfully. Store this key securely - it will not be shown again.`,
      data: {
        id: result.lastID,
        providerId,
        providerName: SCALYTICS_API_PROVIDER_NAME,
        keyName: keyName.trim(),
        apiKey: rawApiKey,
        isHashed: true,
        userId,
        isActive: true,
        isGlobal: false,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
     // Catch UNIQUE constraint violation specifically for Scalytics API key generation
     if (error.message && error.message.includes('UNIQUE constraint failed: api_keys.provider_id, api_keys.user_id, api_keys.is_global')) {
        console.warn(`Attempt to create duplicate Scalytics API key for user ${req.user?.id}: ${error.message}`);
        return res.status(409).json({
          success: false,
          // More accurate error message
          message: 'You can only have one Scalytics API key per user. Please delete the existing key if you want to generate a new one.'
        });
     }
    console.error('Error generating Scalytics API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating API key.'
    });
  }
};


/**
 * Get the status of globally configured API keys for relevant providers.
 * Used by frontend to determine if certain features (like Google/Bing search) are available.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getGlobalApiKeyStatus = async (req, res) => {
  try {
    const relevantProviders = ['Google Search', 'Bing Search', 'Brave Search']; // Added Brave Search

    const placeholders = relevantProviders.map(() => '?').join(',');

    const statuses = await db.allAsync(`
      SELECT
        p.name as provider_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM api_keys k
          WHERE k.provider_id = p.id AND k.is_active = 1 AND (k.is_global = 1 OR k.user_id IS NULL)
        ) THEN 1 ELSE 0 END as hasActiveGlobalKey
      FROM api_providers p
      WHERE p.name IN (${placeholders})
    `, relevantProviders);

    // Convert array to map for easier frontend consumption
    const statusMap = statuses.reduce((acc, row) => {
      acc[row.provider_name] = { hasActiveGlobalKey: !!row.hasActiveGlobalKey };
      return acc;
    }, {});

    // Ensure all relevant providers are in the map, even if not found in DB
    relevantProviders.forEach(name => {
      if (!statusMap[name]) {
        statusMap[name] = { hasActiveGlobalKey: false };
      }
    });

    return res.status(200).json({ success: true, data: statusMap });

  } catch (error) {
    console.error('Error fetching global API key status:', error);
    // Return default false status on error
    const defaultStatus = relevantProviders.reduce((acc, name) => {
      acc[name] = { hasActiveGlobalKey: false };
      return acc;
    }, {});
    return res.status(500).json({
      success: false,
      message: 'Error fetching global API key status.',
      data: defaultStatus // Provide default structure on error
    });
  }
};
