const { db } = require('./db');
const fs = require('fs');
const path = require('path');

class Permission {
  /**
   * Apply the permissions migration to set up tables
   * @returns {Promise<boolean>} Success status
   */
  static async applyMigration() {
    try {
      // Check if users table exists before trying to alter it or get info
      const usersTableExists = await db.getAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");

      if (usersTableExists) {
        // Make sure we have the is_power_user column in users table
        const userColumns = await db.allAsync('PRAGMA table_info(users)');
        const hasPowerUserColumn = userColumns.some(col => col.name === 'is_power_user');
        
        if (!hasPowerUserColumn) {
          // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we check first
          await db.runAsync('ALTER TABLE users ADD COLUMN is_power_user INTEGER DEFAULT 0');
          console.log('Added is_power_user column to users table');
        }
      } else {
        console.warn('Users table does not exist, skipping is_power_user column check in Permission.applyMigration. Schema.sql should handle this.');
      }
      
      // Check if permissions tables exist
      const permissionsTableExists = await db.getAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_permissions'");
      
      if (!permissionsTableExists) {
        console.log('Creating admin_permissions related tables...');
        
        // Permissions tables embedded SQL instead of reading from file
        // (since schema.sql already creates these in a new installation)
        const migrationSQL = `
        -- Create admin_permissions table if it doesn't exist
        CREATE TABLE IF NOT EXISTS admin_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          permission_key TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create user_admin_permissions table if it doesn't exist
        CREATE TABLE IF NOT EXISTS user_admin_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          permission_id INTEGER NOT NULL,
          granted_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE,
          FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id, permission_id)
        );

        -- Create group_admin_permissions table if it doesn't exist
        CREATE TABLE IF NOT EXISTS group_admin_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER NOT NULL,
          permission_id INTEGER NOT NULL,
          granted_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
          FOREIGN KEY (permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE,
          FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(group_id, permission_id)
        );

        -- Create indexes for faster lookups
        CREATE INDEX IF NOT EXISTS idx_user_admin_permissions_user ON user_admin_permissions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_admin_permissions_perm ON user_admin_permissions(permission_id);
        CREATE INDEX IF NOT EXISTS idx_group_admin_permissions_group ON group_admin_permissions(group_id);
        CREATE INDEX IF NOT EXISTS idx_group_admin_permissions_perm ON group_admin_permissions(permission_id);

        -- Insert basic system permissions if they don't exist
        -- Uses same standardized format as schema.sql to avoid duplications
        INSERT OR IGNORE INTO admin_permissions (permission_key, name, description)
        VALUES 
          -- Core permissions (non-duplicated)
          ('access_admin', 'Access Admin Area', 'Allow access to administrative functions'),
          ('use_all_models', 'Use All Models', 'Use any model in the system regardless of group permissions'),
          ('manage_integrations', 'Manage Integrations', 'Allow users to manage authentication and service integrations'),
          ('view_integrations', 'View Integrations', 'Allow users to view integration configurations'),
          
          -- Modern colon-based permissions (used by routes)
          ('stats:view', 'View Statistics', 'Allow viewing system statistics and logs'),
          ('hardware:view', 'View Hardware', 'Allow viewing hardware information'),
          ('users:manage', 'Manage Users', 'Create, edit and delete user accounts'),
          ('providers:manage', 'Manage Providers', 'Manage API providers'),
          ('api-keys:manage', 'Manage API Keys', 'Manage API keys for external services'),
          ('huggingface:access', 'Hugging Face Access', 'Access Hugging Face models and services'),
          ('models:manage', 'Manage Models', 'Add, edit, and configure AI models'),
          ('model-access:manage', 'Manage Model Access', 'Control which users can access specific models'),
          ('groups:manage', 'Manage Groups', 'Create, edit and manage user groups');
        `;
        
        // Execute embedded migration SQL
        await db.execAsync(migrationSQL);
        console.log('Created permissions tables and inserted default permissions');
      } else {
        console.log('Permissions tables already exist, skipping creation');
      }
      
      // API key permissions are now part of schema.sql
      console.log('API key permissions included in schema.sql');
      
      return true;
    } catch (error) {
      console.error('Error applying permissions migration:', error);
      return false;
    }
  }
  
  /**
   * Get all available admin permissions
   * @returns {Promise<Array>} List of all permissions
   */
  static async getAllPermissions() {
    try {
      const permissions = await db.allAsync('SELECT * FROM admin_permissions ORDER BY name');
      return permissions;
    } catch (error) {
      console.error('Error getting all permissions:', error);
      return [];
    }
  }
  
  /**
   * Get permissions for a specific user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} List of user's permissions
   */
  static async getUserPermissions(userId) {
    try {
      // Get permissions directly assigned to the user
      const userPermissions = await db.allAsync(`
        SELECT p.*, 'user' as source
        FROM admin_permissions p
        JOIN user_admin_permissions up ON p.id = up.permission_id
        WHERE up.user_id = ?
      `, [userId]);
      
      // Get permissions assigned to the user's groups
      const groupPermissions = await db.allAsync(`
        SELECT p.*, g.name as group_name, 'group' as source
        FROM admin_permissions p
        JOIN group_admin_permissions gp ON p.id = gp.permission_id
        JOIN groups g ON gp.group_id = g.id
        JOIN user_groups ug ON g.id = ug.group_id
        WHERE ug.user_id = ?
      `, [userId]);
      
      // Combine permissions, removing duplicates
      const allPermissions = [...userPermissions];
      
      // Add group permissions if not already in the list (based on permission_id)
      for (const groupPerm of groupPermissions) {
        if (!allPermissions.some(p => p.id === groupPerm.id)) {
          allPermissions.push(groupPerm);
        }
      }
      
      return allPermissions;
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }
  
  /**
   * Get permissions for a specific group
   * @param {number} groupId - Group ID
   * @returns {Promise<Array>} List of group's permissions
   */
  static async getGroupPermissions(groupId) {
    try {
      const permissions = await db.allAsync(`
        SELECT p.*
        FROM admin_permissions p
        JOIN group_admin_permissions gp ON p.id = gp.permission_id
        WHERE gp.group_id = ?
        ORDER BY p.name
      `, [groupId]);
      
      return permissions;
    } catch (error) {
      console.error('Error getting group permissions:', error);
      return [];
    }
  }
  
  /**
   * Grant a permission to a user
   * @param {number} userId - User ID
   * @param {number} permissionId - Permission ID
   * @param {number} grantedById - ID of user granting the permission
   * @returns {Promise<boolean>} Success status
   */
  static async grantPermission(userId, permissionId, grantedById) {
    try {
      // Check if user already has this permission
      const existingPermission = await db.getAsync(`
        SELECT id FROM user_admin_permissions 
        WHERE user_id = ? AND permission_id = ?
      `, [userId, permissionId]);
      
      if (existingPermission) {
        // User already has this permission
        return true;
      }
      
      // Mark user as a power user if not already
      await db.runAsync(
        'UPDATE users SET is_power_user = 1 WHERE id = ? AND is_power_user = 0',
        [userId]
      );
      
      // Grant the permission
      await db.runAsync(`
        INSERT INTO user_admin_permissions (user_id, permission_id, granted_by)
        VALUES (?, ?, ?)
      `, [userId, permissionId, grantedById]);
      
      return true;
    } catch (error) {
      console.error('Error granting permission:', error);
      return false;
    }
  }
  
  /**
   * Revoke a permission from a user
   * @param {number} userId - User ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise<boolean>} Success status
   */
  static async revokePermission(userId, permissionId) {
    try {
      await db.runAsync(`
        DELETE FROM user_admin_permissions
        WHERE user_id = ? AND permission_id = ?
      `, [userId, permissionId]);
      
      // Check if user still has any permissions
      const remainingPermissions = await db.getAsync(`
        SELECT COUNT(*) as count FROM user_admin_permissions
        WHERE user_id = ?
      `, [userId]);
      
      // Also check if user has permissions through groups
      const groupPermissions = await db.getAsync(`
        SELECT COUNT(*) as count
        FROM group_admin_permissions gp
        JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = ?
      `, [userId]);
      
      // If user has no more permissions directly or through groups, remove power user status
      if (
        (!remainingPermissions || remainingPermissions.count === 0) &&
        (!groupPermissions || groupPermissions.count === 0)
      ) {
        await db.runAsync('UPDATE users SET is_power_user = 0 WHERE id = ?', [userId]);
      }
      
      return true;
    } catch (error) {
      console.error('Error revoking permission:', error);
      return false;
    }
  }
  
  /**
   * Grant a permission to a group
   * @param {number} groupId - Group ID
   * @param {number} permissionId - Permission ID
   * @param {number} grantedById - ID of user granting the permission
   * @returns {Promise<boolean>} Success status
   */
  static async grantGroupPermission(groupId, permissionId, grantedById) {
    try {
      // Check if group already has this permission
      const existingPermission = await db.getAsync(`
        SELECT id FROM group_admin_permissions 
        WHERE group_id = ? AND permission_id = ?
      `, [groupId, permissionId]);
      
      if (existingPermission) {
        // Group already has this permission
        return true;
      }
      
      // Grant the permission
      await db.runAsync(`
        INSERT INTO group_admin_permissions (group_id, permission_id, granted_by)
        VALUES (?, ?, ?)
      `, [groupId, permissionId, grantedById]);
      
      // Update all users in the group to be power users
      await db.runAsync(`
        UPDATE users SET is_power_user = 1
        WHERE id IN (SELECT user_id FROM user_groups WHERE group_id = ?)
        AND is_power_user = 0
      `, [groupId]);
      
      return true;
    } catch (error) {
      console.error('Error granting group permission:', error);
      return false;
    }
  }
  
  /**
   * Revoke a permission from a group
   * @param {number} groupId - Group ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise<boolean>} Success status
   */
  static async revokeGroupPermission(groupId, permissionId) {
    try {
      await db.runAsync(`
        DELETE FROM group_admin_permissions
        WHERE group_id = ? AND permission_id = ?
      `, [groupId, permissionId]);
      
      // For each user in the group, check if they should still be a power user
      const usersInGroup = await db.allAsync(`
        SELECT user_id FROM user_groups WHERE group_id = ?
      `, [groupId]);
      
      for (const user of usersInGroup) {
        // Check if user has any direct permissions
        const directPermissions = await db.getAsync(`
          SELECT COUNT(*) as count FROM user_admin_permissions
          WHERE user_id = ?
        `, [user.user_id]);
        
        // Check if user has permissions through any other groups
        const otherGroupPermissions = await db.getAsync(`
          SELECT COUNT(*) as count
          FROM group_admin_permissions gp
          JOIN user_groups ug ON gp.group_id = ug.group_id
          WHERE ug.user_id = ? AND ug.group_id != ?
        `, [user.user_id, groupId]);
        
        // If user has no more permissions, remove power user status
        if (
          (!directPermissions || directPermissions.count === 0) &&
          (!otherGroupPermissions || otherGroupPermissions.count === 0)
        ) {
          await db.runAsync('UPDATE users SET is_power_user = 0 WHERE id = ?', [user.user_id]);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error revoking group permission:', error);
      return false;
    }
  }
  
  /**
   * Check if user has specific permission
   * @param {number} userId - User ID
   * @param {string} permissionKey - Permission key to check
   * @returns {Promise<boolean>} Whether user has permission
   */
  static async userHasPermission(userId, permissionKey) {
    try {
      // Check if user is admin (admins have all permissions)
      const user = await db.getAsync('SELECT is_admin FROM users WHERE id = ?', [userId]);
      if (user && user.is_admin === 1) {
        return true;
      }
      
      // Check direct user permissions
      const directPermission = await db.getAsync(`
        SELECT 1 FROM user_admin_permissions uap
        JOIN admin_permissions ap ON uap.permission_id = ap.id
        WHERE uap.user_id = ? AND ap.permission_key = ?
      `, [userId, permissionKey]);
      
      if (directPermission) {
        return true;
      }
      
      // Check group permissions
      const groupPermission = await db.getAsync(`
        SELECT 1 FROM group_admin_permissions gap
        JOIN admin_permissions ap ON gap.permission_id = ap.id
        JOIN user_groups ug ON gap.group_id = ug.group_id
        WHERE ug.user_id = ? AND ap.permission_key = ?
      `, [userId, permissionKey]);
      
      return !!groupPermission;
    } catch (error) {
      console.error('Error checking user permission:', error);
      return false;
    }
  }
}

module.exports = Permission;
