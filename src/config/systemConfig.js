/**
 * System Configuration Service
 * Loads and caches settings from the system_settings table.
 */
const { db } = require('../models/db');

let systemSettingsCache = new Map();
let isInitialized = false;

/**
 * Loads all settings from the database into the cache.
 * Should be called once during application startup.
 */
async function loadSystemSettings() {
  try {
    console.log('[SystemConfig] Loading system settings from database...');
    const rows = await db.allAsync('SELECT key, value FROM system_settings');
    const newCache = new Map();
    rows.forEach(row => {
      newCache.set(row.key, row.value);
    });
    systemSettingsCache = newCache; // Atomically update cache
    isInitialized = true;
    console.log(`[SystemConfig] Loaded ${systemSettingsCache.size} settings into cache.`);
    // Log the air-gapped mode status for clarity
    console.log(`[SystemConfig] Air-Gapped Mode Status: ${getSystemSetting('air_gapped_mode', 'false')}`);
  } catch (error) {
    console.error('[SystemConfig] Failed to load system settings from database:', error);
    // Keep potentially stale cache but log error
    isInitialized = false; // Mark as not successfully initialized
  }
}

/**
 * Gets a system setting value from the cache.
 * @param {string} key - The setting key (e.g., 'air_gapped_mode').
 * @param {any} [defaultValue=null] - The value to return if the key is not found.
 * @returns {any} The setting value or the default value.
 */
function getSystemSetting(key, defaultValue = null) {
  if (!isInitialized) {
    // This might happen if accessed before initial load completes, return default
    console.warn(`[SystemConfig] Attempted to access setting '${key}' before initialization was complete. Returning default.`);
    return defaultValue;
  }
  return systemSettingsCache.get(key) ?? defaultValue;
}

/**
 * Updates a system setting in the database and cache.
 * @param {string} key - The setting key.
 * @param {string} value - The new setting value.
 * @returns {Promise<void>}
 */
async function updateSystemSetting(key, value) {
  try {
    console.log(`[SystemConfig] Updating setting '${key}' to '${value}'...`);
    await db.runAsync(
      'INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)',
      [key, value]
    );
    // Update cache immediately
    systemSettingsCache.set(key, value);
    console.log(`[SystemConfig] Setting '${key}' updated successfully in DB and cache.`);
  } catch (error) {
    console.error(`[SystemConfig] Failed to update setting '${key}' in database:`, error);
    throw error; // Re-throw to indicate failure
  }
}

// Removed self-invoking loader. Initialization should be explicitly called from server.js.

module.exports = {
  loadSystemSettings, // Export for explicit initialization and potential manual reload
  getSystemSetting,
  updateSystemSetting,
  // Expose cache directly for debugging or specific use cases (use with caution)
  _getCache: () => systemSettingsCache
};
