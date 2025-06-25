const rateLimit = require('express-rate-limit');
const { db } = require('../models/db');

// Default values in case settings are missing
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_REQUESTS = 100;

let limiterInstance = null;
let lastSettingsFetchTime = 0;
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000; // Cache settings for 5 minutes

// Function to fetch settings and create/update the limiter instance
async function getLimiter() {
  const now = Date.now();
  // Re-fetch settings if cache expired or instance doesn't exist
  if (!limiterInstance || now - lastSettingsFetchTime > SETTINGS_CACHE_DURATION) {
    console.log('Fetching or refreshing Scalytics API rate limit settings...');
    try {
      const windowMsSetting = await db.getAsync("SELECT value FROM system_settings WHERE key = 'scalytics_api_rate_limit_window_ms'");
      const maxRequestsSetting = await db.getAsync("SELECT value FROM system_settings WHERE key = 'scalytics_api_rate_limit_max'");

      const windowMs = windowMsSetting?.value ? parseInt(windowMsSetting.value, 10) : DEFAULT_WINDOW_MS;
      const maxRequests = maxRequestsSetting?.value ? parseInt(maxRequestsSetting.value, 10) : DEFAULT_MAX_REQUESTS;

      if (isNaN(windowMs) || windowMs <= 0) {
        console.warn(`Invalid rate limit window setting (${windowMsSetting?.value}), using default: ${DEFAULT_WINDOW_MS}ms`);
        windowMs = DEFAULT_WINDOW_MS;
      }
      if (isNaN(maxRequests) || maxRequests < 0) { // Allow 0 for disabling via max requests
        console.warn(`Invalid rate limit max requests setting (${maxRequestsSetting?.value}), using default: ${DEFAULT_MAX_REQUESTS}`);
        maxRequests = DEFAULT_MAX_REQUESTS;
      }

      console.log(`Applying Scalytics API rate limits: Max ${maxRequests} requests per ${windowMs / 60000} minutes.`);

      limiterInstance = rateLimit({
        windowMs: windowMs,
        max: maxRequests,
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        keyGenerator: (req, res) => {
          // Use a constant key to apply the limit globally to the endpoint
          return 'global_scalytics_api_limit'; 
        },
        message: (req, res) => {
          // Adjust message slightly as it's now a global limit
          return {
            success: false,
            message: `Too many requests from this account, please try again after ${Math.ceil(windowMs / 60000)} minutes.`
          };
        },
        // Skip successful requests to avoid unnecessary storage writes if using an external store
        // skipSuccessfulRequests: true, 
      });
      lastSettingsFetchTime = now;
    } catch (error) {
      console.error('Failed to fetch rate limit settings, using defaults:', error);
      // Create limiter with defaults if DB fetch fails
      limiterInstance = rateLimit({
        windowMs: DEFAULT_WINDOW_MS,
        max: DEFAULT_MAX_REQUESTS,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req, res) => 'global_scalytics_api_limit', // Use constant key for default too
        message: { success: false, message: `API rate limit exceeded, please try again later.` },
      });
    }
  }
  return limiterInstance;
}

// Middleware function that uses the dynamically configured limiter
const rateLimiterMiddleware = async (req, res, next) => {
  try {
    const limiter = await getLimiter();
    limiter(req, res, next); // Apply the rate limiting
  } catch (error) {
    console.error("Error applying rate limiter:", error);
    next(error); // Pass error to global error handler
  }
};

module.exports = { rateLimiterMiddleware };
