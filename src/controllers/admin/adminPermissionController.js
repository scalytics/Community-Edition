const { db } = require('../../models/db');
const Permission = require('../../models/Permission');
const User = require('../../models/User');

/**
 * Get all available admin permissions
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.getAllPermissions();

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions
    });
  } catch (error) {
    console.error('Error getting permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting permissions'
    });
  }
};

/**
 * Get permissions for a specific user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getUserPermissions = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's direct permissions and permissions inherited from groups
    const { permissions, isPowerUser } = await Permission.getUserPermissions(userId);

    res.status(200).json({
      success: true,
      isPowerUser,
      count: permissions.length,
      data: permissions
    });
  } catch (error) {
    console.error('Error getting user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user permissions'
    });
  }
};

/**
 * Grant a permission to a user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.grantPermission = async (req, res) => {
  try {
    const userId = req.params.userId;
    const permissionId = req.params.permissionId;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow making admins into power users (they already have all permissions)
    if (user.is_admin) {
      return res.status(400).json({
        success: false,
        message: 'Admin users already have all permissions'
      });
    }

    // Check if permission exists
    const allPermissions = await Permission.getAllPermissions();
    const permissionExists = allPermissions.some(p => p.id === parseInt(permissionId));

    if (!permissionExists) {
      return res.status(404).json({
        success: false,
        message: 'Permission not found'
      });
    }

    // Grant permission
    const success = await Permission.grantPermission(userId, permissionId, req.user.id);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to grant permission'
      });
    }

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'grant_permission', `Granted permission ${permissionId} to user ${userId}`, req.ip]
    );

    res.status(200).json({
      success: true,
      message: 'Permission granted successfully'
    });
  } catch (error) {
    console.error('Error granting permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error granting permission'
    });
  }
};

/**
 * Revoke a permission from a user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.revokePermission = async (req, res) => {
  try {
    const userId = req.params.userId;
    const permissionId = req.params.permissionId;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if the user has this specific permission directly assigned
    const hasPermission = await db.getAsync(`
      SELECT 1 FROM user_admin_permissions
      WHERE user_id = ? AND permission_id = ?
    `, [userId, permissionId]);

    if (!hasPermission) {
      return res.status(400).json({
        success: false,
        message: 'User does not have this permission directly assigned'
      });
    }

    // Revoke permission
    const success = await Permission.revokePermission(userId, permissionId);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to revoke permission'
      });
    }

    // Log the action
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'revoke_permission', `Revoked permission ${permissionId} from user ${userId}`, req.ip]
    );

    res.status(200).json({
      success: true,
      message: 'Permission revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking permission'
    });
  }
};

/**
 * Get permissions for a specific group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.getGroupPermissions = async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Check if group exists (using db directly as Group model might not exist)
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Get group's permissions
    const permissions = await Permission.getGroupPermissions(groupId);

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions
    });
  } catch (error) {
    console.error('Error getting group permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting group permissions'
    });
  }
};

/**
 * Grant a permission to a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.grantGroupPermission = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const permissionId = req.params.permissionId;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if permission exists
    const allPermissions = await Permission.getAllPermissions();
    const permissionExists = allPermissions.some(p => p.id === parseInt(permissionId));

    if (!permissionExists) {
      return res.status(404).json({
        success: false,
        message: 'Permission not found'
      });
    }

    // Grant permission
    const success = await Permission.grantGroupPermission(groupId, permissionId, req.user.id);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to grant permission'
      });
    }

    // Fetch names for logging
    const permissionInfo = await db.getAsync('SELECT name, permission_key FROM admin_permissions WHERE id = ?', [permissionId]);
    const permissionName = permissionInfo ? (permissionInfo.name || permissionInfo.permission_key) : `ID ${permissionId}`;
    const groupName = group ? group.name : `ID ${groupId}`;

    // Log the action with names
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'grant_group_permission', `Granted permission '${permissionName}' to group '${groupName}'`, req.ip]
    );

    res.status(200).json({
      success: true,
      message: 'Permission granted to group successfully'
    });
  } catch (error) {
    console.error('Error granting group permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error granting permission to group'
    });
  }
};

/**
 * Revoke a permission from a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.revokeGroupPermission = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const permissionId = req.params.permissionId;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if permission is granted to the group
    const hasPermission = await db.getAsync(`
      SELECT 1 FROM group_admin_permissions
      WHERE group_id = ? AND permission_id = ?
    `, [groupId, permissionId]);

    if (!hasPermission) {
      return res.status(400).json({
        success: false,
        message: 'Group does not have this permission'
      });
    }

    // Revoke permission
    const success = await Permission.revokeGroupPermission(groupId, permissionId);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to revoke permission'
      });
    }

    // Fetch names for logging
    const permissionInfo = await db.getAsync('SELECT name, permission_key FROM admin_permissions WHERE id = ?', [permissionId]);
    const permissionName = permissionInfo ? (permissionInfo.name || permissionInfo.permission_key) : `ID ${permissionId}`;
    const groupName = group ? group.name : `ID ${groupId}`;

    // Log the action with names
    await db.runAsync(
      'INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'revoke_group_permission', `Revoked permission '${permissionName}' from group '${groupName}'`, req.ip]
    );

    res.status(200).json({
      success: true,
      message: 'Permission revoked from group successfully'
    });
  } catch (error) {
    console.error('Error revoking group permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking permission from group'
    });
  }
};
