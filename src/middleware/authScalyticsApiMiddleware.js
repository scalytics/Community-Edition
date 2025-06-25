const { db } = require('../models/db');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const SCALYTICS_API_PROVIDER_NAME = 'Scalytics API';

/**
 * Middleware to authenticate requests using a Scalytics API Bearer token.
 * Verifies the token against hashed keys in the database.
 * Attaches user ID and user object to the request if successful.
 */
const authScalyticsApi = async (req, res, next) => {
  const clientIp = req.ip || req.socket?.remoteAddress;
  const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      // Handles "Bearer sk-key..." and "bearer sk-key..."
      token = parts[1];
    } else if (parts.length === 1 && parts[0].startsWith('sk-scalytics-')) {
      // Handles "sk-key..." as the whole header
      token = parts[0];
    }
  }

  if (token) {
    try {

      const provider = await db.getAsync('SELECT id FROM api_providers WHERE name = ?', [SCALYTICS_API_PROVIDER_NAME]);
      if (!provider) {
        console.error(`Critical: Provider '${SCALYTICS_API_PROVIDER_NAME}' not found in database during auth.`);
        return res.status(500).json({ success: false, message: 'API provider configuration error.' });
      }
      const providerId = provider.id;

      // Find active, non-global API keys for this provider
      const potentialKeys = await db.allAsync(
        'SELECT id, user_id, key_value FROM api_keys WHERE provider_id = ? AND is_active = 1 AND is_global = 0',
        [providerId]
      );

      let matchedKey = null;
      for (const key of potentialKeys) {
        const isMatch = await bcrypt.compare(token, key.key_value);
        if (isMatch) {
          matchedKey = key;
          break;
        }
      }

      if (!matchedKey) {
        console.warn(`Scalytics API auth failed: Token does not match any active key for provider ${providerId}. Token prefix: ${token.slice(0, 15)}...`);
        return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
      }

      const user = await User.findById(matchedKey.user_id);

      if (!user) {
        console.error(`Scalytics API auth error: User not found for user_id ${matchedKey.user_id} associated with api_key ${matchedKey.id}`);
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }
      
      if (user.status !== 'active') {
         console.warn(`Scalytics API auth failed: User ${user.id} is not active.`);
         return res.status(403).json({ success: false, message: 'User account is inactive.' });
      }

      req.user = user;
      req.userId = user.id;
      req.apiKeyId = matchedKey.id;

      next();
    } catch (error) {
      console.error('Scalytics API authentication error:', error);
      res.status(401).json({ success: false, message: 'Not authorized, token validation failed' });
    }
  } else {
    // NO TOKEN OR INVALID AUTH HEADER FORMAT
    // Check if it's a localhost call
    if (clientIp && localhostIPs.includes(clientIp)) {
      // Localhost AND no token
      console.log(`[AuthScalyticsApi] Token-less request from localhost (${clientIp}). Proceeding without user context.`);
      return next(); // Proceed without userId
    } else {
      // External AND no token
      return res.status(401).json({ success: false, message: 'Not authorized, no Bearer token' });
    }
  }
};

module.exports = { authScalyticsApi };
