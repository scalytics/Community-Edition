const axios = require('axios'); 
const { db } = require('../../models/db');
const { getSystemSetting, updateSystemSetting } = require('../../config/systemConfig');
const Model = require('../../models/Model');
const privacyModeManagerService = require('../../services/privacyModeManagerService');
const { handleEmbeddingModelChange } = require('../../utils/pythonServiceUtils');

/**
 * Get the current air-gapped mode setting
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAirGappedMode = async (req, res) => {
  try {
    const isAirGapped = getSystemSetting('air_gapped_mode', 'false') === 'true';
    res.status(200).json({ success: true, data: { airGapped: isAirGapped } });
  } catch (error) {
    console.error('Error getting air-gapped mode setting:', error);
    res.status(500).json({ success: false, message: 'Failed to get air-gapped mode setting' });
  }
};

/**
 * Update the air-gapped mode setting
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateAirGappedMode = async (req, res) => {
  try {
    const { airGapped } = req.body; 

    if (typeof airGapped !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid value for airGapped. Must be true or false.' });
    }

    const valueToSetForAirGapped = airGapped ? 'true' : 'false';
    let newGlobalPrivacyState = getSystemSetting('global_privacy_mode', 'false') === 'true';

    // --- Dependency Logic Start ---
    // If enabling air-gapped mode, also enable global privacy mode
    if (airGapped) {
      const currentPrivacyMode = getSystemSetting('global_privacy_mode', 'false') === 'true';
      if (!currentPrivacyMode) {
        try {
          await updateSystemSetting('global_privacy_mode', 'true');
          newGlobalPrivacyState = true; // Update our tracked state
        } catch (directUpdateError) {
          console.error('[AdminSettingsController] Failed to automatically update global_privacy_mode directly:', directUpdateError);
        }
      } else {
        newGlobalPrivacyState = true; // Already true
      }
    }
    // Note: If airGapped is being disabled, its rules apply.
    // --- Dependency Logic End ---

    // Update the air-gapped setting itself
    await updateSystemSetting('air_gapped_mode', valueToSetForAirGapped);

    // Apply provider and key rules using the new service
    // Pass the determined state of global_privacy_mode and the new state of air_gapped_mode
    // If airGapped is true, global_privacy_mode will also be true (either was already, or set above).
    // If airGapped is false, global_privacy_mode could be true or false depending on its independent setting.
    // The `newGlobalPrivacyState` variable should reflect the state of global_privacy_mode *after* this controller's actions on it.
    // However, applyProviderAndKeyRules needs the *target* global privacy state if airGapped is true.
    // If airGapped is true, global privacy is effectively true for rule application.
    // If airGapped is false, global privacy is whatever its current setting is.
    const effectiveGlobalPrivacyStateForRules = airGapped ? true : (getSystemSetting('global_privacy_mode', 'false') === 'true');
    await privacyModeManagerService.applyProviderAndKeyRules(effectiveGlobalPrivacyStateForRules, airGapped);

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_air_gapped_mode', `Set air-gapped mode to ${valueToSetForAirGapped}`, req.ip]
    );

    res.status(200).json({ success: true, message: `Air-gapped mode updated to ${valueToSetForAirGapped}.` });
  } catch (error) {
    console.error('Error updating air-gapped mode setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update air-gapped mode setting' });
  }
};

/**
 * Get the current Scalytics API settings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getScalyticsApiSettings = async (req, res) => {
  try {
    const settings = {
      scalytics_api_enabled: getSystemSetting('scalytics_api_enabled', 'false'), // Default to 'false'
      scalytics_api_rate_limit_window_ms: getSystemSetting('scalytics_api_rate_limit_window_ms', '900000'), // Default 15 mins
      scalytics_api_rate_limit_max: getSystemSetting('scalytics_api_rate_limit_max', '100'), // Default 100
    };
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Error getting Scalytics API settings:', error);
    res.status(500).json({ success: false, message: 'Failed to get Scalytics API settings' });
  }
};

/**
 * Update the Scalytics API settings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateScalyticsApiSettings = async (req, res) => {
  try {
    const updates = [];
    const updatedFields = {};

    if (req.body.hasOwnProperty('scalytics_api_enabled')) {
      const enabledValue = req.body.scalytics_api_enabled;
      if (typeof enabledValue !== 'string' || !['true', 'false'].includes(enabledValue)) {
        return res.status(400).json({ success: false, message: 'Invalid value for scalytics_api_enabled. Must be "true" or "false".' });
      }
      updates.push(updateSystemSetting('scalytics_api_enabled', enabledValue));
      updatedFields.scalytics_api_enabled = enabledValue;
    }

    if (req.body.hasOwnProperty('scalytics_api_rate_limit_window_ms')) {
      const windowMsValue = req.body.scalytics_api_rate_limit_window_ms;
      const windowMs = parseInt(windowMsValue, 10);
      if (isNaN(windowMs) || windowMs <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid value for rate limit window. Must be a positive number.' });
      }
      updates.push(updateSystemSetting('scalytics_api_rate_limit_window_ms', windowMs.toString()));
      updatedFields.scalytics_api_rate_limit_window_ms = windowMs.toString();
    }

    if (req.body.hasOwnProperty('scalytics_api_rate_limit_max')) {
      const maxRequestsValue = req.body.scalytics_api_rate_limit_max;
      const maxRequests = parseInt(maxRequestsValue, 10);
      if (isNaN(maxRequests) || maxRequests < 0) {
        return res.status(400).json({ success: false, message: 'Invalid value for max requests. Must be a non-negative number.' });
      }
      updates.push(updateSystemSetting('scalytics_api_rate_limit_max', maxRequests.toString()));
      updatedFields.scalytics_api_rate_limit_max = maxRequests.toString();
    }

    if (updates.length === 0) {
      return res.status(200).json({ success: true, message: 'No Scalytics API settings were updated.' });
    }

    await Promise.all(updates);

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_scalytics_api_settings', JSON.stringify(req.body), req.ip]
    );

    res.status(200).json({ success: true, message: 'Scalytics API settings updated successfully.' });
  } catch (error) {
    console.error('Error updating Scalytics API settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update Scalytics API settings' });
  }
};

/**
 * Get the preferred local embedding model setting.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getPreferredEmbeddingModel = async (req, res) => {
  try {
    const modelId = getSystemSetting('preferred_local_embedding_model_id', null);
    // Add cache-control headers to prevent caching of this setting
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Fetch the actual model details if an ID is set
    let modelName = null;
    let modelDetails = null;
    if (modelId) {
      const model = await Model.findById(modelId);
      if (model) {
        modelName = model.name;
        modelDetails = {
          id: model.id,
          name: model.name,
          is_embedding_model: model.is_embedding_model,
        };
      } else {
        console.warn(`[Admin Settings] Preferred embedding model ID ${modelId} set, but model not found in DB.`);
      }
    }

    res.status(200).json({ success: true, data: { preferredEmbeddingModel: modelDetails } }); 

  } catch (error) {
    console.error('[Admin Settings] Error getting preferred embedding model:', error);
    res.status(500).json({ success: false, message: 'Failed to get preferred embedding model setting.' });
  }
};

/**
 * Update the preferred local embedding model setting.
 * Requires admin privileges.
 * @param {Object} req - Request object (body.modelId)
 * @param {Object} res - Response object
 */
exports.updatePreferredEmbeddingModel = async (req, res) => {
  const { preferred_local_embedding_model_id: modelId } = req.body;
  const currentPreferredId = getSystemSetting('preferred_local_embedding_model_id', null);

  // --- Unsetting/Deactivating ---
  if (modelId === null || modelId === undefined || modelId === '') {
    try {
      // 1. Update the setting
      await updateSystemSetting('preferred_local_embedding_model_id', null);
      await handleEmbeddingModelChange();

      // 2. Deactivate the previously preferred model in the DB (if one was set)
      if (currentPreferredId) {
        await db.runAsync(
          'UPDATE models SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_embedding_model = 1',
          [currentPreferredId]
        );
        
      }
      

      // 4. Respond
      return res.status(200).json({
        success: true,
        message: 'Preferred embedding model unset and deactivated. The Python service handling embeddings may need a restart for changes to take full effect.'
      });

    } catch (error) {
      console.error('[Admin Settings] Error unsetting preferred embedding model:', error);
      return res.status(500).json({ success: false, message: 'Failed to unset preferred embedding model.' });
    }
  }

  // Validate modelId is a number if not null/empty
  const numericModelId = Number(modelId);
  if (isNaN(numericModelId)) {
    return res.status(400).json({ success: false, message: 'Invalid model ID provided. Must be a number.' });
  }

  try {
    // Validate the selected model exists, is local, and is an embedding model
    const model = await Model.findById(numericModelId);
    if (!model) {
      return res.status(404).json({ success: false, message: `Model with ID ${numericModelId} not found.` });
    }
    if (model.external_provider_id) {
      return res.status(400).json({ success: false, message: `Model ${numericModelId} (${model.name}) is external, cannot be set as local preferred embedding model.` });
    }
    if (!model.is_embedding_model) {
      return res.status(400).json({ success: false, message: `Model ${numericModelId} (${model.name}) is not marked as an embedding model.` });
    }

    // 1. Update the setting
    await updateSystemSetting('preferred_local_embedding_model_id', numericModelId);
    await handleEmbeddingModelChange();

    // 2. Deactivate the previously preferred model (if different) and activate the new one
    await db.runAsync('BEGIN TRANSACTION');
    try {
      // Deactivate any other active embedding model
      await db.runAsync(
        'UPDATE models SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_embedding_model = 1 AND id != ? AND is_active = 1',
        [numericModelId]
      );
      // Activate the selected model
      await db.runAsync(
        'UPDATE models SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_embedding_model = 1',
        [numericModelId]
      );
      await db.runAsync('COMMIT');
      
    } catch (dbError) {
      await db.runAsync('ROLLBACK');
      console.error('[Admin Settings] Database transaction failed during model activation update:', dbError);
      throw dbError; 
    }    

    // 4. Respond
    res.status(200).json({
      success: true,
      message: `Preferred embedding model set to ${model.name}. The Python service handling embeddings may need a restart for changes to take full effect.`
    });

  } catch (error) {
    console.error(`[Admin Settings] Error setting preferred embedding model to ${numericModelId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to set preferred embedding model.' });
  }
};

/**
 * Get the active filter languages setting.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getActiveFilterLanguages = async (req, res) => {
  try {
    const langSetting = getSystemSetting('active_filter_languages', '["en"]');
    let languages = ['en'];
    try {
      languages = JSON.parse(langSetting);
      if (!Array.isArray(languages)) languages = ['en'];
    } catch (e) {
      console.error("Error parsing active_filter_languages setting:", e);
      languages = ['en'];
    }
    res.status(200).json({ success: true, data: languages });
  } catch (error) {
    console.error('Error getting active filter languages setting:', error);
    res.status(500).json({ success: false, message: 'Failed to get active filter languages setting.' });
  }
};

/**
 * Update the active filter languages setting.
 * Requires admin privileges.
 * @param {Object} req - Request object (body.languages: string[])
 * @param {Object} res - Response object
 */
exports.updateActiveFilterLanguages = async (req, res) => {
  const { languages } = req.body;

  if (!Array.isArray(languages) || !languages.every(lang => typeof lang === 'string')) {
    return res.status(400).json({ success: false, message: 'Invalid input: languages must be an array of strings.' });
  }

  const knownLanguages = ['en', 'de', 'fr', 'es'];
  const validLanguages = languages.filter(lang => knownLanguages.includes(lang));
  if (validLanguages.length === 0) {
    console.warn("[AdminSettings] Attempted to set empty active filter languages. Proceeding, but NER filtering will be disabled.");
  }

  try {
    const valueToSet = JSON.stringify(validLanguages);
    await updateSystemSetting('active_filter_languages', valueToSet);

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_active_filter_languages', `Set active languages to ${valueToSet}`, req.ip]
    );

    // IMPORTANT: Notify admin that a restart might be needed for the worker to load/unload models
    res.status(200).json({
      success: true,
      message: `Active filter languages updated. Restart filtering worker or server for changes to fully take effect.`
    });

  } catch (error) {
    console.error('Error updating active filter languages setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update active filter languages setting.' });
  }
};

/**
 * Get chat archival setting for model refinement.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getChatArchivalSetting = async (req, res) => {
  try {
    const archiveEnabled = getSystemSetting('archive_deleted_chats_for_refinement', '0') === 'true';
    res.status(200).json({ success: true, data: { archive_deleted_chats_for_refinement: archiveEnabled } });
  } catch (error) {
    console.error('Error getting chat archival setting:', error);
    res.status(500).json({ success: false, message: 'Failed to get chat archival setting.' });
  }
};

/**
 * Update chat archival setting and optionally delete archived chats.
 * @param {Object} req - Request object (body.enabled: boolean, body.deleteArchivedChats?: boolean)
 * @param {Object} res - Response object
 */
exports.updateChatArchivalSetting = async (req, res) => {
  const { enabled, deleteArchivedChats } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid value for enabled. Must be true or false.' });
  }

  const valueToSet = enabled ? 'true' : '0'; // systemConfig stores as string

  try {
    await updateSystemSetting('archive_deleted_chats_for_refinement', valueToSet);
    let message = `Chat archival for model refinement ${enabled ? 'enabled' : 'disabled'}.`;

    if (!enabled && deleteArchivedChats) {
      console.log('[AdminSettingsController] Attempting to delete all archived chats and associated vector documents.');
      try {
        const archivedChats = await db.allAsync('SELECT id FROM chats WHERE is_archived = 1');
        
        if (archivedChats.length > 0) {
          const pythonServiceBaseUrl = getSystemSetting('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');
          const deleteVectorDocsUrl = `${pythonServiceBaseUrl}/vector/delete_by_group`;

          for (const chat of archivedChats) {
            try {
              if (pythonServiceBaseUrl && pythonServiceBaseUrl.startsWith('http')) {
                await axios.post(deleteVectorDocsUrl, { group_id: chat.id.toString() });
                console.log(`[AdminSettingsController] Successfully requested deletion of vector documents for archived chat group ${chat.id}.`);
              } else {
                console.warn(`[AdminSettingsController] Python service URL not configured. Skipping vector deletion for chat ${chat.id}.`);
              }
            } catch (vectorError) {
              console.error(`[AdminSettingsController] Error deleting vector documents for archived chat ${chat.id}:`, vectorError.response ? vectorError.response.data : vectorError.message);
              // Continue deletion of other chats even if one fails
            }
          }
          
          const result = await db.runAsync('DELETE FROM chats WHERE is_archived = 1');
          console.log(`[AdminSettingsController] Deleted ${result.changes} archived chats from the database.`);
          message += ` All ${result.changes} archived chats and associated data have been deleted.`;
        } else {
          console.log('[AdminSettingsController] No archived chats found to delete.');
          message += ' No archived chats were found to delete.';
        }
      } catch (deleteError) {
        console.error('[AdminSettingsController] Error during deletion of archived chats:', deleteError);
        // The setting was updated, but deletion failed. Inform admin.
        return res.status(500).json({ success: false, message: `Setting updated, but failed to delete archived chats: ${deleteError.message}` });
      }
    }

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_chat_archival_setting', `Set to ${valueToSet}, Delete Archived: ${!!deleteArchivedChats}`, req.ip]
    );

    res.status(200).json({ success: true, message });

  } catch (error) {
    console.error('Error updating chat archival setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update chat archival setting.' });
  }
};
