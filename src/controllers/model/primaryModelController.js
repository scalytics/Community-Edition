/**
 * Primary Model Controller (Refactored)
 * 
 * Provides API endpoints for managing the primary model flag in the database.
 * Note: Loading/unloading of local models is handled by activating/deactivating them,
 * which interacts with the ModelWorkerPoolManager. This controller only sets the flag.
 */
const { protect } = require('../../middleware/authMiddleware');
const Model = require('../../models/Model');
const { db } = require('../../models/db'); // Import db for direct updates
const vllmService = require('../../services/vllmService');
const { handleEmbeddingModelChange } = require('../../utils/pythonServiceUtils');

// Get primary model status
exports.getPrimaryModelStatus = async (req, res) => {
  try {
    // 1. Find the primary model in the database
    const primaryDbModel = await db.getAsync(`
      SELECT id, name, model_path, is_active, external_provider_id 
      FROM models 
      WHERE is_default = 1 
      LIMIT 1
    `);

    let statusData = {
      has_primary_model: !!primaryDbModel,
      model: primaryDbModel || null,
      status: 'unknown', // Default status
      is_ready: false,
      // Add other fields with defaults
      load_time_ms: null,
      memory_usage: null,
      uptime: 0,
      queue_length: 0,
      active_requests: 0,
      gpuAssignment: null
    };

    // 2. If a primary model exists and it's local and active, get its status from the vLLM service
    if (primaryDbModel && primaryDbModel.is_active && !primaryDbModel.external_provider_id) {
      if (vllmService.activeModelId === primaryDbModel.id) {
        statusData.status = 'ready';
        statusData.is_ready = true;
      } else {
        // Model is primary and active in DB, but not the one running in vLLM
        statusData.status = 'inactive_in_service';
        statusData.is_ready = false;
      }
    } else if (primaryDbModel && primaryDbModel.external_provider_id) {
        // External models don't have a worker status in the pool
        statusData.status = 'external';
        statusData.is_ready = true; // Assume external models are always "ready"
    } else if (primaryDbModel && !primaryDbModel.is_active) {
        statusData.status = 'inactive';
    }

    return res.json({
      success: true,
      data: statusData
    });
    
  } catch (error) {
    console.error('Error getting primary model status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get primary model status',
      error: error.message
    });
  }
};

// Set model as primary (only updates the flag)
exports.setPrimaryModelById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }

    // Check if model exists
    const model = await Model.findById(id);
    if (!model) {
        return res.status(404).json({ success: false, message: 'Model not found' });
    }
    
    // Update the database: set is_primary=1 for this ID, 0 for all others
    // Use a transaction for atomicity
    await db.runAsync('BEGIN TRANSACTION');
    try {
        await db.runAsync('UPDATE models SET is_default = 0 WHERE is_default = 1');
        const result = await db.runAsync('UPDATE models SET is_default = 1 WHERE id = ?', [id]);
        await db.runAsync('COMMIT');

        if (result.changes > 0) {
            console.log(`[PrimaryCtrl] Set model ${id} as primary in DB.`);
            // Note: No direct interaction with worker pool here. Activation handles loading.
            if (model.is_embedding_model) {
              await handleEmbeddingModelChange();
            }
            return res.json({
                success: true,
                message: 'Model flag set as primary successfully. Ensure the model is also active to be loaded.'
            });
        } else {
             // Should not happen if model exists, but handle defensively
             throw new Error('Failed to update primary flag in database.');
        }
    } catch (updateError) {
        await db.runAsync('ROLLBACK');
        throw updateError; // Re-throw to be caught by outer catch
    }

  } catch (error) {
    console.error('Error setting primary model flag:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set primary model flag',
      error: error.message
    });
  }
};

// Unset primary model (only updates the flag)
exports.unsetPrimaryModel = async (req, res) => {
  try {
    // Update database to clear primary status for all models
    const result = await db.runAsync('UPDATE models SET is_default = 0 WHERE is_default = 1');
    
    console.log(`[PrimaryCtrl] Unset default flag for ${result.changes} model(s) in DB.`);
    // Note: No direct interaction with worker pool here. Deactivation handles unloading.

    return res.json({
      success: true,
      message: 'Default model flag unset successfully'
    });
  } catch (error) {
    console.error('Error unsetting default model flag:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to unset default model flag',
      error: error.message
    });
  }
};

// Create an alias for backward compatibility
exports.setPrimaryModel = exports.setPrimaryModelById;
