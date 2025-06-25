/**
 * Admin API endpoint constants
 */
export const ADMIN_ENDPOINTS = {
  STATS: '/admin/stats',
  USERS: '/admin/users',
  USER: (id) => `/admin/users/${id}`,
  MODEL_STATS: (id) => `/admin/models/${id}/stats`,
  USAGE: '/admin/usage',
  LOGS: '/admin/logs',
  HARDWARE: '/admin/hardware',
  GPU_INDICES: '/admin/hardware/gpu-indices', 
  WORKER_POOL_STATUS: '/admin/models/pool-status', 
  PREFERRED_EMBEDDING_MODEL: '/admin/settings/preferred-embedding-model', 
  
  // Privacy endpoints
  PRIVACY: '/admin/privacy',
  PRIVACY_GLOBAL_MODE: '/admin/privacy/global-mode',
  
  // System maintenance endpoints
  MODEL_DIRECTORIES: '/system/model-directories',
  MODEL_DIRECTORY: (dirName) => `/system/model-directories/${dirName}`,
  FORCE_DELETE_MODEL_DIRECTORY: (dirName) => `/system/model-directories/${dirName}/force`,
  STORAGE_INFO: '/system/storage-info',
  
  // Database backup endpoints
  DATABASE_BACKUPS: '/system/database-backups',
  DATABASE_BACKUP: (fileName) => `/system/database-backups/${fileName}`,
  RESTORE_DATABASE_BACKUP: (fileName) => `/system/database-backups/${fileName}/restore`,
  UPLOAD_DATABASE_BACKUP: '/system/database-backups/upload',
  SYSTEM_INFO: '/system/info',
  RESTART_SERVER: '/system/restart'
};
