const express = require('express');
const router = express.Router();
const githubController = require('../controllers/githubController');
const { protect } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// GitHub OAuth routes
router.post('/connect', githubController.connectAccount);
router.post('/disconnect', githubController.disconnectAccount);
router.get('/status', githubController.getConnectionStatus);

// GitHub API routes
router.get('/repositories', githubController.getRepositories);
router.get('/content', githubController.getRepositoryContent);
router.get('/file', githubController.getFileContent);

module.exports = router;
