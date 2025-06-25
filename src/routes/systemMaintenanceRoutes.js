const express = require('express');
const router = express.Router();
const systemMaintenanceController = require('../controllers/systemMaintenanceController');
const { protect, admin } = require('../middleware/authMiddleware');
const fileUpload = require('express-fileupload');

const fileUploadMiddleware = fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, 
  createParentPath: true,
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  useTempFiles: true,
  tempFileDir: '/tmp/',
  safeFileNames: true,
  preserveExtension: 4,
  debug: process.env.NODE_ENV !== 'production',
  uploadTimeout: 60000
});

// All routes require admin privileges
router.use(protect);
router.use(admin);

// Routes for model directory maintenance
router.get('/model-directories', systemMaintenanceController.listModelDirectories);
router.delete('/model-directories/:dirName', systemMaintenanceController.deleteModelDirectory);
router.delete('/model-directories/:dirName/force', systemMaintenanceController.forceDeleteModelDirectory);
router.get('/storage-info', systemMaintenanceController.getStorageInfo);
router.get('/database-backups', systemMaintenanceController.listDatabaseBackups);
router.post('/database-backups', systemMaintenanceController.createDatabaseBackup);
router.get('/database-backups/:fileName', systemMaintenanceController.downloadDatabaseBackup);
router.post('/database-backups/:fileName/restore', systemMaintenanceController.restoreDatabaseBackup);
router.delete('/database-backups/:fileName', systemMaintenanceController.deleteDatabaseBackup);
router.post('/database-backups/upload', fileUploadMiddleware, systemMaintenanceController.uploadDatabaseBackup);
router.get('/info', systemMaintenanceController.getSystemInfo);
router.post('/restart', systemMaintenanceController.restartServer);

module.exports = router;
