import apiService from '../apiService';

/**
 * Admin services for group management
 */
const groupService = {
  /**
   * Get all groups
   * @returns {Promise<Array>} List of groups
   */
  getGroups: async () => {
    try {
      const response = await apiService.get('/admin/groups');
      return response && response.data ? response : { data: [] };
    } catch (error) {
      console.error('Error in getGroups:', error);
      throw error;
    }
  },

  /**
   * Get detailed information about a specific group
   * @param {string|number} groupId - ID of the group to retrieve
   * @returns {Promise<Object>} Group details including users
   */
  getGroupDetails: async (groupId) => {
    try {
      const response = await apiService.get(`/admin/groups/${groupId}`);
      let groupData;
      
      if (response?.data?.data) {
        groupData = response.data.data;
      } else if (response?.data) {
        groupData = response.data;
      } else if (response) {
        groupData = response;
      } else {
        groupData = null;
      }
      
      return {
        id: groupData?.id || groupId,
        name: groupData?.name || `Group ${groupId}`,
        description: groupData?.description || '',
        users: Array.isArray(groupData?.users) ? groupData.users : [],
        ...groupData 
      };
    } catch (error) {
      console.error('Error getting group details:', error);
      console.error('Error details:', error.response || error.message || error);
      throw error;
    }
  },

  /**
   * Create a new group
   * @param {Object} groupData - Group data
   * @returns {Promise<Object>} Created group
   */
  createGroup: async (groupData) => {
    try {
      const response = await apiService.post('/admin/groups', groupData);
      return response;
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  },

  /**
   * Update an existing group
   * @param {string|number} groupId - ID of the group to update
   * @param {Object} groupData - Updated group data
   * @returns {Promise<Object>} Updated group
   */
  updateGroup: async (groupId, groupData) => {
    try {
      const response = await apiService.put(`/admin/groups/${groupId}`, groupData);
      return response;
    } catch (error) {
      console.error('Error updating group:', error);
      throw error;
    }
  },

  /**
   * Delete a group
   * @param {string|number} groupId - ID of the group to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteGroup: async (groupId) => {
    try {
      const response = await apiService.delete(`/admin/groups/${groupId}`);
      return response;
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  },

  /**
   * Assign a user to a group
   * @param {string|number} userId - ID of the user
   * @param {string|number} groupId - ID of the group
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignUserToGroup: async (userId, groupId) => {
    try {
      const response = await apiService.post(`/admin/users/${userId}/groups`, { groupId });
      return response;
    } catch (error) {
      console.error('Error assigning user to group:', error);
      throw error;
    }
  },

  /**
   * Remove a user from a group
   * @param {string|number} userId - ID of the user
   * @param {string|number} groupId - ID of the group
   * @returns {Promise<Object>} Removal confirmation
   */
  removeUserFromGroup: async (userId, groupId) => {
    try {
      const response = await apiService.delete(`/admin/users/${userId}/groups/${groupId}`);
      return response;
    } catch (error) {
      console.error('Error removing user from group:', error);
      throw error;
    }
  },

  /**
   * Get the model access settings for a group
   * @param {string|number} groupId - ID of the group
   * @returns {Promise<Object>} Model access settings
   */
  getGroupModelAccess: async (groupId) => {
    try {
      const response = await apiService.get(`/admin/groups/${groupId}/models`);
      return response;
    } catch (error) {
      console.error('Error getting group model access:', error);
      throw error;
    }
  },

  /**
   * Update a group's access to a specific model
   * @param {string|number} groupId - ID of the group
   * @param {string|number} modelId - ID of the model
   * @param {boolean} canAccess - Whether the group can access the model
   * @returns {Promise<Object>} Update confirmation
   */
  updateGroupModelAccess: async (groupId, modelId, canAccess) => {
    try {
      const response = await apiService.put(`/admin/groups/${groupId}/models`, {
        modelId,
        canAccess
      });
      return response;
    } catch (error) {
      console.error('Error updating group model access:', error);
      throw error;
    }
  },

  /**
   * Reset all model access settings for a group to defaults
   * @param {string|number} groupId - ID of the group
   * @returns {Promise<Object>} Reset confirmation
   */
  resetGroupModels: async (groupId) => {
    try {
      const response = await apiService.post(`/admin/groups/${groupId}/models/reset`);
      return response;
    } catch (error) {
      console.error('Error resetting group models:', error);
      throw error;
    }
  },

  /**
   * Reset model access settings for a specific provider for a group
   * @param {string|number} groupId - ID of the group
   * @param {string|number} providerId - ID of the provider
   * @returns {Promise<Object>} Reset confirmation
   */
  resetGroupProviderModels: async (groupId, providerId) => {
    try {
      const response = await apiService.post(`/admin/groups/${groupId}/providers/${providerId}/reset`);
      return response;
    } catch (error) {
      console.error('Error resetting group provider models:', error);
      throw error;
    }
  }
};

export default groupService;
