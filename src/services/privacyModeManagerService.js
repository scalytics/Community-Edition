const { db } = require('../models/db');
const apiKeyService = require('./apiKeyService'); 
const { getSystemSetting } = require('../config/systemConfig');

/**
 * Applies provider and API key activation/deactivation rules based on privacy and air-gap modes.
 * @param {boolean} isGlobalPrivacyEnabled - The target state for global_privacy_mode.
 * @param {boolean} isAirGappedModeActive - The current state of air_gapped_mode.
 */
async function applyProviderAndKeyRules(isGlobalPrivacyEnabled, isAirGappedModeActive) {
  try {
    if (isGlobalPrivacyEnabled) {
      if (isAirGappedModeActive) {
        // AIR-GAP MODE: Disable ext_llm, hf, AND search
        const categoriesToDeactivate = ['ext_llm', 'hf', 'search'];
        await apiKeyService.deactivateKeysByCategories(categoriesToDeactivate);
        
        const placeholders = categoriesToDeactivate.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE api_providers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE category IN (${placeholders})`,
          categoriesToDeactivate
        );
        await db.runAsync(
          `UPDATE models SET is_active = 0 WHERE external_provider_id IN (SELECT id FROM api_providers WHERE category IN (${placeholders}))`,
          categoriesToDeactivate
        );
      } else {
        // STANDARD PRIVACY MODE: Disable ext_llm. Keep search AND hf active.
        const categoriesToDeactivate = ['ext_llm']; 
        await apiKeyService.deactivateKeysByCategories(categoriesToDeactivate);

        if (categoriesToDeactivate.length > 0) {
          const placeholdersDeact = categoriesToDeactivate.map(() => '?').join(',');
          await db.runAsync(
            `UPDATE api_providers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE category IN (${placeholdersDeact})`,
            categoriesToDeactivate
          );
          await db.runAsync(
          `UPDATE models SET is_active = 0 WHERE external_provider_id IN (SELECT id FROM api_providers WHERE category IN (${placeholdersDeact}))`,
          categoriesToDeactivate
        );
        }
        
        // Ensure search AND hf providers and their keys/models are active
        const categoriesToEnsureActive = ['search', 'hf'];
        const placeholdersActive = categoriesToEnsureActive.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE api_providers SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE category IN (${placeholdersActive})`,
          categoriesToEnsureActive
        );
        await db.runAsync(
          `UPDATE models SET is_active = 1 WHERE external_provider_id IN (SELECT id FROM api_providers WHERE category IN (${placeholdersActive}))`,
          categoriesToEnsureActive
        );
        await apiKeyService.activateGlobalKeysByCategories(categoriesToEnsureActive);
      }
    } else {
      const categoriesToReactivate = ['ext_llm', 'hf', 'search']; 
      await apiKeyService.activateGlobalKeysByCategories(categoriesToReactivate);
      
      const placeholdersReact = categoriesToReactivate.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE api_providers SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE category IN (${placeholdersReact})`,
        categoriesToReactivate
      );
      await db.runAsync(
          `UPDATE models SET is_active = 1 WHERE external_provider_id IN (SELECT id FROM api_providers WHERE category IN (${placeholdersReact}))`,
          categoriesToReactivate
        );
    }
  } catch (error) {
    console.error('[PrivacyModeManagerService] Error applying provider and key rules:', error);
  }
}

module.exports = {
  applyProviderAndKeyRules,
};
