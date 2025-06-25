const { db } = require('../models/db');
const providerManager = require('./providers');

/**
 * Discovers and adds models from a provider based on API key
 * 
 * @param {String} providerName - Name of the provider (e.g., 'Anthropic', 'OpenAI')
 * @param {String} apiKey - The API key for the provider
 * @returns {Promise<Object>} - Object containing number of models added and model details
 */
async function discoverProviderModels(providerName, apiKey) {
  let addedModels = 0;
  let discoveredModels = [];

  try {
    const providerInfo = await db.getAsync('SELECT id, name, api_url, endpoints FROM api_providers WHERE name = ?', [providerName]);
    if (!providerInfo) {
      console.warn(`[discoverProviderModels] Provider DB record not found for name: ${providerName}`);
      return { added: 0, models: [], error: `Provider '${providerName}' not found in database.` };
    }
    const providerId = providerInfo.id;

    if (!apiKey && providerName !== 'Local') {
      try {
        const apiKeyService = require('./apiKeyService'); 
        const keyData = await apiKeyService.getBestApiKey(null, providerName); 
        if (keyData && keyData.key) {
          apiKey = keyData.key;
        } else {
          console.warn(`[discoverProviderModels] No API key available (user or global) for provider ${providerName} and discovery requires it.`);
          return { added: 0, models: [], error: `API key required for ${providerName} discovery but none found.` };
        }
      } catch (keyError) {
        console.error(`[discoverProviderModels] Error fetching API key for ${providerName}: ${keyError.message}`);
        return { added: 0, models: [], error: `Error fetching API key for ${providerName}.` };
      }
    }
    
    const providerModule = providerManager.getProvider(providerName);

    if (providerModule && typeof providerModule.discoverModels === 'function') {
      console.log(`[discoverProviderModels] Using specific discovery for ${providerName}`);
      const discoveryResult = await providerModule.discoverModels({ apiKey, baseUrl: providerInfo.api_url, modelsEndpoint: providerInfo.endpoints ? JSON.parse(providerInfo.endpoints).models : null });
      if (discoveryResult && typeof discoveryResult === 'object' && 'models' in discoveryResult) {
        if (discoveryResult.error) {
          console.warn(`Provider ${providerName} specific discovery error: ${discoveryResult.error}`);
          // if there's an error, we might still have some models (e.g. xAI fallback)
          discoveredModels = discoveryResult.models || [];
          if (discoveredModels.length === 0) { 
             return { added: 0, models: [], error: discoveryResult.error };
          }
        } else {
            discoveredModels = discoveryResult.models || [];
        }
      } else {
        discoveredModels = discoveryResult || []; // legacy
      }
    } else {
      console.log(`[discoverProviderModels] Using generic OpenAI-compatible discovery for ${providerName}`);
      if (!providerInfo.api_url) {
        return { added: 0, models: [], error: `API URL not configured for provider ${providerName}.` };
      }
      let modelsPath = '/v1/models'; 
      if (providerInfo.endpoints) {
        try {
          const parsedEndpoints = JSON.parse(providerInfo.endpoints);
          if (parsedEndpoints.models) modelsPath = parsedEndpoints.models;
        } catch (e) {
          console.error(`[discoverProviderModels] Error parsing endpoints for ${providerName}, using default ${modelsPath}. Endpoints: ${providerInfo.endpoints}`);
        }
      }
      const targetUrl = `${providerInfo.api_url.replace(/\/$/, '')}${modelsPath.startsWith('/') ? '' : '/'}${modelsPath}`;
      try {
        const axios = require('axios'); 
        const response = await axios.get(targetUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (response.data && Array.isArray(response.data.data)) {
          discoveredModels = response.data.data.map(model => {
            let canGenerateImages = false;
            const modelIdLower = model.id.toLowerCase();
            if (providerName === 'xAI' && (modelIdLower.includes('image') || modelIdLower === 'grok-2-image' || modelIdLower === 'grok-2-image-1212' || modelIdLower === 'grok-3')) {
                canGenerateImages = true;
            } else if (providerName === 'OpenAI' && (modelIdLower.startsWith('dall-e') || modelIdLower === 'gpt-image-1')) {
                canGenerateImages = true;
            }
            return { 
              id: model.id,
              name: model.id, 
              description: model.description || `Discovered model from ${providerName}`,
              context_window: model.context_window || 4096,
              can_generate_images: canGenerateImages, 
              raw_capabilities_info: model 
            };
          });
        } else {
          console.warn(`[discoverProviderModels] Unexpected response format from ${targetUrl} for ${providerName}:`, response.data);
          return { added: 0, models: [], error: `Unexpected response format from ${providerName}.` };
        }
      } catch (fetchError) {
        console.error(`[discoverProviderModels] Error fetching models from ${targetUrl} for ${providerName}: ${fetchError.message}`);
        return { added: 0, models: [], error: `Failed to fetch models from ${providerName}: ${fetchError.message}` };
      }
    }

    for (const model of discoveredModels) {
      if (model.id) {
        model.can_generate_images = model.id.toLowerCase().includes('-image');
      } else {
        model.can_generate_images = false; 
      }

      const existingModel = await db.getAsync(
        'SELECT id FROM models WHERE external_provider_id = ? AND external_model_id = ?',
        [providerId, model.id]
      );

      if (!existingModel) {
        const result = await db.runAsync(
          `INSERT INTO models (name, description, model_path, context_window, 
                          is_active, external_provider_id, external_model_id, 
                          can_generate_images, raw_capabilities_info)
          VALUES (?, ?, '', ?, 0, ?, ?, ?, ?)`,
          [
            model.name, 
            model.description, 
            model.context_window, 
            providerId, 
            model.id,
            model.can_generate_images ? 1 : 0, 
            model.raw_capabilities_info ? JSON.stringify(model.raw_capabilities_info) : null
          ]
        );
        model.db_id = result.lastID;
        addedModels++;
      } else {
        await db.runAsync(
          `UPDATE models 
          SET name = ?, description = ?, context_window = ?,
              can_generate_images = ?, raw_capabilities_info = ?
          WHERE id = ?`,
          [
            model.name, 
            model.description, 
            model.context_window,
            model.can_generate_images ? 1 : 0,
            model.raw_capabilities_info ? JSON.stringify(model.raw_capabilities_info) : null,
            existingModel.id
          ]
        );
        model.db_id = existingModel.id;
      }
    }

    await deleteUnavailableModels(providerId, discoveredModels);

    return {
      added: addedModels,
      models: discoveredModels
    };
  } catch (error) {
    console.error(`Error discovering models for ${providerName}:`, error);
    throw error;
  }
}

/**
 * Discover local models
 * @param {Object} options - Discovery options
 * @returns {Promise<Object>} - Object containing number of models added and model details
 */
async function discoverLocalModels(options = {}) {
  try {
    const localProvider = providerManager.getProvider('Local');
    if (!localProvider) {
      throw new Error('Local provider not found');
    }

    const models = await localProvider.discoverModels(options);
    let addedModels = 0;

    for (const model of models) {
      const existingModel = await db.getAsync(
        'SELECT id FROM models WHERE model_path = ?',
        [model.model_path]
      );

      if (!existingModel) {
        const result = await db.runAsync(
          `INSERT INTO models (name, description, model_path, context_window, is_active) 
          VALUES (?, ?, ?, ?, 1)`, 
          [model.name, model.description, model.model_path, model.context_window]
        );
        model.db_id = result.lastID;
        addedModels++;
      } else {
        await db.runAsync(
          `UPDATE models 
          SET is_active = 1, name = ?, description = ?, context_window = ? 
          WHERE id = ?`,
          [model.name, model.description, model.context_window, existingModel.id]
        );
        model.db_id = existingModel.id;
      }
    }

    return {
      added: addedModels,
      models: models
    };
  } catch (error) {
    console.error('Error discovering local models:', error);
    throw error;
  }
}

/**
 * Delete models that weren't discovered in this run
 * @private
 */
async function deleteUnavailableModels(providerId, discoveredModels) {
  try {
    const allModels = await db.allAsync(
      'SELECT id, external_model_id FROM models WHERE external_provider_id = ?',
      [providerId]
    );
    
    const discoveredModelIds = new Set(discoveredModels.map(m => m.id));
    const modelsToDelete = allModels.filter(model => 
      !discoveredModelIds.has(model.external_model_id)
    );
    
    if (modelsToDelete.length > 0) {
      console.log(`[ModelDiscoveryService] Deleting ${modelsToDelete.length} models for provider ID ${providerId} not found in latest discovery.`);
      for (const model of modelsToDelete) {
        await db.runAsync(
          'DELETE FROM models WHERE id = ?',
          [model.id]
        );
      }
    }
  } catch (error) {
    console.error('Error deleting unavailable models:', error);
  }
}

/**
 * Reset all models to their default state
 * This is useful for administrators to restore the system to a known good state
 */
async function resetAllModels() {
  try {
    await db.runAsync('UPDATE models SET is_active = 0');
    
    const providers = Object.values(providerManager.getAllProviders());
    let totalEnabled = 0;
    
    for (const provider of providers) {
      try {
        const defaultModels = provider.getDefaultModels ? provider.getDefaultModels() : []; 
        
        if (defaultModels.length === 0) {
          continue;
        }
        
        const providerInfo = await db.getAsync('SELECT id FROM api_providers WHERE name = ?', [provider.name]);
        
        if (!providerInfo) {
          continue;
        }
        
        for (const defaultModel of defaultModels) {
          let modelRecord = null;
          
          if (defaultModel.id) {
            modelRecord = await db.getAsync(
              'SELECT id FROM models WHERE external_provider_id = ? AND external_model_id = ?',
              [providerInfo.id, defaultModel.id]
            );
          }
          
          if (!modelRecord && defaultModel.name) {
            modelRecord = await db.getAsync(
              'SELECT id FROM models WHERE name = ? AND (external_provider_id = ? OR external_provider_id IS NULL)',
              [defaultModel.name, providerInfo.id]
            );
          }
          
          if (modelRecord) {
            await db.runAsync(
              'UPDATE models SET is_active = 1 WHERE id = ?',
              [modelRecord.id]
            );
            totalEnabled++;
          }
        }
      } catch (err) {
        console.error(`Error processing default models for ${provider.name}:`, err);
      }
    }
    
    return {
      success: true,
      enabled: totalEnabled,
      message: `Reset complete. ${totalEnabled} default models enabled.`
    };
  } catch (error) {
    console.error('Error resetting models:', error);
    throw error;
  }
}

module.exports = {
  discoverProviderModels,
  discoverLocalModels,
  resetAllModels
};
