const express = require('express');
const router = express.Router();

// --- Controller Imports ---
const adminStatsController = require('../controllers/admin/adminStatsController');
const adminUserController = require('../controllers/admin/adminUserController');
const adminProviderController = require('../controllers/admin/adminProviderController');
const adminPermissionController = require('../controllers/admin/adminPermissionController');
const adminSettingsController = require('../controllers/admin/adminSettingsController');
const adminModelController = require('../controllers/adminModelController'); 
const apiKeyController = require('../controllers/apiKeyController'); 
const hardwareController = require('../controllers/hardwareController'); 
const huggingFaceController = require('../controllers/huggingFaceController'); 
const downloadController = require('../controllers/downloadController'); 
const adminMcpController = require('../controllers/admin/adminMcpController');
const primaryModelController = require('../controllers/model/primaryModelController'); 

// --- Middleware Imports ---
const { protect, admin, adminOrPermission } = require('../middleware/authMiddleware');

// Apply protect middleware to all admin routes
router.use(protect);

// --- Route Definitions ---

// System statistics routes
router.get('/stats', adminOrPermission('stats:view'), adminStatsController.getSystemStats);
router.get('/usage', adminOrPermission('stats:view'), adminStatsController.getUsageOverTime);
router.get('/logs', adminOrPermission('stats:view'), adminStatsController.getSystemLogs);
router.get('/logs/download', adminOrPermission('stats:view'), adminStatsController.downloadSystemLogs);
router.get('/hardware', adminOrPermission('hardware:view'), hardwareController.getHardwareInfo);
router.get('/hardware/gpu-indices', adminOrPermission('hardware:view'), async (req, res) => {
  try {
    const indices = await hardwareController.getGpuIndices();
    res.json({ success: true, data: indices });
  } catch (error) {
    console.error('Error fetching GPU indices:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch GPU indices' });
  }
});
router.get('/hardware/vram-limit', adminOrPermission('hardware:view'), async (req, res) => {
    try {
      const limit = await hardwareController.getEffectiveGpuVramLimitGb();
      res.json({ success: true, data: { effectiveGpuVramLimitGb: limit } });
    } catch (error) {
      console.error('Error fetching effective VRAM limit:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch effective VRAM limit' });
    }
});


// User management
router.get('/users', adminOrPermission('users:manage'), adminUserController.getUsers);
router.get('/users/:id', adminOrPermission('users:manage'), adminUserController.getUser);
router.put('/users/:id', admin, adminUserController.updateUser);
router.delete('/users/:id', admin, adminUserController.deleteUser);
router.post('/users/register', admin, adminUserController.registerUser);
router.post('/users/:id/resend-invitation', adminOrPermission('users:manage'), adminUserController.resendRegistrationLink);
router.post('/users/:id/reset-password', adminOrPermission('users:manage'), adminUserController.resetUserPassword);

// Model statistics
router.get('/models/:id/stats', adminOrPermission('stats:view'), adminStatsController.getModelStats);

// Provider management
router.get('/providers', adminOrPermission('providers:manage'), adminProviderController.getAllProviders);
router.put('/providers/:id', admin, adminProviderController.updateProvider);
router.post('/providers', admin, adminProviderController.addProvider);
router.delete('/providers/:id', admin, adminProviderController.deleteProvider);

// API Key Management
router.get('/api-keys/all', adminOrPermission('api-keys:manage'), apiKeyController.getAllApiKeys);
router.get('/api-keys/provider/:providerId', adminOrPermission('api-keys:manage'), apiKeyController.getProviderApiKey);
router.post('/api-keys', adminOrPermission('api-keys:manage'), apiKeyController.setApiKey);
router.delete('/api-keys/:id', adminOrPermission('api-keys:manage'), apiKeyController.deleteApiKey);
router.post('/api-keys/test', adminOrPermission('api-keys:manage'), apiKeyController.testApiKey);
router.put('/api-keys/:id/activate', adminOrPermission('api-keys:manage'), apiKeyController.activateApiKey);
router.put('/api-keys/:id/deactivate', adminOrPermission('api-keys:manage'), apiKeyController.deactivateApiKey);

// Route to get global API keys (for admin purposes, e.g., checking overrides)
router.get('/global/api-keys', admin, apiKeyController.getGlobalApiKeys); // New route
 
 // Model discovery routes
 router.post('/discover', adminOrPermission('huggingface:access'), adminProviderController.discoverModels);
router.post('/reset', admin, adminProviderController.resetAllModels);
router.get('/available', adminOrPermission('huggingface:access'), adminModelController.getAvailableModels);

// Hugging Face routes
router.get('/huggingface/search', adminOrPermission('huggingface:access'), huggingFaceController.searchModels);
router.post('/huggingface/download-with-script', adminOrPermission('huggingface:access'), huggingFaceController.downloadModel);
router.post('/huggingface/models/:modelId/download', adminOrPermission('huggingface:access'), huggingFaceController.downloadModel);
router.get('/huggingface/models/:modelId/files', adminOrPermission('huggingface:access'), huggingFaceController.listModelFiles);
router.get('/huggingface/downloads/:downloadId', adminOrPermission('huggingface:access'), huggingFaceController.getDownloadProgress);
router.delete('/huggingface/downloads/:downloadId', adminOrPermission('huggingface:access'), huggingFaceController.cancelDownload);
router.get('/huggingface/downloads', adminOrPermission('huggingface:access'), huggingFaceController.getActiveDownloads);
router.post('/huggingface/login', adminOrPermission('huggingface:access'), huggingFaceController.loginToHuggingFace);
router.get('/huggingface/token-status', adminOrPermission('huggingface:access'), huggingFaceController.getHuggingFaceTokenStatus);
router.delete('/huggingface/token', adminOrPermission('huggingface:access'), huggingFaceController.deleteHuggingFaceToken);

// Download management endpoints
router.get('/downloads/:downloadId/status', adminOrPermission('huggingface:access'), downloadController.getDownloadStatus);
router.delete('/downloads/:downloadId/cancel', adminOrPermission('huggingface:access'), downloadController.cancelDownload);
router.get('/downloads/active', adminOrPermission('huggingface:access'), downloadController.getActiveDownloads);
router.get('/downloads', adminOrPermission('huggingface:access'), downloadController.getActiveDownloads);

// Model management routes
router.post('/models/upload', adminOrPermission('models:manage'), adminModelController.uploadModel);
router.get('/models/local', adminOrPermission('models:manage'), adminModelController.getLocalModels);
router.delete('/models/:id', adminOrPermission('models:manage'), adminModelController.deleteModel);
router.post('/models/:id/activate', adminOrPermission('models:manage'), adminModelController.activateModel);
router.post('/models/deactivate', adminOrPermission('models:manage'), adminModelController.deactivateModel);
router.get('/models/pool-status', adminOrPermission('models:manage'), adminModelController.getWorkerPoolStatus);
router.put('/models/:id/config', adminOrPermission('models:manage'), adminModelController.updateModelConfig);
router.patch('/models/:id/status', adminOrPermission('models:manage'), adminModelController.updateModelStatus);

// Primary model routes
router.post('/models/:id/set-primary', adminOrPermission('models:manage'), primaryModelController.setPrimaryModelById);
router.get('/primary-model', adminOrPermission('models:manage'), primaryModelController.getPrimaryModelStatus);
router.post('/primary-model/unset', adminOrPermission('models:manage'), primaryModelController.unsetPrimaryModel);

// User model access routes
router.get('/users/:userId/models', adminOrPermission('model-access:manage'), adminModelController.getUserModelAccess);

// User permission management routes
router.get('/permissions', admin, adminPermissionController.getAllPermissions);
router.get('/users/:userId/permissions', admin, adminPermissionController.getUserPermissions);
router.post('/users/:userId/permissions/:permissionId', admin, adminPermissionController.grantPermission);
router.delete('/users/:userId/permissions/:permissionId', admin, adminPermissionController.revokePermission);


// System Settings Routes
router.get('/settings/air_gapped', admin, adminSettingsController.getAirGappedMode);
router.put('/settings/air_gapped', admin, adminSettingsController.updateAirGappedMode);

// Scalytics API Settings Routes (requires full admin)
router.get('/settings/scalytics-api', admin, adminSettingsController.getScalyticsApiSettings);
router.put('/settings/scalytics-api', admin, adminSettingsController.updateScalyticsApiSettings);

// MCP Local Tool Management (Admin only)
router.put('/mcp/local-tools/:toolName/status', admin, adminMcpController.updateLocalToolStatus);

// Preferred Embedding Model Setting (Admin only)
router.get('/settings/preferred-embedding-model', admin, adminSettingsController.getPreferredEmbeddingModel);
router.put('/settings/preferred-embedding-model', admin, adminSettingsController.updatePreferredEmbeddingModel);

// Active Filter Languages Setting (Admin only)
router.get('/settings/active-filter-languages', admin, adminSettingsController.getActiveFilterLanguages); 
router.put('/settings/active-filter-languages', admin, adminSettingsController.updateActiveFilterLanguages); 

module.exports = router;
