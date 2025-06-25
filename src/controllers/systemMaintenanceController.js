/**
 * System Maintenance Controller
 * 
 * Handles API routes related to system maintenance, database backups, and model management
 * Uses modular services for business logic implementation
 */
const { 
  modelDirectoryService, 
  databaseBackupService,
  systemInfoService 
} = require('../services/maintenanceService');

/**
 * List all model directories
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.listModelDirectories = async (req, res) => {
  try {
    const directories = await modelDirectoryService.listModelDirectories();
    
    res.status(200).json({
      success: true,
      message: `Found ${directories.length} model directories`,
      data: directories
    });
  } catch (error) {
    console.error('Error listing model directories:', error);
    res.status(500).json({
      success: false,
      message: 'Error listing model directories',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Delete a model directory
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deleteModelDirectory = async (req, res) => {
  try {
    const { dirName } = req.params;
    
    if (!dirName) {
      return res.status(400).json({
        success: false,
        message: 'Directory name is required'
      });
    }
    
    const result = await modelDirectoryService.deleteModelDirectory(dirName);
    
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    // Handle specific error messages that should be sent to the client
    if (error.message.includes('not found') || 
        error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Security error') ||
        error.message.includes('Cannot delete') ||
        error.message.includes('referenced in the database') ||
        error.message.includes('contains model files')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Not a directory')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    console.error('Error deleting model directory:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting model directory',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Get system storage information
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getStorageInfo = async (req, res) => {
  try {
    const storageInfo = await modelDirectoryService.getStorageInfo();
    res.status(200).json({
      success: true,
      data: storageInfo
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting storage info',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Create a database backup
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.createDatabaseBackup = async (req, res) => {
  try {
    const backupDetails = await databaseBackupService.createDatabaseBackup();
    
    res.status(200).json({
      success: true,
      message: 'Database backup created successfully',
      data: backupDetails
    });
  } catch (error) {
    console.error('Error creating database backup:', error);
    const errorMessage = error.message || 'Unknown error';
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: errorMessage
    });
  }
};

/**
 * Get list of available database backups
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.listDatabaseBackups = async (req, res) => {
  try {
    const backups = await databaseBackupService.listDatabaseBackups();
    
    res.status(200).json({
      success: true,
      message: `Found ${backups.length} database backups`,
      data: backups
    });
  } catch (error) {
    console.error('Error listing database backups:', error);
    res.status(500).json({
      success: false,
      message: 'Error listing database backups',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Download a database backup
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.downloadDatabaseBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Backup file name is required'
      });
    }
    
    const sanitizedFileName = path.basename(fileName);
    const backupPath = path.join(databaseBackupService.getBackupDir(), sanitizedFileName);
    
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        message: `Backup file not found: ${sanitizedFileName}`
      });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedFileName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    const fileStream = fs.createReadStream(backupPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading database backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading database backup',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Force delete a model directory even if it contains model files
 * Will still prevent deletion if the directory is referenced in the database
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.forceDeleteModelDirectory = async (req, res) => {
  try {
    const { dirName } = req.params;
    
    if (!dirName) {
      return res.status(400).json({
        success: false,
        message: 'Directory name is required'
      });
    }
    
    const result = await modelDirectoryService.forceDeleteModelDirectory(dirName);
    
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    if (error.message.includes('not found') || 
        error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Security error') ||
        error.message.includes('Cannot force delete') ||
        error.message.includes('referenced in the database')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Not a directory')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    console.error('Error force deleting model directory:', error);
    res.status(500).json({
      success: false,
      message: 'Error force deleting model directory',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};


/**
 * Restore a database backup
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.restoreDatabaseBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Backup file name is required'
      });
    }
    
    const result = await databaseBackupService.restoreDatabaseBackup(fileName);
    
    res.status(200).json({
      success: true,
      message: 'Database restored successfully',
      data: result
    });
  } catch (error) {
    console.error('Error restoring database backup:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error restoring database backup',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Delete a database backup
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deleteDatabaseBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Backup file name is required'
      });
    }
    
    await databaseBackupService.deleteDatabaseBackup(fileName);
    
    res.status(200).json({
      success: true,
      message: `Backup file deleted: ${fileName}`
    });
  } catch (error) {
    console.error('Error deleting database backup:', error);
    
    // Handle specific errors
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('Permission denied')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    
    const errorMessage = error.message || 'Unknown error';
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: errorMessage
    });
  }
};

/**
 * Upload a database backup
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.uploadDatabaseBackup = async (req, res) => {
  try {
    // Check if files were uploaded at all
    if (!req.files) {
      console.error('req.files is undefined or null');
      return res.status(400).json({
        success: false,
        message: 'No files uploaded - file upload middleware may not be configured correctly'
      });
    }
    
    // Check if there are any files in the request
    if (Object.keys(req.files).length === 0) {
      console.error('req.files is empty:', req.files);
      return res.status(400).json({
        success: false,
        message: 'No backup file uploaded'
      });
    }
    
    const uploadedFile = req.files.backupFile;
    
    if (!uploadedFile) {
      console.error('No backupFile field in request.files');
      console.error('Available files:', Object.keys(req.files));
      
      // Try to find any file in req.files as a fallback
      const firstFileKey = Object.keys(req.files)[0];
      const fallbackFile = firstFileKey ? req.files[firstFileKey] : null;
      
      if (fallbackFile) {
        return res.status(400).json({
          success: false,
          message: `File field name mismatch - found "${firstFileKey}" but expected "backupFile"`
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'No backup file found in the request'
        });
      }
    } // Closing brace moved from here

    const uploadResult = await databaseBackupService.uploadDatabaseBackup(uploadedFile);
    
    res.status(200).json({
      success: true,
      message: 'Database backup uploaded successfully',
      data: uploadResult
    });
  } 
  catch (error) {
    console.error('Error uploading database backup:', error);
    if (error.message.includes('Invalid file type') || 
        error.message.includes('Invalid backup file name format')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error uploading database backup',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};

/**
 * Get system information
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getSystemInfo = async (req, res) => {
  try {
    const systemInfo = await systemInfoService.getSystemInfo();
    
    res.status(200).json({
      success: true,
      data: systemInfo
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    const errorMessage = error.message || 'Unknown error';
    
    res.status(500).json({
      success: false,
      message: `Error getting system info: ${errorMessage}`,
      error: errorMessage
    });
  }
};

/**
 * Restart the server
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.restartServer = async (req, res) => {
  try {
    const result = await systemInfoService.restartServer();
    
    res.status(200).json({
      success: true,
      message: 'Server restart initiated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error restarting server:', error);
    const errorMessage = error.message || 'Unknown error';
    
    res.status(500).json({
      success: false,
      message: `Error restarting server: ${errorMessage}`,
      error: errorMessage
    });
  }
};

const fs = require('fs');
const path = require('path');
