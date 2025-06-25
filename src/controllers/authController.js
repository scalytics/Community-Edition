const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../models/db');
const User = require('../models/User');
const Permission = require('../models/Permission'); // Import Permission model

// Register a new user
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email and password'
      });
    }

    // Check if user already exists
    const existingUser = await db.getAsync(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with that username or email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const result = await db.runAsync(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    // Get the user ID - either from lastID or by looking up the user
    let userId = result.lastID;
    if (userId === undefined) {
      // Removed console.log
      const insertedUser = await db.getAsync(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );
      userId = insertedUser ? insertedUser.id : null;
    }

    // Create default user settings with system theme
    if (userId) {
      await db.runAsync(
        'INSERT INTO user_settings (user_id, theme) VALUES (?, ?)',
         [userId, 'system']
       );
 
     }
 
     // Create and send token
    const token = generateToken(result.lastID);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user'
    });
  }
};

// User login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    // Check if OAuth is enabled by querying the integrations table (similar to how the frontend checks)
    let isOAuthEnabled = false;
    try {
      const Integration = require('../models/Integration');
      const authConfig = await Integration.getAuthConfig();
      isOAuthEnabled = Object.keys(authConfig).length > 0;
      
      // console.log('[authController.login] OAuth enabled?', isOAuthEnabled); // Removed debug log
    } catch (err) {
      console.error('[authController.login] Error checking OAuth status:', err);
      // Continue as if OAuth is not enabled if there's an error checking
    }

    // Find user by username or email
    const user = await db.getAsync(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // When OAuth is enabled, only allow admin users to login with username/password
    if (isOAuthEnabled && !user.is_admin) {
      // console.log('[authController.login] Blocking non-admin user password login when OAuth is enabled'); // Removed debug log
      return res.status(401).json({
        success: false,
        message: 'Password login is only available for administrators when OAuth is enabled. Please use an OAuth provider to login.'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Log user access
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, ip_address) VALUES (?, ?, ?)',
      [user.id, 'login', req.ip]
    );

    // Create and send token
    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in'
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user settings
    const settings = await db.getAsync(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [user.id]
    );

    const effectivePermissions = [];
    // console.log(`[getProfile] User ${user.id} final effective permissions:`, effectivePermissions); // Removed log

    // Check for specific permission to generate API keys
    const canGenerateApiKeys = await Permission.userHasPermission(user.id, 'api-keys:generate');

    // Combine settings from user_settings table and users table
    const combinedSettings = {
      ...(settings || {}), // Settings from user_settings table (theme, defaultModelId, privateMode)
      summarization_enabled: Boolean(user.summarization_enabled), // From users table
      summarization_model_id: user.summarization_model_id, // From users table
      summarization_temperature_preset: user.summarization_temperature_preset, // From users table
      display_summarization_notice: Boolean(user.display_summarization_notice), // Added from users table
      custom_system_prompt: user.custom_system_prompt // Added from users table
    };

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        isPowerUser: Boolean(user.is_power_user),
        avatar: user.avatar, // Include the avatar path
        settings: combinedSettings,
        permissions: effectivePermissions,
        canGenerateApiKeys: canGenerateApiKeys // Include the specific permission status
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile'
    });
  }
};

// Update user settings (profile and preferences)
exports.updateSettings = async (req, res) => {
  try {
    // Destructure all possible settings from request body
    const {
      username, email, currentPassword, password, // Profile updates
      defaultModelId, privateMode, theme, // Existing settings from user_settings table
      summarization_enabled, summarization_model_id, summarization_temperature_preset, // Summarization settings
      display_summarization_notice, // Display setting
      custom_system_prompt // New custom prompt setting
    } = req.body;

    let userProfileUpdated = false;
    let userSettingsUpdated = false; // For user_settings table
    let userDirectSettingsUpdated = false; // For settings directly on users table

    // --- Handle user profile updates (username, email, password) ---
    if (username || email || password) {
      userProfileUpdated = true;
      // Get current user
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Verify current password if changing password
      if (password) {
        if (!currentPassword) {
          return res.status(400).json({
            success: false, 
            message: 'Current password is required to set a new password'
          });
        }
        
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            message: 'Current password is incorrect'
          });
        }
        
        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Update password
        await db.runAsync(
          'UPDATE users SET password = ? WHERE id = ?',
          [hashedPassword, req.user.id]
        );
        
        // Log the action
        await db.runAsync(
          'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
          [req.user.id, 'password_change', 'User changed their password', req.ip]
        );
      }
      
      // Update profile information
      if (username || email) {
        // Build update query based on what's provided
        let query = 'UPDATE users SET ';
        const params = [];
        
        if (username) {
          query += 'username = ?, ';
          params.push(username);
        }
        
        if (email) {
          query += 'email = ?, ';
          params.push(email);
        }
        
        query += 'updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        params.push(req.user.id);
        
        await db.runAsync(query, params);
      }
    }

    // --- Handle existing user settings (theme, defaultModelId, privateMode) ---
    if (defaultModelId !== undefined || privateMode !== undefined || theme !== undefined) {
      userSettingsUpdated = true;
      // Check if settings row exists in user_settings table
      const existingSettings = await db.getAsync(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [req.user.id]
      );

      if (existingSettings) {
        // Update existing settings row
        await db.runAsync(
          'UPDATE user_settings SET default_model_id = ?, private_mode = ?, theme = ? WHERE user_id = ?',
          [defaultModelId !== undefined ? defaultModelId : existingSettings.default_model_id, // Use existing if not provided
          privateMode !== undefined ? (privateMode ? 1 : 0) : existingSettings.private_mode, // Handle boolean conversion
          theme !== undefined ? theme : existingSettings.theme, // Use existing if not provided
          req.user.id]
        );
      } else {
        // Create new settings row if it doesn't exist
        await db.runAsync(
          'INSERT INTO user_settings (user_id, default_model_id, private_mode, theme) VALUES (?, ?, ?, ?)',
          [req.user.id, defaultModelId, privateMode ? 1 : 0, theme || 'system']
        );
      }
    }

    // --- Handle settings stored directly on users table (summarization, display notice, custom prompt) ---
    if (summarization_enabled !== undefined || summarization_model_id !== undefined || summarization_temperature_preset !== undefined || display_summarization_notice !== undefined || custom_system_prompt !== undefined) {
      userDirectSettingsUpdated = true; // Flag that we are updating users table
      const updateFields = [];
      const updateParams = [];
      const allowedPresets = ['strict', 'balanced', 'detailed'];

      // Summarization Enabled
      if (summarization_enabled !== undefined) {
        updateFields.push('summarization_enabled = ?');
        updateParams.push(summarization_enabled ? 1 : 0);
      }
      // Summarization Model ID
      if (summarization_model_id !== undefined) {
        if (summarization_model_id === null || (typeof summarization_model_id === 'number' && Number.isInteger(summarization_model_id))) {
          updateFields.push('summarization_model_id = ?');
          updateParams.push(summarization_model_id);
        } else {
          return res.status(400).json({ success: false, message: 'Invalid summarization_model_id provided.' });
        }
      }
      // Summarization Temperature Preset
      if (summarization_temperature_preset !== undefined) {
        if (allowedPresets.includes(summarization_temperature_preset)) {
          updateFields.push('summarization_temperature_preset = ?');
          updateParams.push(summarization_temperature_preset);
        } else {
          return res.status(400).json({ success: false, message: `Invalid summarization_temperature_preset. Allowed values: ${allowedPresets.join(', ')}.` });
        }
      }
      // Display Summarization Notice
      if (display_summarization_notice !== undefined) {
        updateFields.push('display_summarization_notice = ?');
        updateParams.push(display_summarization_notice ? 1 : 0);
      }
      // Custom System Prompt (allow empty string or null)
      if (custom_system_prompt !== undefined) {
         updateFields.push('custom_system_prompt = ?');
         // Store empty string as NULL for consistency, otherwise store the provided string
         updateParams.push(custom_system_prompt === '' ? null : custom_system_prompt);
      }

      if (updateFields.length > 0) {
        updateParams.push(req.user.id); // Add user ID for the WHERE clause
        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        await db.runAsync(query, updateParams);
      }
    }

    // Determine response message based on what was updated
    let message = 'No settings were updated.';
    const updatedParts = [];
    if (userProfileUpdated) updatedParts.push('profile');
    if (userSettingsUpdated) updatedParts.push('preferences'); // Theme, default model, private mode from user_settings table
    if (userDirectSettingsUpdated) updatedParts.push('transparency settings'); // Summarization, display notice, custom prompt from users table

    if (updatedParts.length > 0) {
      message = `User ${updatedParts.join(' and ')} updated successfully.`;
    }

    res.status(200).json({
      success: true,
      message: message
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user settings'
    });
  }
};

// Verify registration token
exports.verifyRegistrationToken = async (req, res) => {
  try {
    const { token } = req.body;

    // console.log('[verifyRegistrationToken] Token verification request received'); // Removed debug log

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Find the user by token using User model for consistent behavior
    const user = await User.findByRegistrationToken(token);
    
    // If no user found, also check directly with the DB
    if (!user) {
      console.error('[verifyRegistrationToken] Token validation failed. Token not found or expired.'); // Keep error log
      // Removed extensive debug logging block
      return res.status(400).json({
        success: false,
        message: 'Invalid token. Please check your link or contact administrator.'
      });
    }

    // console.log(`[verifyRegistrationToken] Token validated successfully for user: ${user.username}`); // Removed debug log

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        username: user.username,
        email: user.email,
        userId: user.id
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    // Don't concatenate error messages, which can lead to strange formatting with dashes
    res.status(500).json({
      success: false,
      message: 'Error verifying registration token',
      details: error.message || 'Unknown error'
    });
  }
};

// Set password with registration token
exports.setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    
    // Removed debug logs for token type/length
    
    // Validate input
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Removed extensive debug logging block for direct query / exact match

    // Find the user by token using User model for consistent behavior
    const user = await User.findByRegistrationToken(token);
    
    if (!user) {
      console.error('[setPassword] Token validation failed. Could not find user with token.'); // Keep error log
      // Removed extensive debug logging block for pending tokens
      return res.status(400).json({
        success: false,
        message: 'Invalid token. Please check your link or contact administrator.'
      });
    }
    
    // Check if OAuth is enabled using Integration model (consistent with login method)
    let isOAuthEnabled = false;
    try {
      const Integration = require('../models/Integration');
      const authConfig = await Integration.getAuthConfig();
      isOAuthEnabled = Object.keys(authConfig).length > 0;
      
      // console.log('[setPassword] OAuth enabled?', isOAuthEnabled); // Removed debug log
                  
      // Only allow admin users to reset passwords when OAuth is enabled
      // This check is needed because OAuth users shouldn't use passwords
      if (isOAuthEnabled && !user.is_admin) {
        // console.log('[setPassword] Blocking password set for non-admin:', user.username); // Removed debug log
        return res.status(403).json({
          success: false,
          message: 'Password login is only available for administrators when OAuth is enabled. Please use an OAuth provider to login.'
        });
      }
    } catch (err) {
      console.error('[setPassword] Error checking OAuth status:', err);
      // Continue as if OAuth is not enabled if there's an error checking
    }
    
    // console.log(`[setPassword] Token validated successfully for user: ${user.username}`); // Removed debug log

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update the user
    await db.runAsync(
      `UPDATE users 
       SET password = ?, status = 'active', registration_token = NULL, token_expiry = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [user.id, 'set_password', 'Password set using registration token', req.ip]
    );

    // Generate a token for automatic login
    const authToken = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: 'Password set successfully',
      token: authToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        isPowerUser: Boolean(user.is_power_user)
      }
    });
  } catch (error) {
    console.error('Set password error:', error);
    // Don't concatenate error messages, which can lead to strange formatting with dashes
    res.status(500).json({
      success: false,
      message: 'Error setting password',
      details: error.message || 'Unknown error'
    });
  }
};

// Handle redirect after registration email link click
exports.handleRegisterRedirect = async (req, res) => {
  try {
    const { token } = req.query; // Get token from query parameters

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    // Verify the token using the existing User model method
    // Note: User model needs to be required if not already at the top
    const User = require('../models/User'); 
    const user = await User.findByRegistrationToken(token);

    if (!user) {
      console.error('[handleRegisterRedirect] Token validation failed. Token not found or expired.'); // Keep error log
      return res.status(400).json({ success: false, message: 'Invalid or expired registration token.' });
    }

    // console.log(`[handleRegisterRedirect] Token validated for user: ${user.username}. Redirecting to set password page.`); // Removed debug log

    // Construct the frontend URL, defaulting to localhost:3001 if FRONTEND_URL is not set in the current .env
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const setPasswordUrl = `${baseUrl.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;

    // Redirect the user's browser
    res.redirect(setPasswordUrl);

  } catch (error) {
    console.error('Register redirect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing registration link',
      details: error.message || 'Unknown error'
    });
  }
};

// Generate JWT
const generateToken = (userId) => {
  // Create a more compact token with shorter expiration
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'mcp_secret_key',
    { 
      expiresIn: '24h', // Reduced from 30d to 24h to keep token size smaller
      algorithm: 'HS256' // Explicitly use a compact algorithm
    }
  );
};
