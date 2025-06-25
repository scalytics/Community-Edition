/**
 * Admin service modules index file
 * Centralizes imports for all admin services
 */

import { ADMIN_ENDPOINTS } from './constants';
import huggingFaceService from './huggingFaceService';
import userService from './userService';
import groupService from './groupService';
import permissionService from './permissionService';
import providerService from './providerService'; 
import modelService from './modelService';
import systemService from './systemService';
import apiKeyService from './apiKeyService';
import permissionCheckService from './permissionCheckService';
import privacyService from './privacyService';
import filteringService from './filteringService'; 

export {
  ADMIN_ENDPOINTS,
  huggingFaceService,
  userService,
  groupService,
  permissionService,
  providerService,
  modelService,
  systemService,
  apiKeyService,
  permissionCheckService,
  privacyService,
  filteringService 
};

// Export a combined admin service object for backward compatibility
const adminService = {
  searchHuggingFaceModels: huggingFaceService.searchModels,
  downloadHuggingFaceModel: huggingFaceService.downloadModel,
  listModelFiles: huggingFaceService.listModelFiles,
  getDownloadProgress: huggingFaceService.getDownloadProgress,
  cancelModelDownload: huggingFaceService.cancelDownload,
  getActiveDownloads: huggingFaceService.getActiveDownloads,
  
  // Include all methods from user service
  getUsers: userService.getUsers,
  getUser: userService.getUser,
  updateUser: userService.updateUser,
  registerUser: userService.registerUser,
  deleteUser: userService.deleteUser,
  resendRegistrationLink: userService.resendRegistrationLink,
  resetUserPassword: userService.resetUserPassword,
  getUserModelAccess: userService.getUserModelAccess,
  updateUserModelAccess: userService.updateUserModelAccess,
  resetUserModels: userService.resetUserModels,
  resetUserProviderModels: userService.resetUserProviderModels,
  copyGroupPermissionsToUser: userService.copyGroupPermissionsToUser,
  
  // Include all methods from group service
  getGroups: groupService.getGroups,
  getGroupDetails: groupService.getGroupDetails,
  createGroup: groupService.createGroup,
  updateGroup: groupService.updateGroup,
  deleteGroup: groupService.deleteGroup,
  assignUserToGroup: groupService.assignUserToGroup,
  removeUserFromGroup: groupService.removeUserFromGroup,
  getGroupModelAccess: groupService.getGroupModelAccess,
  updateGroupModelAccess: groupService.updateGroupModelAccess,
  resetGroupModels: groupService.resetGroupModels,
  resetGroupProviderModels: groupService.resetGroupProviderModels,
  
  // Include all methods from permission service
  getAllPermissions: permissionService.getAllPermissions,
  getUserPermissions: permissionService.getUserPermissions,
  grantPermission: permissionService.grantPermissionToUser,
  revokePermission: permissionService.revokePermissionFromUser,
  getGroupPermissions: permissionService.getGroupPermissions,
  grantGroupPermission: permissionService.grantPermissionToGroup,
  revokeGroupPermission: permissionService.revokePermissionFromGroup,
  
  // Include all methods from provider service
  getProviders: providerService.getProviders,
  updateProvider: providerService.updateProvider,
  addProvider: providerService.addProvider,
  deleteProvider: providerService.deleteProvider,
  getApiProviders: providerService.getApiProviders,
  
  // Include all methods from model service
  getModelStats: modelService.getModelStats,
  uploadModel: modelService.uploadModel,
  discoverProviderModels: modelService.discoverProviderModels,
  resetAllModels: modelService.resetAllModels,
  getWorkerPoolStatus: modelService.getWorkerPoolStatus, 
  
  // Include all methods from system service
  getSystemStats: systemService.getSystemStats,
  getUsageOverTime: systemService.getUsageOverTime,
  getSystemLogs: systemService.getSystemLogs,
  getHardwareInfo: systemService.getHardwareInfo,
  getGpuIndices: systemService.getGpuIndices, 
  getModelDirectories: systemService.getModelDirectories,
  deleteModelDirectory: systemService.deleteModelDirectory,
  forceDeleteModelDirectory: systemService.forceDeleteModelDirectory,
  cleanupModelDirectories: systemService.cleanupModelDirectories,
  getStorageInfo: systemService.getStorageInfo,
  formatNumber: systemService.formatNumber,
  listDatabaseBackups: systemService.listDatabaseBackups,
  createDatabaseBackup: systemService.createDatabaseBackup,
  getDatabaseBackupDownloadUrl: systemService.getDatabaseBackupDownloadUrl,
  downloadDatabaseBackup: systemService.downloadDatabaseBackup,
  restoreDatabaseBackup: systemService.restoreDatabaseBackup,
  deleteDatabaseBackup: systemService.deleteDatabaseBackup,
  uploadDatabaseBackup: systemService.uploadDatabaseBackup,
  getSystemInfo: systemService.getSystemInfo,
  formatFileSize: systemService.formatFileSize,
  validateDatabaseBackupFile: systemService.validateDatabaseBackupFile,
  getPreferredEmbeddingModel: systemService.getPreferredEmbeddingModel, 
  updatePreferredEmbeddingModel: systemService.updatePreferredEmbeddingModel, 
  
  // Include all methods from apiKey service
  getAllApiKeys: apiKeyService.getAllApiKeys,
  getProviderApiKey: apiKeyService.getProviderApiKey,
  setApiKey: apiKeyService.setApiKey,
  deleteApiKey: apiKeyService.deleteApiKey,
  deactivateApiKey: apiKeyService.deactivateApiKey,
  activateApiKey: apiKeyService.activateApiKey,
  testApiKey: apiKeyService.testApiKey,
  getUserApiKeys: apiKeyService.getUserApiKeys,
  
  // Include all methods from privacy service
  getPrivacySettings: privacyService.getPrivacySettings,
  updateGlobalPrivacyMode: privacyService.updateGlobalPrivacyMode,

  // Include all methods from filtering service
  getFilterGroups: filteringService.getFilterGroups,
  createFilterGroup: filteringService.createFilterGroup,
  updateFilterGroup: filteringService.updateFilterGroup,
  deleteFilterGroup: filteringService.deleteFilterGroup,
  getFilterRules: filteringService.getFilterRules,
  createFilterRule: filteringService.createFilterRule,
  updateFilterRule: filteringService.updateFilterRule,
  deleteFilterRule: filteringService.deleteFilterRule,
  getActiveLanguages: filteringService.getActiveLanguages,
  updateActiveLanguages: filteringService.updateActiveLanguages
};

export default adminService;
