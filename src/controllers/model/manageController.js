const path = require('path');
const fs = require('fs').promises;
const { exec, execSync } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { db } = require('../../models/db');
const Model = require('../../models/Model');
const { modelFileUtils, formatFileSize, MODELS_DIR } = require('../../utils/modelFileUtils');
const vllmService = require('../../services/vllmService');
const { getSystemSetting } = require('../../config/systemConfig');
const { handleEmbeddingModelChange } = require('../../utils/pythonServiceUtils');
const { calculateVRAMRequirement } = require('../../utils/vramCalculator');

/**
 * Get all local models (admin view)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getLocalModels = async (req, res) => {
  try {
    const allModels = await Model.getAll();
    let localModels = allModels.filter(model => !model.external_provider_id);

    localModels = await Promise.all(localModels.map(async (model) => {
      let sizeInfo = { size: null, size_formatted: 'N/A', file_exists: false };
      if (model.model_path) {
        try {
          let stats;
          try {
            stats = await fs.stat(model.model_path);
            if (stats.isDirectory()) {
              const files = await fs.readdir(model.model_path);
              const modelFileExtensions = ['.bin', '.safetensors', '.pt', '.pth'];
              const modelFiles = files.filter(file => modelFileExtensions.includes(path.extname(file).toLowerCase()));

              if (modelFiles.length > 0) {
                let largestSize = 0;
                for (const file of modelFiles) {
                  const filePath = path.join(model.model_path, file);
                  try {
                    const fileStats = await fs.stat(filePath);
                    if (fileStats.isFile() && fileStats.size > largestSize) {
                      largestSize = fileStats.size;
                    }
                  } catch (fileErr) {
                   }
                }
                if (largestSize > 0) {
                  sizeInfo.size = largestSize;
                  sizeInfo.size_formatted = formatFileSize(largestSize);
                  sizeInfo.file_exists = true;
                } else {
                   sizeInfo.error = "No valid model files found in directory";
                }
              } else {
                 sizeInfo.error = "Directory found, but no model files inside";
              }
            } else {  
              sizeInfo.size = stats.size;
              sizeInfo.size_formatted = formatFileSize(stats.size);
              sizeInfo.file_exists = true;
            }
          } catch (statErr) {
             sizeInfo.error = `Path not found or inaccessible: ${statErr.code}`;
          }
        } catch (err) {
            sizeInfo.error = `Error processing path: ${err.message}`;
        }
      }
      let effective_context_window = model.context_window;
      if (model.n_ctx !== null && model.n_ctx !== undefined && String(model.n_ctx).trim() !== '') {
          const parsedNCtx = parseInt(model.n_ctx, 10);
          if (!isNaN(parsedNCtx) && parsedNCtx > 0) {
              effective_context_window = parsedNCtx;
          }
      }

      // Calculate VRAM requirement
      const vramRequirement = calculateVRAMRequirement({
        ...model,
        ...sizeInfo
      });

      // Extract auto-detected context window from config for display in UI
      let auto_detected_context = null;
      if (model.config) {
        try {
          const config = JSON.parse(model.config);
          const fullConfig = config.full_config_on_disk || {};
          auto_detected_context = fullConfig.max_position_embeddings || 
                                fullConfig.max_sequence_length || 
                                fullConfig.max_seq_len ||
                                fullConfig.n_positions ||
                                fullConfig.seq_length ||
                                null;
        } catch (e) {
        }
      }

      return { 
        ...model, 
        ...sizeInfo, 
        effective_context_window,
        estimatedVramGb: vramRequirement,
        auto_detected_context
      };
    }));
    
    res.status(200).json({
      success: true,
      count: localModels.length,
      data: localModels
    });
  } catch (error) {
    console.error('Get local models error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching local models'
    });
  }
};

// Health check cache to reduce vLLM API calls
let healthCheckCache = {
  lastCheck: 0,
  status: null,
  data: null,
  ttl: 60000 // 1 minute cache when healthy
};

/**
 * Get the status of the vLLM service.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getWorkerPoolStatus = async (req, res) => {
  try {
    const activeModelId = vllmService.activeModelId;
    const isProcessRunning = vllmService.vllmProcess && !vllmService.vllmProcess.killed;
    
    let status = {
      activeModelId: activeModelId,
      isProcessRunning: isProcessRunning,
      status: 'idle'
    };

    if (activeModelId && isProcessRunning) {
      const now = Date.now();
      const cacheValid = healthCheckCache.lastCheck && 
                        (now - healthCheckCache.lastCheck) < healthCheckCache.ttl &&
                        healthCheckCache.status;

      // Use cached status if available and recent
      if (cacheValid) {
        status.status = healthCheckCache.status;
        if (healthCheckCache.data) {
          status.availableModels = healthCheckCache.data;
        }
        // log cache usage periodically to reduce noise
        if ((now - healthCheckCache.lastCheck) > 30000) {
          console.log(`[API PoolStatus] Using cached vLLM status: ${status.status} (${Math.round((now - healthCheckCache.lastCheck)/1000)}s ago)`);
        }
      } else {
        // health check
        try {
          const healthCheckUrl = `${vllmService.getVllmApiUrl()}/v1/models`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch(healthCheckUrl, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
              status.status = 'ready';
              status.availableModels = data.data;
              
              // Cache the successful result
              healthCheckCache = {
                lastCheck: now,
                status: 'ready',
                data: data.data,
                ttl: 60000 // 1 minute cache for healthy status
              };
              
              console.log(`[API PoolStatus] vLLM health check: ready (cached for 60s)`);
            } else {
              status.status = 'activating';
              // Don't cache 'activating' status - keep checking frequently
              healthCheckCache = { lastCheck: 0, status: null, data: null, ttl: 60000 };
            }
          } else {
            status.status = 'activating';
            healthCheckCache = { lastCheck: 0, status: null, data: null, ttl: 60000 };
          }
        } catch (error) {
          status.status = 'activating';
          healthCheckCache = { lastCheck: 0, status: null, data: null, ttl: 60000 };
          console.log(`[API PoolStatus] vLLM health check failed: ${error.message}`);
        }
      }
    } else if (activeModelId && !isProcessRunning) {
      status.status = 'failed';
      healthCheckCache = { lastCheck: 0, status: null, data: null, ttl: 60000 };
    } else {
      healthCheckCache = { lastCheck: 0, status: null, data: null, ttl: 60000 };
    }

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[API PoolStatus] Error getting vLLM status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vLLM service status.',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Delete a model and its associated files
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deleteModel = async (req, res) => {
  try {
    const modelId = req.params.id;
    
    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }
    
    const model = await Model.findById(modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        message: 'Model not found'
      });
    }
    
    if (model.is_active == 1 || model.is_active === true) {
      return res.status(400).json({
        success: false,
        message: 'Model must be deactivated before deletion. Please deactivate the model first.'
      });
    }
    
    const modelCopy = { ...model };

    // Stop the vLLM service if it's running this model
    try {
      if (vllmService.activeModelId === modelId) {
        await vllmService.deactivateCurrentModel();
      }
    } catch (stopError) {
      console.error(`Error stopping vLLM process for model ID ${modelId}:`, stopError.message);
    }

    await Model.delete(modelId);
    await db.runAsync('DELETE FROM user_model_access WHERE model_id = ?', [modelId]);
    await db.runAsync('DELETE FROM group_model_access WHERE model_id = ?', [modelId]); 

    // Delete physical files
    let fileDeleted = false;
    if (modelCopy.model_path) {
      const otherModel = await db.getAsync('SELECT id FROM models WHERE model_path = ?', [modelCopy.model_path]);
      if (!otherModel) { 
        const deleteResult = await modelFileUtils.deleteModelFiles(modelCopy);  
        fileDeleted = deleteResult.deleted;
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Model "${modelCopy.name}" deleted successfully${fileDeleted ? ' (including model files)' : ''}`,
    });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting model',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Activate a local model.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.activateModel = async (req, res) => {
  const modelId = parseInt(req.params.id, 10);

  if (isNaN(modelId)) {
    return res.status(400).json({ success: false, message: 'Invalid Model ID provided.' });
  }

  try {
    const modelToActivate = await Model.findById(modelId);
    if (!modelToActivate) {
      return res.status(404).json({ success: false, message: 'Model not found for activation.' });
    }

    if (modelToActivate.model_format !== 'torch') {
      return res.status(400).json({ success: false, message: 'Only torch-format models can be activated with the vLLM engine.' });
    }
    
    // Generate activation ID immediately for frontend tracking
    const activationId = `activation-${modelId}-${Date.now()}`;
    
    // Start activation in background - don't await to prevent frontend timeout
    vllmService.activateModel(modelId, activationId).then((result) => {
      console.log(`[API Activate] Model ${modelToActivate.name} activation completed successfully`);
      if (modelToActivate.is_embedding_model) {
        handleEmbeddingModelChange().catch(err => 
          console.error('[API Activate] Error handling embedding model change:', err)
        );
      }
    }).catch(error => {
      console.error(`[API Activate] Background activation failed for model ${modelId}:`, error);
    });

    // Return immediately with activationId for progress tracking
    res.status(200).json({
      success: true,
      message: `Activation initiated for model ID ${modelId}. vLLM server is loading in the background.`,
      data: {
        modelId: modelId,
        status: 'activating',
        activationId: activationId
      },
      activationId: activationId // Also at top level for backward compatibility
    });
  } catch (error) {
    console.error(`[API Activate] Error starting activation for model ${modelId}:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to start model activation: ${error.message}`,
    });
  }
};

/**
 * Deactivate the currently active local model.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deactivateModel = async (req, res) => {
  try {
    const activeModelId = vllmService.activeModelId;
    if (activeModelId) {
      const modelToDeactivate = await Model.findById(activeModelId);
      if (modelToDeactivate && modelToDeactivate.is_embedding_model) {
        await handleEmbeddingModelChange();
      }
    }

    await vllmService.deactivateCurrentModel();

    res.status(200).json({
      success: true,
      message: 'Current local model deactivated successfully.'
    });
  } catch (error) {
    console.error(`[API Deactivate] Error deactivating model:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate model.',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

// Other exports remain the same...
exports.getUserModelAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const user = await db.getAsync('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const models = await Model.getAll();
    
    const userModelAccess = await db.allAsync(`
      SELECT model_id, can_access 
      FROM user_model_access 
      WHERE user_id = ?
    `, [userId]);
    
    const accessMap = new Map();
    userModelAccess.forEach(access => {
      accessMap.set(access.model_id, access.can_access === 1);
    });
    
    const modelsWithAccess = models.map(model => ({
      ...model,
      can_access: accessMap.has(model.id) ? accessMap.get(model.id) : null
    }));
    
    res.status(200).json({
      success: true,
      data: {
        user,
        models: modelsWithAccess
      }
    });
  } catch (error) {
    console.error('Get user model access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user model access',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

exports.resetModels = async (req, res) => {
  try {
    
    await db.runAsync('UPDATE models SET is_active = 0');
    await db.runAsync(`
      UPDATE models 
      SET is_active = 1 
      WHERE name IN ('Default Model', 'GPT-3.5 Turbo', 'Claude Instant')
      OR (external_provider_id IS NOT NULL AND name LIKE '%default%')
    `);
    
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

exports.getAvailableModels = async (req, res) => {
  try {
    const models = await Model.getAll();
    const preferredEmbeddingModelId = getSystemSetting('preferred_local_embedding_model_id', null);
    const preferredIdNum = preferredEmbeddingModelId ? parseInt(preferredEmbeddingModelId, 10) : null;

    const enrichedModels = await Promise.all(models.map(async (model) => {
      let extraInfo = {};

      if (model.is_embedding_model && preferredIdNum !== null && model.id === preferredIdNum) {
        extraInfo.is_preferred_embedding = true;
      } else {
        extraInfo.is_preferred_embedding = false;
      }

      if (model.model_path && !model.external_provider_id) {
        try {
          let stats;
          try {
            stats = await fs.stat(model.model_path);
            
            if (stats.isDirectory()) {
              const files = await fs.readdir(model.model_path);
              
              const modelFileExtensions = ['.bin', '.safetensors', '.pt', '.pth'];
              const modelFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return modelFileExtensions.includes(ext);
              });
              
              if (modelFiles.length > 0) {
                let largestSize = 0;
                let largestFile = null;
                
                for (const file of modelFiles) {
                  const filePath = path.join(model.model_path, file);
                  try {
                    const fileStats = await fs.stat(filePath);
                    if (fileStats.size > largestSize) {
                      largestSize = fileStats.size;
                      largestFile = filePath;
                    }
                  } catch (fileErr) {
                    console.error(`Error accessing model file: ${filePath}`, fileErr);
                  }
                }
                
                if (largestFile) {
                  extraInfo.file_exists = true;
                  extraInfo.file_size = largestSize;
                  extraInfo.file_size_formatted = formatFileSize(largestSize);
                  extraInfo.actual_file_path = largestFile;
                } else {
                  extraInfo.file_exists = false;
                  extraInfo.error = "No valid model files found";
                }
              } else {
                extraInfo.file_exists = true;
                extraInfo.file_size = stats.size;
                extraInfo.file_size_formatted = formatFileSize(stats.size);
                extraInfo.warning = "Directory size only, no model files found";
              }
            } else {
              extraInfo.file_exists = true;
              extraInfo.file_size = stats.size;
              extraInfo.file_size_formatted = formatFileSize(stats.size);
            }
          } catch (statErr) {
            console.error(`Error checking model path: ${model.model_path}`, statErr);
            extraInfo.file_exists = false;
            extraInfo.error = statErr.message;
          }
        } catch (err) {
          console.error(`Error checking model files for ${model.name}:`, err.message);
          extraInfo.file_exists = false;
          extraInfo.error = err.message;
        }
      }

      let effective_context_window = model.context_window; 

      if (!model.external_provider_id && model.config && typeof model.config === 'string') {
        try {
          const parsedConfig = JSON.parse(model.config);
          if (parsedConfig.n_ctx !== null && parsedConfig.n_ctx !== undefined) {
            const parsedNCtxVal = parseInt(parsedConfig.n_ctx, 10);
            if (!isNaN(parsedNCtxVal) && parsedNCtxVal > 0) {
              effective_context_window = parsedNCtxVal;
            }
          }
        } catch (e) {
          console.error(`Error parsing config for model ${model.id} in getAvailableModels: ${model.config}`, e);
        }
      }
      // Calculate VRAM requirement
      const vramRequirement = calculateVRAMRequirement({
        ...model,
        ...extraInfo
      });

      const resultModel = {
        ...model,
        ...extraInfo,
        effective_context_window: effective_context_window,
        estimatedVramGb: vramRequirement
      };
      return resultModel;
    }));
    
    res.status(200).json({
      success: true,
      count: enrichedModels.length,
      data: enrichedModels
    });
  } catch (error) {
    console.error('Get available models error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available models',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};
