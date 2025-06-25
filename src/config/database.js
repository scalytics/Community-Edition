/**
 * Database initialization and utilities
 */
const path = require('path');
const fs = require('fs');

/**
 * Initialize database and migrations
 * @returns {Promise<void>} Resolves when database is ready
 */
async function initializeServer() {
  const { initializeDatabase, db } = require('../models/db');

  await initializeDatabase();

  try {
    const { initializeProviderConfigs } = require('../utils/providerConfig');
    await initializeProviderConfigs();
  } catch (providerConfigError) {
     console.error('Error initializing provider configs:', providerConfigError);
     console.warn('Warning: Provider config initialization failed:', providerConfigError.message);
  }

      let embeddingModelInfo = null;

      let preferredEmbeddingModelId = null;
      try {
        const settingRow = await db.getAsync("SELECT value FROM system_settings WHERE key = 'preferred_local_embedding_model_id'");
        if (settingRow && settingRow.value) {
          preferredEmbeddingModelId = settingRow.value;
          console.log(`[NodeDBConfig] Found preferred_local_embedding_model_id: ${preferredEmbeddingModelId}`);
        }
      } catch (e) {
        console.warn(`[NodeDBConfig] Could not query system_settings for preferred_local_embedding_model_id: ${e.message}`);
      }

      if (preferredEmbeddingModelId) {
        embeddingModelInfo = await db.getAsync(`
            SELECT id, name, config, huggingface_repo, model_path FROM models
            WHERE id = ? AND is_embedding_model = 1 AND is_active = 1
            LIMIT 1
        `, [preferredEmbeddingModelId]);
        if (embeddingModelInfo) {
            console.log(`[NodeDBConfig] Loaded preferred active embedding model (ID: ${preferredEmbeddingModelId}): ${embeddingModelInfo.name}`);
        } else {
            console.warn(`[NodeDBConfig] Preferred embedding model ID ${preferredEmbeddingModelId} not found, not active, or not an embedding model. Checking fallback.`);
        }
      }

      if (!embeddingModelInfo) { 
        embeddingModelInfo = await db.getAsync(`
            SELECT id, name, config, huggingface_repo, model_path FROM models
            WHERE is_embedding_model = 1 AND is_active = 1
            ORDER BY is_default DESC, id DESC
            LIMIT 1
        `);
        if (embeddingModelInfo) {
            console.log(`[NodeDBConfig] Loaded fallback active embedding model (ID: ${embeddingModelInfo.id}): ${embeddingModelInfo.name}`);
        }
      }
      
      let embeddingDim = null;
      if (embeddingModelInfo && (embeddingModelInfo.config || embeddingModelInfo.huggingface_repo || embeddingModelInfo.model_path)) {
          if (embeddingModelInfo.config) {
              try {
                  const modelConfig = JSON.parse(embeddingModelInfo.config);
                  if (modelConfig && typeof modelConfig.dimension === 'number' && modelConfig.dimension > 0) {
                      embeddingDim = modelConfig.dimension;
                      console.log(`[NodeDBConfig] Embedding dimension ${embeddingDim} found in config for model ${embeddingModelInfo.name}.`);
                  } else {
                      console.warn(`[NodeDBConfig] Active embedding model ${embeddingModelInfo.name} found, but its 'config' JSON lacks a valid 'dimension'.`);
                  }
              } catch (parseError) {
                  console.warn(`[NodeDBConfig] Failed to parse 'config' JSON for active embedding model ${embeddingModelInfo.name}: ${parseError}`);
              }
          }
          if (embeddingDim === null && (embeddingModelInfo.huggingface_repo || embeddingModelInfo.model_path)) {
             console.warn(`[NodeDBConfig] Model ${embeddingModelInfo.name} found (path/repo: ${embeddingModelInfo.huggingface_repo || embeddingModelInfo.model_path}), but embedding dimension could not be determined from its 'config' field. Further initialization might be needed if Node.js uses this model directly.`);
          } else if (embeddingDim === null) {
             console.warn(`[NodeDBConfig] Model ${embeddingModelInfo.name} found, but embedding dimension could not be determined (no config, no path/repo).`);
          }
      } else {
          console.warn('[VectorStoreService Init] No active embedding model found in the database (checked preferred and fallback).');
      }
  try {
      const { initializeMCPService } = require('../services/agents/MCPService');
      await initializeMCPService();
  } catch (mcpInitError) {
      console.error('Error initializing MCP Service:', mcpInitError);
      console.warn('Warning: MCP Service initialization failed. External tools will be unavailable.');
  }

  try {
    const { loadFilters } = require('../services/responseFilteringService');
    await loadFilters();
    
  } catch (filterLoadError) {
    console.error('Error during initial filter load:', filterLoadError);
    console.warn('Warning: Initial filter load failed. Filtering might not work correctly.');
  }

  try {
    const { scheduleDomainTrustUpdate } = require('../services/trustScoreSchedulerService');
    scheduleDomainTrustUpdate();
    console.log('[TrustScoreScheduler] Domain trust update scheduler initialized.');
  } catch (schedulerError) {
    console.error('Error initializing Domain Trust Score Scheduler:', schedulerError);
    console.warn('Warning: Domain Trust Score Scheduler initialization failed. Daily updates will not run.');
  }
}

module.exports = { initializeServer };

if (require.main === module) {
  initializeServer()
    .then(() => {
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    })
    .catch(error => {
      console.error('❌ Error initializing database:', error);
      process.exit(1);
    });
}
