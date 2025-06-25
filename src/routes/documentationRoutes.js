const express = require('express');
const { getDocumentationList, getDocumentation } = require('../controllers/documentationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Documentation routes - making them public
// Remove authentication requirement for documentation
// router.use(protect);

// Get list of available documentation
router.get('/list', getDocumentationList);

// Get specific documentation by ID (including subdirectories with slashes)
router.get('/:id(*)', getDocumentation);

module.exports = router;
