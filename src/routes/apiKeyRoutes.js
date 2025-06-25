const express = require('express');
const router = express.Router();
const { protect, admin, adminOrPermission, hasPermission } = require('../middleware/authMiddleware'); 
const apiKeyController = require('../controllers/apiKeyController');

// Apply protect middleware to all API key routes
router.use(protect);

// User API key management routes - users can manage their own keys
router.get('/', apiKeyController.getUserApiKeys);
router.post('/', apiKeyController.setApiKey);
router.delete('/:id', apiKeyController.deleteUserApiKey);
router.put('/:id/activate', apiKeyController.activateUserApiKey);
router.put('/:id/deactivate', apiKeyController.deactivateUserApiKey);
router.post('/test', apiKeyController.testApiKey);

// Route for users to generate their own Scalytics API key - requires specific permission
router.post('/scalytics', hasPermission('api-keys:generate'), apiKeyController.generateScalyticsApiKey);

// Get status of global API keys (e.g., for frontend source selection)
router.get('/global-status', apiKeyController.getGlobalApiKeyStatus);

// Get a list of service names for which the current user has active API keys
router.get('/services-with-keys', apiKeyController.getServicesWithActiveKeys);

// Admin routes require admin permission - these allow admins to manage all keys
router.get('/admin/all', adminOrPermission('api-keys:manage'), apiKeyController.getAllApiKeys);
router.get('/admin/global', adminOrPermission('api-keys:manage'), apiKeyController.getGlobalApiKeys);
router.get('/admin/provider/:providerId', adminOrPermission('api-keys:manage'), apiKeyController.getProviderApiKey);
router.post('/admin/global', adminOrPermission('api-keys:manage'), apiKeyController.setGlobalApiKey);
router.delete('/admin/:id', adminOrPermission('api-keys:manage'), apiKeyController.deleteApiKey);
router.put('/admin/:id/activate', adminOrPermission('api-keys:manage'), apiKeyController.activateApiKey);
router.put('/admin/:id/deactivate', adminOrPermission('api-keys:manage'), apiKeyController.deactivateApiKey);
router.post('/admin/test', adminOrPermission('api-keys:manage'), apiKeyController.testApiKey);

module.exports = router;
