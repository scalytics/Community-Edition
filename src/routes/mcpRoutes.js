const express = require('express');
const router = express.Router();
const mcpController = require('../controllers/mcpController');
const { protect, hasPermission } = require('../middleware/authMiddleware'); 

router.use(protect); 

// Existing routes
router.get('/local-tools/status', mcpController.getLocalToolStatus); 
router.get('/public-tools/status', hasPermission('can_use_mcp_tools'), mcpController.getPublicToolStatus); 
router.get('/tools/definitions', hasPermission('can_use_mcp_tools'), mcpController.getAvailableToolDefinitions);
router.get('/tools/image_gen/config', mcpController.getUserImageGenConfig); 
router.post('/tools/image_gen/config', mcpController.setUserImageGenConfig);

module.exports = router;
