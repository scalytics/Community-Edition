const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const { getFileUploadMiddleware } = require('../config/middleware');

const uploader = getFileUploadMiddleware();
router.post('/upload-avatar', uploader, protect, fileController.uploadAvatar);
router.post('/', uploader, protect, fileController.uploadFile);

router.get('/:type/:filename', fileController.getFile);

module.exports = router;
