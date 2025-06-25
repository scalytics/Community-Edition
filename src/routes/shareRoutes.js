// src/routes/shareRoutes.js
const express = require('express');
const router = express.Router();
// Note: We are using functions from chatController for now.
// Consider refactoring into a dedicated shareController if complexity grows.
const chatController = require('../controllers/chatController');
const { protect, checkPrivateMode } = require('../middleware/authMiddleware');

// Apply auth middleware to all share routes
router.use(protect);
router.use(checkPrivateMode); // Apply private mode check if necessary for these actions

// --- Chat Sharing Routes (Recipient Actions) ---

// Get pending invitations for the logged-in user
router.get('/pending', chatController.getPendingShares);

// Accept a pending invitation
router.post('/:shareId/accept', chatController.acceptShare);

// Decline a pending invitation
router.post('/:shareId/decline', chatController.declineShare);

module.exports = router;
