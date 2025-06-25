import { permissionService } from './index';
import authService from '../authService';

/**
 * Service to check user permissions for admin tabs
 */
const permissionCheckService = {
  /**
   * Map of admin tabs to their required permissions
   * 'admin' means only administrators can access this tab
   */
  tabPermissionMap: {
    stats: 'stats:view',
    users: 'users:manage',
    groups: 'groups:manage',
    models: 'models:manage',
    huggingface: 'huggingface:access',
    providers: 'providers:manage',
    hardware: 'hardware:view',
    system: 'admin' // Only admins can access maintenance
  },

  /**
   * User's permissions cache to avoid multiple API calls
   */
  userPermissionsCache: null,

  /**
   * Check if current user can access a specific tab
   * @param {string} tabId - ID of the tab to check
   * @returns {Promise<boolean>} - Whether user can access the tab
   */
  async canAccessTab(tabId) {
    // Admins can access all tabs
    if (authService.isAdmin()) {
      return true;
    }
    
    // Power Users can access all tabs except those marked as admin-only
    if (authService.isPowerUser()) {
      // If tab requires admin access, only admins can access it
      const requiredPermission = this.tabPermissionMap[tabId];
      return requiredPermission !== 'admin';
    }

    // Get the required permission for this tab
    const requiredPermission = this.tabPermissionMap[tabId];

    // If no permission mapping exists, default to false
    if (!requiredPermission) {
      return false;
    }

    // If tab requires admin access, only admins can access it
    if (requiredPermission === 'admin') {
      return false;
    }

    // Get user permissions (from cache if available)
    const userPermissions = await this.getUserPermissions();
    
    // Check if user has the required permission
    return userPermissions.some(p => p.permission_key === requiredPermission);
  },

  /**
   * Load user's permissions from the API (with caching)
   * @returns {Promise<Array>} - List of user's permissions
   */
  async getUserPermissions() {
    // Return from cache if available
    if (this.userPermissionsCache) {
      return this.userPermissionsCache;
    }

    try {
      // Get current user ID
      const user = authService.getCurrentUser();
      if (!user) {
        return [];
      }

      // Fetch permissions from API
      const response = await permissionService.getUserPermissions(user.id);
      if (response.success) {
        this.userPermissionsCache = response.data || [];
        return this.userPermissionsCache;
      }
      return [];
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      return [];
    }
  },

  /**
   * Filter admin tabs based on user permissions
   * @param {Array} tabs - List of all admin tabs
   * @returns {Promise<Array>} - Filtered list of tabs the user can access
   */
  async filterAccessibleTabs(tabs) {
    // Admins can access all tabs
    if (authService.isAdmin()) {
      return tabs;
    }
    
    // Power Users can access all tabs except those marked as admin-only
    if (authService.isPowerUser()) {
      return tabs.filter(tab => this.tabPermissionMap[tab.id] !== 'admin');
    }

    const accessibleTabs = [];

    // Check each tab
    for (const tab of tabs) {
      const canAccess = await this.canAccessTab(tab.id);
      if (canAccess) {
        accessibleTabs.push(tab);
      }
    }

    return accessibleTabs;
  },

  /**
   * Reset the permissions cache
   */
  clearCache() {
    this.userPermissionsCache = null;
  }
};

export default permissionCheckService;
