const { db } = require('../../models/db');
const User = require('../../models/User');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * Reset a user's password and send a new registration link
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.error('[adminUserController.resetUserPassword] User not found with ID:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate a new registration token
    const registrationToken = crypto.randomBytes(32).toString('hex');

    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Create a placeholder password (will be replaced when user sets real password)
    const salt = await bcrypt.genSalt(10);
    const placeholderPassword = await bcrypt.hash(registrationToken, salt);

    // Update the user's token, password, and status
    await db.runAsync(
      `UPDATE users
       SET registration_token = ?, token_expiry = ?, password = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [registrationToken, tokenExpiry.toISOString(), placeholderPassword, userId]
    );

    // Verify the token was stored correctly
    const updatedUser = await User.findById(userId);
    if (updatedUser.registration_token !== registrationToken) {
      console.error('[adminUserController.resetUserPassword] Token mismatch between generated and stored token');
    }

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'reset_password', `Admin reset password for ${user.email}`, req.ip]
    );

    // Create a registration link
    const serverUrl = process.env.API_URL || process.env.BASE_URL || 'http://localhost:3000';

    let registrationLink;

    // In production, we'll use a direct link to the set-password page with token
    if (process.env.NODE_ENV === 'production') {
      // Get frontend URL - Rely ONLY on environment variable
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        console.error('[adminUserController.resetUserPassword] FATAL: FRONTEND_URL environment variable is not set.');
        // Avoid sending a broken link
        registrationLink = null; // Or handle error appropriately
      } else {
        registrationLink = `${frontendUrl}/set-password?token=${registrationToken}`;
      }
    } else {
      // In development, use the redirect endpoint
      registrationLink = `${serverUrl}/api/auth/register-redirect?token=${registrationToken}`;
    }

    // Only log registration links in development, not in production
    if (process.env.NODE_ENV !== 'production') {
      // This is useful for debugging but should not be present in production logs
    }

    res.status(200).json({
      success: true,
      message: `Password has been reset for ${user.email}`,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        registrationLink: registrationLink
      }
    });
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting user password'
    });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const searchTerm = req.query.search || null; // Extract search term

    const users = await User.getAll(limit, offset, searchTerm); // Pass searchTerm to getAll
    const total = await User.count(searchTerm); // Pass searchTerm to count

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
};

// Get single user with usage stats
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

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

    // Get user statistics
    const stats = await db.getAsync(`
      SELECT
        COUNT(DISTINCT chat_id) as chat_count,
        SUM(tokens_input) as total_tokens_input,
        SUM(tokens_output) as total_tokens_output
      FROM usage_statistics
      WHERE user_id = ?
    `, [user.id]);

    // Get recent activity
    const recentActivity = await db.allAsync(`
      SELECT *
      FROM access_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [user.id]);

    // Get model usage breakdown
    const modelUsage = await db.allAsync(`
      SELECT
        m.id,
        m.name,
        COUNT(DISTINCT us.chat_id) as chat_count,
        SUM(us.tokens_input) as tokens_input,
        SUM(us.tokens_output) as tokens_output
      FROM usage_statistics us
      JOIN models m ON us.model_id = m.id
      WHERE us.user_id = ?
      GROUP BY m.id
      ORDER BY tokens_output DESC
    `, [user.id]);

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        status: user.status || 'active',
        createdAt: user.created_at,
        settings: settings || {},
        statistics: {
          chatCount: stats ? stats.chat_count : 0,
          tokensInput: stats ? stats.total_tokens_input : 0,
          tokensOutput: stats ? stats.total_tokens_output : 0
        },
        recentActivity,
        modelUsage
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details'
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { username, email, password, isAdmin } = req.body;

    // Check if user exists
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash password if it's being updated
    let hashedPassword = password;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Update user
    const updated = await User.update(req.params.id, {
      username,
      email,
      password: hashedPassword,
      isAdmin
    });

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'User not updated'
      });
    }

    const updatedUser = await User.findById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        isAdmin: Boolean(updatedUser.is_admin)
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user'
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    // Check if user exists
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if trying to delete self
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Prevent deletion of the main admin user (ID 1)
    if (user.id === 1 || user.username === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete the system administrator account'
      });
    }

    // Delete user
    const deleted = await User.delete(req.params.id);

    if (!deleted) {
      return res.status(400).json({
        success: false,
        message: 'User not deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
};

// Register user (admin creates account for a user)
exports.registerUser = async (req, res) => {
  try {
    const { username, email } = req.body;

    // Validate input
    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and email'
      });
    }

    // Check if email is already in use
    const existingEmail = await db.getAsync(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'This email address is already registered in the system'
      });
    }

    // Check if username is already in use
    const existingUsername = await db.getAsync(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'This username is already taken'
      });
    }

    // Generate a unique registration token
    const registrationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Create a placeholder password (will be replaced when user sets real password)
    const salt = await bcrypt.genSalt(10);
    const placeholderPassword = await bcrypt.hash(registrationToken, salt);

    // No debug logging in production code

    // Create user with pending status and placeholder password - ensure parameters match columns
    const result = await db.runAsync(
      `INSERT INTO users (username, email, password, status, registration_token, token_expiry)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, placeholderPassword, 'pending', registrationToken, tokenExpiry.toISOString()]
    );

    // Get the user ID
    let userId = result.lastID;
    if (userId === undefined) {
      // Fall back to looking up by username if lastID wasn't returned
      const insertedUser = await db.getAsync(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );
      userId = insertedUser ? insertedUser.id : null;
    }

    // Create default user settings
    if (userId) {
      await db.runAsync(
        'INSERT INTO user_settings (user_id) VALUES (?)',
        [userId]
      );

      // Add user to the default 'User' group
      const userGroup = await db.getAsync("SELECT id FROM groups WHERE name = 'User'");
      if (userGroup) {
        await db.runAsync(
          'INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)',
          [userId, userGroup.id]
        );
        console.log(`[Admin Register] Added user ${userId} to group 'User' (ID: ${userGroup.id})`);
      } else {
        console.warn("[Admin Register] Could not find default 'User' group to assign new user to.");
      }
    }

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'register_user', `Admin created account for ${email}`, req.ip]
    );

    // Create a registration link that uses our redirect endpoint
    // This way we don't need to worry about the frontend URL configuration
    const serverUrl = process.env.API_URL || process.env.BASE_URL || 'http://localhost:3000';

    let registrationLink;

    // In production, we'll use a direct link to the set-password page with token
    if (process.env.NODE_ENV === 'production') {
      // Get frontend URL - Rely ONLY on environment variable
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        console.error('[adminUserController.registerUser] FATAL: FRONTEND_URL environment variable is not set.');
        // Avoid sending a broken link
        registrationLink = null; // Or handle error appropriately
      } else {
        registrationLink = `${frontendUrl}/set-password?token=${registrationToken}`;
      }
    } else {
      // In development, use the redirect endpoint
      registrationLink = `${serverUrl}/api/auth/register-redirect?token=${registrationToken}`;
    }

    // Only log registration links in development, not in production
    if (process.env.NODE_ENV !== 'production') {
      // This is useful for debugging but should not be present in production logs
    }

    // Always include the registration link in the response
    res.status(201).json({
      success: true,
      message: `User registered successfully. An email with registration instructions has been sent to ${email}.`,
      data: {
        username,
        email,
        registrationLink
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user'
    });
  }
};

/**
 * Resend registration link for a pending user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.resendRegistrationLink = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify user is in pending status
    if (user.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This user has already activated their account'
      });
    }

    // Generate a new registration token
    const registrationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Update the user's token and expiry
    await db.runAsync(
      `UPDATE users
       SET registration_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [registrationToken, tokenExpiry.toISOString(), userId]
    );

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'resend_invitation', `Admin resent invitation to ${user.email}`, req.ip]
    );

    // Create a registration link that uses our redirect endpoint
    const serverUrl = process.env.API_URL || process.env.BASE_URL || 'http://localhost:3000';

    let registrationLink;

    // In production, we'll use a direct link to the set-password page with token
    if (process.env.NODE_ENV === 'production') {
      // Get frontend URL - Rely ONLY on environment variable
      const frontendUrl = process.env.FRONTEND_URL;
       if (!frontendUrl) {
        console.error('[adminUserController.resendRegistrationLink] FATAL: FRONTEND_URL environment variable is not set.');
        // Avoid sending a broken link
        registrationLink = null; // Or handle error appropriately
      } else {
        registrationLink = `${frontendUrl}/set-password?token=${registrationToken}`;
      }
    } else {
      // In development, use the redirect endpoint
      registrationLink = `${serverUrl}/api/auth/register-redirect?token=${registrationToken}`;
    }

    // Only log registration links in development, not in production
    if (process.env.NODE_ENV !== 'production') {
      // This is useful for debugging but should not be present in production logs
    }

    res.status(200).json({
      success: true,
      message: `Registration link for ${user.email} has been renewed`,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        registrationLink: registrationLink
      }
    });
  } catch (error) {
    console.error('Error resending registration link:', error);
    res.status(500).json({
      success: false,
      message: 'Error resending registration link'
    });
  }
};
