const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const agentController = require('../controllers/agentController'); 
const githubController = require('../controllers/githubController');
const { protect, checkPrivateMode, checkModelAccess, standardAuth } = require('../middleware/authMiddleware');

router.use(protect);
router.use(checkPrivateMode);

router.post('/', checkModelAccess, chatController.createChat);

router.get('/', chatController.getChats); 
router.get('/shared-with-me', chatController.getSharedWithMeChats); 
router.get('/:id', chatController.getChat);
router.put('/:id', chatController.updateChat);
router.delete('/:id', chatController.deleteChat);
router.post('/:id/messages', chatController.sendMessage);

// Message feedback
router.post('/messages/:messageId/feedback', chatController.submitMessageFeedback); 
router.get('/messages/:messageId/feedback', chatController.getMessageFeedback); 

// --- Chat Sharing Routes (Owner Actions) ---
router.post('/:id/shares', chatController.createShareInvitation); 
router.get('/:id/shares', chatController.getChatShares); 
router.delete('/:id/shares/:userId', chatController.removeShare); 

// GitHub file integration routes
router.post('/:chatId/github-files', githubController.addFileToChatContext);
router.get('/:chatId/github-files', githubController.getChatGithubFiles);
router.delete('/:chatId/github-files/:fileId', githubController.removeFileFromChatContext);

// Route to run an MCP tool within a specific chat
router.post('/:chatId/run-tool', agentController.runToolInChat); 

// Route for user-triggered chat summarization
router.post('/:id/summarize', chatController.summarizeChatHistory);

module.exports = router;
