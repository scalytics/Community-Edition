const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');
const { protect, admin, adminOrPermission } = require('../middleware/authMiddleware');
const apiService = require('../services/apiService');

// Create a special public route for auth config that doesn't require auth
// This must be defined before the protect middleware to be accessible
router.get('/auth/config', integrationController.getAuthConfig);

// Create a public endpoint for validating API keys
router.post('/validate-key', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Provider and API key are required'
      });
    }
    
    const validationResult = await apiService.validateApiKey(provider, apiKey);
    
    return res.status(200).json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error validating API key'
    });
  }
});

// Protected routes - all other integration routes require auth
try {
  // Apply auth middleware for all other routes
  router.use(protect);
  
  // Then apply appropriate permission check
  const permissionMiddleware = adminOrPermission('manage_integrations');
  router.use(permissionMiddleware);
} catch (error) {
  console.warn('Error setting up integration routes permission middleware:', error.message);
  // Fallback to admin-only if permission system fails
  router.use(protect, admin);
}

// Get all integrations and create new ones
router.route('/')
  .get(integrationController.getAllIntegrations)
  .post(integrationController.createIntegration);

// Get, update, and delete specific integrations
router.route('/:id')
  .get(integrationController.getIntegrationById)
  .put(integrationController.updateIntegration)
  .delete(integrationController.deleteIntegration);

// Toggle integration enabled status
router.patch('/:id/toggle', integrationController.toggleIntegrationStatus);

// Get test client configuration (for frontend testing)
router.get('/:id/test-config', integrationController.getTestClientConfig);

module.exports = router;
