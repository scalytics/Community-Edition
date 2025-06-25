const { db } = require('../../models/db');
const Model = require('../../models/Model');
const modelDiscoveryService = require('../../services/modelDiscoveryService');

/**
 * Get all providers
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getAllProviders = async (req, res) => {
  try {
    const providers = await db.allAsync(`
      SELECT
        id,
        name,
        description,
        api_url,
        is_active,
        is_external,
        is_manual, 
        endpoints, 
        category, -- Added category column
        created_at,
        updated_at
      FROM api_providers
      ORDER BY name
    `);

    for (let i = 0; i < providers.length; i++) {
      const modelCount = await db.getAsync(`
        SELECT COUNT(*) as count
        FROM models
        WHERE external_provider_id = ?
      `, [providers[i].id]);

      providers[i].modelCount = modelCount ? modelCount.count : 0;
    }

    res.status(200).json({
      success: true,
      count: providers.length,
      data: providers
    });
  } catch (error) {
    console.error('Error getting providers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching providers'
    });
  }
};

/**
 * Update a provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
// Define non-editable provider names (case-sensitive)
const NON_EDITABLE_PROVIDER_NAMES = [
  'OpenAI',
  'Anthropic',
  'Google',
  'Cohere',
  'Mistral',
  'Scalytics API'
];

exports.updateProvider = async (req, res) => {
  try {
    const providerId = req.params.id;
    const provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
       });
     }

     // Determine editability based on is_manual flag
     const isManualProvider = provider.is_manual === 1;
     const isScalyticsMcp = provider.name === 'Scalytics MCP';
     const allowedFields = ['description', 'api_url', 'endpoints', 'api_version', 'website', 'is_active', 'is_external', 'name'];
     const updateFields = [];
     const updateValues = [];

     for (const field of allowedFields) {
       if (Object.hasOwnProperty.call(req.body, field)) {
         let newValue = req.body[field];

         // --- Apply Edit Restrictions ---
         // Prevent changing name for non-manual providers
         if (field === 'name' && !isManualProvider) {
           continue;
         }
         if (field === 'is_external' && !isManualProvider && !isScalyticsMcp) {
           continue;
         }
         if (field === 'is_active' && provider.name === 'Scalytics API') {
            continue;
         }
         // --- End Edit Restrictions ---

         // Special handling for boolean fields conversion
         if (field === 'is_active' || field === 'is_external') {
           newValue = newValue ? 1 : 0;
         } else if (field === 'endpoints' && typeof newValue === 'object' && newValue !== null) {
           // Ensure endpoints are stringified for comparison and DB storage
           newValue = JSON.stringify(newValue);
         }

         // Only add if the value is actually different from the current value in DB
         // OR if it's a boolean flag being explicitly set (even if to the same value, to ensure update)
         // Ensure the field is actually allowed to be updated based on restrictions above
         const canUpdateFieldTestName = (field === 'name' && isManualProvider);
         const canUpdateFieldTestExternal = (field === 'is_external' && (isManualProvider || isScalyticsMcp));
         const canUpdateFieldTestActive = (field === 'is_active' && provider.name !== 'Scalytics API');
         const canUpdateFieldTestOthers = !['name', 'is_external', 'is_active'].includes(field);

         const canUpdateField = canUpdateFieldTestName || canUpdateFieldTestExternal || canUpdateFieldTestActive || canUpdateFieldTestOthers;

         if (canUpdateField && (newValue !== provider[field] || ['is_active', 'is_external'].includes(field))) {
            updateFields.push(`${field} = ?`);
            updateValues.push(newValue);
         }
       }
     }

     if (updateFields.length === 0) {
       await db.runAsync('UPDATE api_providers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [providerId]);
     } else {
       updateFields.push('updated_at = CURRENT_TIMESTAMP');
       
       const query = `UPDATE api_providers SET ${updateFields.join(', ')} WHERE id = ?`;
       updateValues.push(providerId);
       
       await db.runAsync(query, updateValues);
     }

     const updatedProvider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);

    res.status(200).json({
      success: true,
      message: 'Provider updated successfully',
      data: updatedProvider
    });
  } catch (error) {
    console.error('Error updating provider:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating provider'
    });
  }
};

/**
 * Add a new provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.addProvider = async (req, res) => {
  try {
    // Added is_external to destructuring
    const { name, description, api_url, endpoints, is_active, is_external } = req.body;

    // Check if provider already exists
    const existingProvider = await db.getAsync('SELECT * FROM api_providers WHERE name = ?', [name]);
    if (existingProvider) {
      return res.status(400).json({
        success: false,
        message: 'Provider with that name already exists'
      });
    }

    const externalFlag = (typeof is_external === 'boolean') ? (is_external ? 1 : 0) : 1;
    const manualFlag = 1; 

    const result = await db.runAsync(`
      INSERT INTO api_providers (name, description, api_url, endpoints, is_active, is_external, is_manual)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      description || '',
      api_url || '',
      endpoints || '{}',
      is_active ? 1 : 0,
      externalFlag,
      manualFlag 
    ]);

    // Get new provider
    const newProvider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [result.lastID]);

    res.status(201).json({
      success: true,
      message: 'Provider added successfully',
      data: newProvider
    });
  } catch (error) {
    console.error('Error adding provider:', error);
    res.status(500).json({
      success: false,
      message: `Error adding provider: ${error.message}`
    });
  }
};

/**
 * Delete a provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.deleteProvider = async (req, res) => {
  try {
    const providerId = req.params.id;
    const provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    if (NON_EDITABLE_PROVIDER_NAMES.includes(provider.name)) {
      return res.status(403).json({
        success: false,
        message: `Cannot delete default provider '${provider.name}'. Only manually added providers can be deleted.`
      });
    }

    const modelCount = await db.getAsync('SELECT COUNT(*) as count FROM models WHERE external_provider_id = ?', [providerId]);
    if (modelCount && modelCount.count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete provider with associated models. Remove all models first.'
      });
    }

    // Delete provider
    await db.runAsync('DELETE FROM api_providers WHERE id = ?', [providerId]);

    res.status(200).json({
      success: true,
      message: 'Provider deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting provider:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting provider'
    });
  }
};

/**
 * Discover models for a provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.discoverModels = async (req, res) => {
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: 'Provider ID is required'
      });
    }

    if (providerId === 'local') {
      const { basePath, recursive = true } = req.body;

      if (!basePath) {
        return res.status(400).json({
          success: false,
          message: 'Base path is required for local model discovery'
        });
      }

      try {
        const result = await modelDiscoveryService.discoverLocalModels({
          basePath,
          recursive
        });

        return res.status(200).json({
          success: true,
          message: `Discovered ${result.added} new model(s)`,
          data: {
            newModels: result.added,
            existingModels: result.models.length - result.added,
            totalFound: result.models.length,
            models: result.models
          }
        });
      } catch (discoveryError) {
        console.error('Error discovering local models:', discoveryError);
        return res.status(500).json({
          success: false,
          message: 'Error discovering local models',
          error: discoveryError.message
        });
      }
    } else {
      try {
        const provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);

        if (!provider) {
          return res.status(404).json({
            success: false,
            message: 'Provider not found'
          });
        }

        let apiKey = null;
        if (provider.requires_api_key) {
          try {
            const tableExists = await db.getAsync(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
            );

            if (tableExists) {
              const apiKeyRecord = await db.getAsync(
                'SELECT key_value FROM api_keys WHERE provider_id = ?',
                [providerId]
              );

              if (apiKeyRecord) {
                apiKey = apiKeyRecord.key_value;
              } else {
              }
            } else {
            }
          } catch (keyError) {
            console.warn(`Error retrieving API key: ${keyError.message}, continuing without API key`);
          }
        }

        const result = await modelDiscoveryService.discoverProviderModels(provider.name, apiKey);

        return res.status(200).json({
          success: true,
          message: `Discovered ${result.added} new model(s)`,
          data: {
            newModels: result.added,
            existingModels: result.models.length - result.added,
            totalFound: result.models.length,
            models: result.models
          }
        });
      } catch (providerError) {
        console.error(`Error discovering models for provider ${providerId}:`, providerError);
        return res.status(500).json({
          success: false,
          message: `Error discovering models: ${providerError.message}`
        });
      }
    }
  } catch (error) {
    console.error('Model discovery error:', error);
    res.status(500).json({
      success: false,
      message: 'Error discovering models',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Reset all models to defaults
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.resetAllModels = async (req, res) => {
  try {

    // First, set all models to inactive
    await db.runAsync('UPDATE models SET is_active = 0 WHERE external_provider_id IS NOT NULL');

    // Then, activate the default models
    // This could be based on some criteria like being marked as default
    // or having specific names/types
    await db.runAsync(`
      UPDATE models
      SET is_active = 1
      WHERE name IN ('Default Model', 'GPT-3.5 Turbo', 'Claude Instant')
      OR (external_provider_id IS NOT NULL AND name LIKE '%default%')
    `);

    // Count the models affected
    const totalModels = await db.getAsync('SELECT COUNT(*) as count FROM models');
    const activeModels = await db.getAsync('SELECT COUNT(*) as count FROM models WHERE is_active = 1');

    res.status(200).json({
      success: true,
      message: 'Models reset to default state',
      data: {
        totalModels: totalModels.count,
        activeModels: activeModels.count
      }
    });
  } catch (error) {
    console.error('Reset models error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting models',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};
