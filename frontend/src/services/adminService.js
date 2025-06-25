/**
 * @fileoverview Admin service - exports from the modular admin services
 * 
 * This file imports services from the modular admin service folder.
 * It's provided for backward compatibility with existing components.
 * 
 * For new code, consider importing specific admin services directly:
 * 
 * ```
 * // Instead of:
 * import adminService from '../services/adminService';
 * adminService.getUsers();
 * 
 * // Use:
 * import { userService } from '../services/admin';
 * userService.getUsers();
 * ```
 */

import adminService from './admin';

// Export the combined admin service for backward compatibility
export default adminService;
