const { protect } = require('../middleware/authMiddleware');
const apiKeyController = require('./apiKeyController'); // May not be needed anymore
const apiKeyService = require('../services/apiKeyService'); // Still needed by privacyModeManagerService
const { getSystemSetting, updateSystemSetting } = require('../config/systemConfig');
const { db } = require('../models/db'); // Still needed for access logs
const Model = require('../models/Model'); // May not be needed directly anymore
const privacyModeManagerService = require('../services/privacyModeManagerService');

/**
 * Get privacy settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.getPrivacySettings = async (req, res) => {
  try {
    const isGlobalPrivacyEnabled = getSystemSetting('global_privacy_mode', 'false') === 'true';

    res.status(200).json({
      success: true,
      data: {
        globalPrivacyMode: isGlobalPrivacyEnabled
      }
    });
  } catch (error) {
    console.error('Error getting privacy settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving privacy settings'
    });
  }
};

/**
 * Get privacy status - available to all authenticated users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.getPrivacyStatus = async (req, res) => {
  try {
    const isGlobalPrivacyEnabled = getSystemSetting('global_privacy_mode', 'false') === 'true';

    res.status(200).json({
      success: true,
      data: {
        globalPrivacyMode: isGlobalPrivacyEnabled
      },
      globalPrivacyMode: isGlobalPrivacyEnabled
    });
  } catch (error) {
    console.error('Error getting privacy status:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving privacy status'
    });
  }
};

/**
 * Update global privacy mode setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.updateGlobalPrivacyMode = async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: enabled must be a boolean value'
      });
    }

    const valueToSet = enabled ? 'true' : 'false';

    await updateSystemSetting('global_privacy_mode', valueToSet);
    
    const isAirGappedModeCurrently = getSystemSetting('air_gapped_mode', 'false') === 'true';

    await privacyModeManagerService.applyProviderAndKeyRules(enabled, isAirGappedModeCurrently);

    // --- Dependency Logic Start ---
    // If disabling global privacy mode, also disable air-gapped mode
    if (!enabled) {
      const currentAirGappedMode = getSystemSetting('air_gapped_mode', 'false') === 'true';
      if (currentAirGappedMode) {
        try {
          await updateSystemSetting('air_gapped_mode', 'false');
        } catch (airGapUpdateError) {
          console.error('[PrivacyController] Failed to automatically disable air-gapped mode:', airGapUpdateError);
        }
      }
    }
    // --- Dependency Logic End ---

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_privacy_settings', `Updated global privacy mode to ${enabled ? 'enabled' : 'disabled'}`, req.ip]
    );
    
    res.status(200).json({
      success: true,
      message: `Global privacy mode ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        globalPrivacyMode: enabled
      }
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating privacy settings'
    });
  }
};

/**
 * Get chat archival setting for model refinement
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.getChatArchivalSetting = async (req, res) => {
  try {
    const archiveEnabled = getSystemSetting('archive_deleted_chats_for_refinement', '0') === 'true';
    res.status(200).json({
      success: true,
      data: {
        archive_deleted_chats_for_refinement: archiveEnabled
      }
    });
  } catch (error) {
    console.error('Error getting chat archival setting:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving chat archival setting'
    });
  }
};

/**
 * Update chat archival setting for model refinement
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.updateChatArchivalSetting = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: enabled must be a boolean value'
      });
    }
    const valueToSet = enabled ? 'true' : 'false';
    await updateSystemSetting('archive_deleted_chats_for_refinement', valueToSet);

    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'update_chat_archival_setting', `Updated chat archival to ${enabled ? 'enabled' : 'disabled'}`, req.ip]
    );

    res.status(200).json({
      success: true,
      message: `Chat archival for model refinement ${enabled ? 'enabled' : 'disabled'} successfully.`,
      data: {
        archive_deleted_chats_for_refinement: enabled
      }
    });
  } catch (error) {
    console.error('Error updating chat archival setting:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating chat archival setting'
    });
  }
};
