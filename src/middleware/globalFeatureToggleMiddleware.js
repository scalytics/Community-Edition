const { db } = require('../models/db');

const SETTING_KEY = 'scalytics_api_enabled';
let isEnabled = true; 
let lastCheckTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; 

/**
 * Fetches the global setting for the Scalytics API status.
 * Caches the result to avoid frequent DB lookups.
 */
async function checkApiStatus() {
  const now = Date.now();
  if (now - lastCheckTime > CACHE_DURATION) {
    // console.log('Checking Scalytics API global status...'); // Removed log
    try {
      const setting = await db.getAsync('SELECT value FROM system_settings WHERE key = ?', [SETTING_KEY]);
      isEnabled = setting?.value === 'true';
      lastCheckTime = now;
      // console.log(`Scalytics API global status: ${isEnabled ? 'ENABLED' : 'DISABLED'}`); // Removed log
    } catch (error) {
      console.error('Failed to fetch Scalytics API status setting, defaulting to ENABLED:', error);
      isEnabled = true; // Default to enabled on error
      lastCheckTime = now;
    }
  }
  return isEnabled;
}

/**
 * Middleware to check if the Scalytics API feature is globally enabled.
 * This should run very early in the middleware chain for the relevant routes.
 */
const globalFeatureToggle = async (req, res, next) => {
  const apiIsEnabled = await checkApiStatus();

  if (!apiIsEnabled) {
    // Return 503 Service Unavailable if the feature is globally disabled
    return res.status(503).json({
      success: false,
      message: 'The Scalytics API is temporarily disabled by the administrator.'
    });
  }

  // Feature is enabled, proceed
  next();
};

module.exports = { globalFeatureToggle };
