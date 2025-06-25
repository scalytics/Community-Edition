const express = require('express');
const agentController = require('../controllers/agentController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', agentController.getAgents);
router.get('/tools', agentController.getMCPTools);
router.get('/:agentId/capabilities', agentController.getAgentCapabilities);
router.post('/chat', agentController.startAgentChat);
router.post('/live-search', hasPermission('agents:use:live_search'), agentController.handleDeepSearchRequest);

module.exports = router;
