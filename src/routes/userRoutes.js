const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const userToolConfigController = require('../controllers/userToolConfigController'); // Import the new controller
const { protect, checkPrivateMode } = require('../middleware/authMiddleware');

// Route to check Scalytics API status (will inherit auth from main mount point)
router.get('/scalytics-api-status', userController.getScalyticsApiStatus);

// Apply auth middleware to all subsequent user routes in this router
router.use(protect);
router.use(checkPrivateMode);

// Search for users (e.g., for chat sharing)
router.get('/search', userController.searchUsers);

// Upload user avatar - Apply file upload middleware here
const { getFileUploadMiddleware } = require('../config/middleware');
const fileUploadMiddleware = getFileUploadMiddleware();
router.post('/avatar', fileUploadMiddleware, userController.uploadAvatar);

// Delete user avatar
router.delete('/avatar', userController.deleteAvatar);

// --- User Tool Configurations ---
// Get configuration for a specific tool
router.get('/me/tool-configs/:toolName', userToolConfigController.getUserToolConfig);

// Save/Update configuration for a specific tool
router.post('/me/tool-configs', userToolConfigController.saveUserToolConfig);

// Get user's permissions relevant for content filtering
router.get('/me/filter-permissions', userController.getUserFilterPermissions);


module.exports = router;
