const jwt = require('jsonwebtoken');
const { db } = require('../models/db');
const User = require('../models/User');
const Integration = require('../models/Integration');
const authProviderService = require('../services/authProviderService');

/**
 * OAuth authentication controller
 * Handles external provider authentication and user linking
 */

// Process OAuth callback from external providers
exports.handleOAuthCallback = async (req, res) => {
  try {
    const { provider, code, state } = req.body;
    
    if (!provider || !code) {
      return res.status(400).json({
        success: false,
        message: 'Provider and authorization code are required'
      });
    }
    
    // Get provider configuration from database or environment
    const providerConfig = await authProviderService.getProviderConfig(provider);
    if (!providerConfig) {
      return res.status(400).json({
        success: false,
        message: `Provider ${provider} is not configured`
      });
    }
    
    // Exchange code for token with provider
    let tokenData;
    try {
      tokenData = await exchangeCodeForToken(code, providerConfig, provider);
    } catch (error) {
      console.error(`Error exchanging code for token with ${provider}:`, error);
      return res.status(401).json({
        success: false,
        message: `Authentication failed with ${provider}`
      });
    }
    
    // Get user profile from provider
    let userProfile;
    try {
      userProfile = await getUserProfile(tokenData.access_token, provider, providerConfig);
    } catch (error) {
      console.error(`Error getting user profile from ${provider}:`, error);
      return res.status(401).json({
        success: false,
        message: `Failed to retrieve user profile from ${provider}`
      });
    }
    
    // Find or create a user based on the provider profile
    const user = await findOrCreateUser(userProfile, provider);
    
    // Generate a token that includes the auth method
    const token = generateOAuthToken(user.id, provider);
    
    // Log the successful login
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [user.id, 'oauth_login', `Authenticated via ${provider}`, req.ip]
    );
    
    // Return the user and token
    res.status(200).json({
      success: true,
      message: `Login via ${provider} successful`,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        isPowerUser: Boolean(user.is_power_user)
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing OAuth callback'
    });
  }
};

// Get available OAuth providers
exports.getAvailableProviders = async (req, res) => {
  try {
    const providers = await authProviderService.getEnabledProviders();
    
    // Transform into client-friendly format with authorization URLs
    const clientProviders = await Promise.all(providers.map(async (provider) => {
      const config = await authProviderService.getProviderConfig(provider);
      
      // Only return necessary info for client initialization
      return {
        provider,
        name: provider.charAt(0).toUpperCase() + provider.slice(1), // Capitalize
        authUrl: buildAuthorizationUrl(provider, config)
      };
    }));
    
    res.status(200).json({
      success: true,
      data: clientProviders
    });
  } catch (error) {
    console.error('Error getting available providers:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving available authentication providers'
    });
  }
};

// Unlink a provider from a user account
exports.unlinkProvider = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    // Ensure user has a password set before unlinking (avoid lockout)
    const user = await User.findById(userId);
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unlink provider: You must set a password first to avoid being locked out'
      });
    }
    
    // Remove the provider link
    await db.runAsync(
      'DELETE FROM user_oauth_providers WHERE user_id = ? AND provider = ?',
      [userId, provider]
    );
    
    res.status(200).json({
      success: true,
      message: `Successfully unlinked ${provider} from your account`
    });
  } catch (error) {
    console.error('Error unlinking provider:', error);
    res.status(500).json({
      success: false,
      message: 'Error unlinking provider from account'
    });
  }
};

/* Helper functions */

// Exchange authorization code for access token
async function exchangeCodeForToken(code, providerConfig, provider) {
  // Implement provider-specific token exchange
  // This would typically be an API call to the provider's token endpoint
  
  // For now, simulate the response format
  return {
    access_token: 'simulated_token',
    refresh_token: 'simulated_refresh_token',
    expires_in: 3600
  };
}

// Get user profile from provider
async function getUserProfile(accessToken, provider, providerConfig) {
  // Implement provider-specific profile retrieval
  // This would typically be an API call to the provider's user info endpoint
  
  // For now, simulate the response with a unique identifier
  return {
    id: 'external_' + Math.random().toString(36).substring(2, 15),
    email: `user_${Date.now()}@example.com`,
    name: 'OAuth User'
  };
}

// Find or create a user based on an OAuth profile
async function findOrCreateUser(profile, provider) {
  // Check if user already exists with this provider and external ID
  const existingLink = await db.getAsync(
    'SELECT user_id FROM user_oauth_providers WHERE provider = ? AND provider_user_id = ?',
    [provider, profile.id]
  );
  
  if (existingLink) {
    // User exists, get their details
    return await User.findById(existingLink.user_id);
  }
  
  // No existing link, check if user exists with this email
  let user = null;
  if (profile.email) {
    user = await db.getAsync(
      'SELECT * FROM users WHERE email = ?',
      [profile.email]
    );
  }
  
  // Create new user if none exists
  if (!user) {
    // Generate a unique username based on provider and profile
    let username = (profile.name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + provider;
    
    // Check if username exists and append numbers if needed
    let usernameTaken = true;
    let counter = 1;
    let uniqueUsername = username;
    
    while (usernameTaken) {
      const existingUser = await db.getAsync(
        'SELECT id FROM users WHERE username = ?',
        [uniqueUsername]
      );
      
      if (!existingUser) {
        usernameTaken = false;
      } else {
        uniqueUsername = `${username}${counter}`;
        counter++;
      }
    }
    
    // Create the user with a NULL password (OAuth-only account)
    const result = await db.runAsync(
      'INSERT INTO users (username, email, password) VALUES (?, ?, NULL)',
      [uniqueUsername, profile.email || null]
    );
    
    let userId = result.lastID;
    if (userId === undefined) {
      const insertedUser = await db.getAsync(
        'SELECT id FROM users WHERE username = ?',
        [uniqueUsername]
      );
      userId = insertedUser ? insertedUser.id : null;
    }
    
    // Create default user settings
    await db.runAsync(
      'INSERT INTO user_settings (user_id, theme) VALUES (?, ?)',
      [userId, 'system']
    );
    
    user = await User.findById(userId);
  }
  
  // Create the OAuth provider link
  await db.runAsync(
    'INSERT INTO user_oauth_providers (user_id, provider, provider_user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [user.id, provider, profile.id]
  );
  
  return user;
}

// Build authorization URL for a provider
function buildAuthorizationUrl(provider, config) {
  // This would construct the correct authorization URL for the provider
  // For now, return a placeholder
  return `/auth/${provider}/authorize`;
}

// Generate JWT token for OAuth users (includes auth method)
function generateOAuthToken(userId, provider) {
  return jwt.sign(
    { 
      id: userId,
      auth_method: 'oauth',
      provider
    },
    process.env.JWT_SECRET || 'mcp_secret_key',
    { 
      expiresIn: '24h',
      algorithm: 'HS256'
    }
  );
}
