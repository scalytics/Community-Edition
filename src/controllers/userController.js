const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Search for users by username or email, excluding the current user.
 * Used for features like chat sharing.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.searchUsers = async (req, res) => {
  try {
    const query = req.query.q; // Search query from query parameter 'q'
    const excludeUserId = req.user.id; // Exclude the user performing the search
    const limit = parseInt(req.query.limit) || 10; 

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query (q) is required.' });
    }

    const users = await User.searchUsers(query, excludeUserId, limit);

    res.status(200).json({ success: true, data: users });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Error searching users.' });
  }
};

/**
 * Upload a new avatar for the logged-in user.
 * @param {Object} req - Request object (expects file in req.files.avatar)
 * @param {Object} res - Response object
 */
exports.uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.files || Object.keys(req.files).length === 0 || !req.files.avatar) {
      return res.status(400).json({ success: false, message: 'No avatar file uploaded.' });
    }

    const avatarFile = req.files.avatar;

    // Basic validation (add more robust checks as needed)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(avatarFile.mimetype)) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Only JPG, PNG, GIF, WEBP allowed.' });
    }

    // Generate a unique filename to prevent collisions
    const fileExtension = path.extname(avatarFile.name);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, uniqueFilename);
    const relativePath = `/uploads/avatars/${uniqueFilename}`;

    // Move the file to the designated directory
    await avatarFile.mv(filePath);

    // Update user record in the database
    const updatedUser = await User.updateAvatar(userId, relativePath);

    if (!updatedUser) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.error('Error cleaning up avatar file after DB failure:', cleanupError);
        }
       return res.status(404).json({ success: false, message: 'User not found or failed to update avatar.' });
     }

     res.status(200).json({ success: true, message: 'Avatar uploaded successfully.', data: { avatarPath: relativePath } });

   } catch (error) {
     console.error('Avatar upload error:', error);
     res.status(500).json({ success: false, message: 'Error uploading avatar.' });
   }
 };

/**
 * Delete the current user's avatar.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.deleteAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find the user to get the current avatar path
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentAvatarPath = user.avatar;

    // If there's no current avatar, nothing to delete
    if (!currentAvatarPath) {
      return res.status(200).json({ success: true, message: 'No avatar to delete.' });
    }

    // Construct the full file system path
    const fullPath = path.join(__dirname, '..', '..', currentAvatarPath);

    // Delete the file from the filesystem
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (fileError) {
        console.error(`Error deleting avatar file ${fullPath}:`, fileError);
      }
    } else {
      console.warn(`Avatar file not found for deletion: ${fullPath}`);
    }

    // Update the user's avatar path to NULL in the database
    const updatedUser = await User.updateAvatar(userId, null);

    if (!updatedUser) {
      // This shouldn't happen if the user was found earlier, but handle defensively
      return res.status(500).json({ success: false, message: 'Failed to update user record after deleting avatar.' });
    }

    res.status(200).json({ success: true, message: 'Avatar deleted successfully.', data: { avatarPath: null } });

  } catch (error) {
    console.error('Avatar deletion error:', error);
    res.status(500).json({ success: false, message: 'Error deleting avatar.' });
  }
};

/**
 * Get the public status of the Scalytics API feature.
 * Allows frontend components to know if the feature is globally enabled.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getScalyticsApiStatus = async (req, res) => {
  try {
    const { db } = require('../models/db');
    
    const setting = await db.getAsync(
      'SELECT value FROM system_settings WHERE key = ?', 
      ['scalytics_api_enabled']
    );

    const isEnabled = setting?.value === 'true';

    res.status(200).json({ 
      success: true, 
      data: { 
        isEnabled: isEnabled 
      } 
    });

  } catch (error) {
    console.error('Error fetching Scalytics API status:', error);
    res.status(200).json({ 
      success: false,
      message: 'Could not retrieve API status.',
      data: { 
        isEnabled: false 
      }
    });
  }
};

/**
 * Get the current user's permission keys relevant for content filtering exemptions.
 * @param {Object} req - Request object (expects req.user with id)
 * @param {Object} res - Response object
 * @param {Function} next - Express next middleware function
 */
exports.getUserFilterPermissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    const { db } = require('../models/db'); // Ensure db is in scope
    let userPermissions = new Set();

    // Get direct user permissions
    const directPerms = await db.allAsync(`
      SELECT p.permission_key
      FROM admin_permissions p
      JOIN user_admin_permissions uap ON p.id = uap.permission_id
      WHERE uap.user_id = ?
    `, [userId]);
    directPerms.forEach(p => userPermissions.add(p.permission_key));

    // Get permissions from user's groups
    const groupPerms = await db.allAsync(`
      SELECT p.permission_key
      FROM admin_permissions p
      JOIN group_admin_permissions gap ON p.id = gap.permission_id
      JOIN user_groups ug ON gap.group_id = ug.group_id
      WHERE ug.user_id = ?
    `, [userId]);
    groupPerms.forEach(p => userPermissions.add(p.permission_key));

    // Filter for permissions that are specifically for filter exemptions
    // This assumes exemption keys follow a pattern like 'filter_exempt_*' or are known.
    // For now, returning all fetched admin_permissions. The frontend service
    // will check if `filterCache.userPermissions.has(exemptionPermissionKeyFromGroup)`.
    // If a more specific list of *only* filter-related permissions is needed,
    // the query or post-query filtering here would need to be more specific.
    // For instance, joining with filter_groups table to see which permission_keys are used.
    // However, the current backend responseFilteringService also fetches all and checks.

    res.status(200).json({ success: true, permissions: Array.from(userPermissions) });

  } catch (error) {
    console.error(`[UserController] Error fetching filter permissions for user ${req.user?.id}:`, error);
    next(error); // Pass to global error handler
  }
};
