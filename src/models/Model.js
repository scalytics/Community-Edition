const { db } = require('./db');

class Model {
  static columns = 'id, name, description, model_path, context_window, is_active, external_provider_id, external_model_id, huggingface_repo, model_family, prompt_format_type, tokenizer_repo_id, is_default, provider, config, default_system_prompt, size_bytes, enable_scala_prompt, preferred_cache_type, is_embedding_model, embedding_dimension, can_generate_images, raw_capabilities_info, model_format, tensor_parallel_size, created_at, updated_at';

  static async findById(id) {
    try {
      const model = await db.getAsync(`SELECT ${Model.columns} FROM models WHERE id = ?`, [id]);
      return model;
    } catch (error) {
      console.error('Error finding model by ID:', error);
      return null;
    }
  }

  static async findByName(name) {
    try {
      const model = await db.getAsync(`SELECT ${Model.columns} FROM models WHERE name = ?`, [name]);
      return model;
    } catch (error) {
      console.error('Error finding model by name:', error);
      return null;
    }
  }

  static async findByExternalModelId(externalId) {
    try {
      const model = await db.getAsync(`SELECT ${Model.columns} FROM models WHERE external_model_id = ?`, [externalId]);
      return model;
    } catch (error) {
      console.error('Error finding model by external_model_id:', error);
      return null;
    }
  }

  static async findByPath(modelPath) {
    try {
      const model = await db.getAsync(`SELECT ${Model.columns} FROM models WHERE model_path = ?`, [modelPath]);
      return model;
    } catch (error) {
      console.error('Error finding model by path:', error);
      return null;
    }
  }

  static async create(modelData) {
    try {
      const {
        name, description, model_path, context_window = 4096, is_active = 1,
        n_gpu_layers = null, n_batch = null, n_ctx = null, 
        enable_scala_prompt = 0, 
        preferred_cache_type = null, 
        model_family = null,
        prompt_format_type = null,
        huggingface_repo = null,
        tokenizer_repo_id = null,
        is_default = 0
      } = modelData;

      const columns = [
        'name', 'description', 'model_path', 'context_window', 'is_active',
        'n_gpu_layers', 'n_batch', 'n_ctx', 
        'enable_scala_prompt', 'preferred_cache_type', 'model_family',
        'prompt_format_type', 'huggingface_repo', 'tokenizer_repo_id', 'is_default'
      ];
      const values = [
        name, description, model_path, context_window, is_active,
        n_gpu_layers, n_batch, n_ctx,
        enable_scala_prompt ? 1 : 0,
        preferred_cache_type === '' ? null : preferred_cache_type,
        model_family, prompt_format_type, huggingface_repo, tokenizer_repo_id, is_default
      ];
      const placeholders = values.map(() => '?').join(', ');

      const result = await db.runAsync(
        `INSERT INTO models (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );

      return result.lastID;
    } catch (error) {
      console.error('Error creating model:', error);
      throw error;
    }
  }

  static async update(id, updateData) { 
    try {
      let query = 'UPDATE models SET ';
      const params = [];
      const updateFields = [];

      const allowedFields = [
        'name', 'description', 'model_path', 'context_window', 'is_active',
        'is_default', 'external_provider_id', 'external_model_id', 
        'model_family', 'prompt_format_type', 'enable_scala_prompt',
        'preferred_cache_type', 'can_generate_images', 
        'huggingface_repo', 'tokenizer_repo_id', 'config' 
      ];

      const currentModel = await db.getAsync(`SELECT config, external_provider_id FROM models WHERE id = ?`, [id]);
      if (!currentModel) {
          throw new Error(`Model with id ${id} not found for update.`);
      }
      const isLocalModel = !currentModel.external_provider_id;

      // Handle config JSON for local models
      if (isLocalModel && (
          Object.hasOwnProperty.call(updateData, 'n_gpu_layers') ||
          Object.hasOwnProperty.call(updateData, 'n_batch') ||
          Object.hasOwnProperty.call(updateData, 'n_ctx'))) {

        let currentConfig = {};
        try {
          if (currentModel.config) {
            currentConfig = JSON.parse(currentModel.config);
          }
        } catch (e) {
          console.error(`Error parsing current config for model ${id}:`, e);
        }

        if (Object.hasOwnProperty.call(updateData, 'n_gpu_layers')) {
          const val = updateData.n_gpu_layers;
          currentConfig.n_gpu_layers = (val === '' || val === null) ? null : parseInt(val, 10);
        }
        if (Object.hasOwnProperty.call(updateData, 'n_batch')) {
          const val = updateData.n_batch;
          currentConfig.n_batch = (val === '' || val === null) ? null : parseInt(val, 10);
        }
        if (Object.hasOwnProperty.call(updateData, 'n_ctx')) {
          const val = updateData.n_ctx;
          currentConfig.n_ctx = (val === '' || val === null) ? null : parseInt(val, 10);
        }
        
        // Remove null valued keys from config to keep it clean
        Object.keys(currentConfig).forEach(key => {
            if (currentConfig[key] === null || currentConfig[key] === undefined) {
                delete currentConfig[key];
            }
        });
        updateData.config = Object.keys(currentConfig).length > 0 ? JSON.stringify(currentConfig) : null;
      }


      for (const key of allowedFields) {
        if (Object.hasOwnProperty.call(updateData, key)) {
          if (key === 'n_gpu_layers' || key === 'n_batch' || key === 'n_ctx') {
            continue;
          }
          updateFields.push(`${key} = ?`);

          let valueToPush = updateData[key];
          if (key === 'enable_scala_prompt' || key === 'can_generate_images' || key === 'is_active' || key === 'is_default') {
            valueToPush = updateData[key] ? 1 : 0;
          } else if (key === 'preferred_cache_type') {
            valueToPush = updateData[key] === '' ? null : updateData[key];
          }
          params.push(valueToPush);
        }
      }

      if (updateFields.length === 0) {
        if (Object.hasOwnProperty.call(updateData, 'config') && Object.keys(updateData).length === 1) {
        } else if (Object.keys(updateData).filter(k => k !== 'config' && k !== 'n_gpu_layers' && k !== 'n_batch' && k !== 'n_ctx').length === 0) {
            console.warn(`[Model.update] No direct column fields provided for update ID: ${id}, or config unchanged. Updating timestamp only.`);
            query += 'updated_at = CURRENT_TIMESTAMP';
        }
      }
      
      // Rebuild query logic if updateFields is empty but config might have changed
      if (updateFields.length > 0) {
        query += updateFields.join(', ') + ', updated_at = CURRENT_TIMESTAMP';
      } else if (Object.hasOwnProperty.call(updateData, 'config')) {
        query += 'config = ?, updated_at = CURRENT_TIMESTAMP';
        params.push(updateData.config);
      } else {
        query += 'updated_at = CURRENT_TIMESTAMP';
      }


      query += ' WHERE id = ?';
      params.push(id);

      const result = await db.runAsync(query, params);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating model:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await db.runAsync('DELETE FROM models WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error;
    }
  }

  static async getAll(activeOnly = false) {
    try {
      let query = `SELECT ${Model.columns} FROM models`;

      if (activeOnly) {
        query += ' WHERE is_active = 1';
      }

      query += ' ORDER BY name ASC';

      const models = await db.allAsync(query);
      return models;
    } catch (error) {
      console.error('Error getting all models:', error);
      throw error;
    }
  }

  // --- getActiveForUser function ---
  static async getActiveForUser(userId) {
    try {
      const user = await db.getAsync('SELECT id, is_admin FROM users WHERE id = ?', [userId]);
      if (!user) {
        console.error(`User ${userId} not found`);
        return [];
      }

      const modelColumns = Model.columns.split(', ').map(col => `m.${col}`).join(', ');
      const selectWithProvider = `SELECT DISTINCT ${modelColumns}, p.name as provider_name, p.id as provider_id`;
      const selectLocalOnly = `SELECT DISTINCT ${modelColumns}, NULL as provider_name, NULL as provider_id`;

      const publicModelsQuery = `
        ${selectLocalOnly}, 'public' as access_source
        FROM models m
        WHERE m.is_active = 1 AND m.external_provider_id IS NULL
      `;

      const adminLocalModelsQuery = user.is_admin ? `
        ${selectLocalOnly}, 'admin' as access_source
        FROM models m
        WHERE m.is_active = 1 AND m.external_provider_id IS NULL
      ` : '';

      const userApiKeysQuery = `
        ${selectWithProvider}, 'user_key' as access_source
        FROM models m
        JOIN api_providers p ON m.external_provider_id = p.id
        JOIN user_api_keys k ON p.id = k.provider_id
        WHERE m.is_active = 1 AND k.user_id = ? AND k.is_valid = 1
      `;

      const systemApiKeyInfo = [];
      const systemKeyParams = [];
      const providers = [
        { env: 'OPENAI_API_KEY', name: 'OpenAI' },
        { env: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
        { env: 'COHERE_API_KEY', name: 'Cohere' },
        { env: 'MISTRAL_API_KEY', name: 'Mistral' }
      ];
      const activeProviders = providers.filter(p => process.env[p.env]);
      let systemApiKeysQuery = '';
      if (activeProviders.length > 0) {
        const conditions = activeProviders.map(p => {
          systemKeyParams.push(p.name);
          return `p.name = ?`;
        }).join(' OR ');
        systemApiKeysQuery = `
          ${selectWithProvider}, 'system_key' as access_source
          FROM models m
          JOIN api_providers p ON m.external_provider_id = p.id
          WHERE m.is_active = 1 AND (${conditions})
        `;
      }

      // Note: The order of columns must be identical in all parts of the UNION.
      let queryParts = [publicModelsQuery, userApiKeysQuery];
      if (adminLocalModelsQuery) queryParts.push(adminLocalModelsQuery);
      if (systemApiKeysQuery) queryParts.push(systemApiKeysQuery);

      let query = queryParts.join(' UNION ');
      const queryParams = [userId, ...systemKeyParams];

      const finalQuery = `SELECT * FROM (${query}) AS combined_models ORDER BY name ASC`;

      let models = [];
      try {
        models = await db.allAsync(finalQuery, queryParams);
      } catch (sqlError) {
        console.error('SQL error in getActiveForUser:', sqlError);
        console.error('Failed query:', finalQuery); 
        console.error('Query Params:', JSON.stringify(queryParams)); 
        return [];
      }

      // Deduplication 
      const priorityMap = { 'user_key': 5, 'system_key': 4, 'group': 3, 'admin': 2, 'public': 1 };
      const modelMap = new Map();
      models.forEach(model => {
        const currentPriority = priorityMap[model.access_source] || 0;
        const existingModel = modelMap.get(model.id);
        const existingPriority = existingModel ? (priorityMap[existingModel.access_source] || 0) : -1;

        if (!existingModel || currentPriority > existingPriority) {
          modelMap.set(model.id, model);
        }
      });


      const finalModels = Array.from(modelMap.values());
      const apiKeyService = require('../services/apiKeyService'); 
      const { getSystemSetting } = require('../config/systemConfig');

      const globalPrivacyModeEnabled = getSystemSetting('global_privacy_mode_enabled') === 'true';
      if (globalPrivacyModeEnabled) {
      }

      // Refined API Key and Access Check 
      const processedModels = [];
      for (const model of finalModels) {
        const isAdmin = user && user.is_admin;
        let hasExplicitGroupPermission = true;

        // 2. Set informational flags about key sources (for external models)
        model.has_global_key = false;
        model.has_user_key = false;
        model.has_system_key = false;
        let hasAnyValidKeyPath = false;

        if (model.external_provider_id) {
          model.has_global_key = await apiKeyService.getGlobalApiKey(model.provider_id) !== null;
          model.has_user_key = await apiKeyService.getUserApiKey(userId, model.provider_id) !== null;
          const sysKeyEnvVar = providers.find(p => p.name === model.provider_name)?.env;
          model.has_system_key = sysKeyEnvVar && process.env[sysKeyEnvVar] ? true : false;
          hasAnyValidKeyPath = model.has_user_key || model.has_global_key || model.has_system_key;
        }

        // 3. Determine final 'can_use' status, considering global privacy mode
        if (model.external_provider_id) {
          if (globalPrivacyModeEnabled && !isAdmin) {
              model.can_use = false; 
              model.privacy_mode_restricted = true; 
          } else {
            if (isAdmin) {
              model.can_use = hasAnyValidKeyPath;
            } else {
              model.can_use = hasExplicitGroupPermission && hasAnyValidKeyPath;
            }
          }
        } else { 
          if (isAdmin) {
            model.can_use = true; 
          } else {
            model.can_use = hasExplicitGroupPermission || model.access_source === 'public';
          }
        }
        
        if (model.can_use) {
          processedModels.push(model);
        }
      }

      const chatModels = processedModels.filter(model => !model.is_embedding_model);

      return chatModels;
    } catch (error) {
      console.error('Error getting active models for user:', error);
      return [];
    }
  }
  // --- END getActiveForUser function ---


  static async count(activeOnly = false) {
    try {
      let query = 'SELECT COUNT(*) as count FROM models';

      if (activeOnly) {
        query += ' WHERE is_active = 1';
      }

      const result = await db.getAsync(query);
      return result.count;
    } catch (error) {
      console.error('Error counting models:', error);
      throw error;
    }
  }

  static async getDefaultContext(modelId) {
    try {
      const context = await db.getAsync(
        'SELECT * FROM model_contexts WHERE model_id = ? AND is_default = 1',
        [modelId]
      );

      return context;
    } catch (error) {
      console.error('Error getting default context:', error);
      return null;
    }
  }
}

module.exports = Model;
