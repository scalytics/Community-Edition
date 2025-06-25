import apiService from '../apiService';

/**
 * Admin services for permission management
 */
const permissionService = {
  /**
   * Get all available admin permissions
   * @returns {Promise<Object>} List of permissions
   */
  getAllPermissions: async () => {
    try {
      const response = await apiService.get('/admin/permissions');
      return response;
    } catch (error) {
      console.error('Error getting all permissions:', error);
      throw error;
    }
  },

  /**
   * Get permissions for a specific user
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} User's permissions
   */
  getUserPermissions: async (userId) => {
    try {
      const response = await apiService.get(`/admin/users/${userId}/permissions`);
      return response;
    } catch (error) {
      console.error('Error getting user permissions:', error);
      throw error;
    }
  },

  /**
   * Grant a permission to a user
   * @param {string|number} userId - User ID
   * @param {string|number} permissionId - Permission ID
   * @returns {Promise<Object>} Result of the operation
   */
  grantPermissionToUser: async (userId, permissionId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/permissions/${permissionId}`);
      return response;
    } catch (error) {
      console.error('Error granting permission:', error);
      throw error;
    }
  },

  /**
   * Revoke a permission from a user
   * @param {string|number} userId - User ID
   * @param {string|number} permissionId - Permission ID
   * @returns {Promise<Object>} Result of the operation
   */
  revokePermissionFromUser: async (userId, permissionId) => {
    try {
      const response = await apiService.delete(`/admin/users/${userId}/permissions/${permissionId}`);
      return response;
    } catch (error) {
      console.error('Error revoking permission:', error);
      throw error;
    }
  },

  /**
   * Get permissions for a specific group
   * @param {string|number} groupId - Group ID
   * @returns {Promise<Object>} Group's permissions
   */
  getGroupPermissions: async (groupId) => {
    try {
      const response = await apiService.get(`/admin/groups/${groupId}/permissions`);
      return response;
    } catch (error) {
      console.error('Error getting group permissions:', error);
      throw error;
    }
  },

  /**
   * Grant a permission to a group
   * @param {string|number} groupId - Group ID
   * @param {string|number} permissionId - Permission ID
   * @returns {Promise<Object>} Result of the operation
   */
  grantPermissionToGroup: async (groupId, permissionId) => {
    try {
      const response = await apiService.post(`/admin/groups/${groupId}/permissions/${permissionId}`);
      return response;
    } catch (error) {
      console.error('Error granting group permission:', error);
      throw error;
    }
  },

  /**
   * Revoke a permission from a group
   * @param {string|number} groupId - Group ID
   * @param {string|number} permissionId - Permission ID
   * @returns {Promise<Object>} Result of the operation
   */
  revokePermissionFromGroup: async (groupId, permissionId) => {
    try {
      const response = await apiService.delete(`/admin/groups/${groupId}/permissions/${permissionId}`);
      return response;
    } catch (error) {
      console.error('Error revoking group permission:', error);
      throw error;
    }
  }
};

export default permissionService;
