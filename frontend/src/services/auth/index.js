/**
 * Auth service module exports
 * Centralizes all auth-related functionality
 */

import loginService from './loginService';
import profileService from './profileService';
import tokenService from './tokenService';
import { AUTH_ENDPOINTS } from './constants';

// Combine all services into a single auth service object
const authService = {
  // Login and authentication methods
  login: loginService.login,
  register: loginService.register,
  logout: loginService.logout,
  
  // Profile and user methods
  getProfile: profileService.getProfile,
  updateSettings: profileService.updateSettings,
  uploadAvatar: profileService.uploadAvatar,
  deleteAvatar: profileService.deleteAvatar, // Add deleteAvatar here
  getCurrentUser: profileService.getCurrentUser,
  isAdmin: profileService.isAdmin,
  isPowerUser: profileService.isPowerUser,
  
  // Session management
  isAuthenticated: () => !!localStorage.getItem('token'),
  
  // Token and password management
  verifyRegistrationToken: tokenService.verifyRegistrationToken,
  setPassword: tokenService.setPassword,
  
  // Constants
  ENDPOINTS: AUTH_ENDPOINTS
};

// Export individual services for direct import
export {
  loginService,
  profileService,
  tokenService,
  AUTH_ENDPOINTS
};

// Export combined service as default
export default authService;
