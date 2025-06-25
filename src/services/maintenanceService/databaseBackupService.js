/**
 * Database Backup Service
 * 
 * Handles operations related to database backups including creation, listing, restoration, and deletion
 */
const fs = require('fs');
const path = require('path');

/**
 * Get the database path from environment or use default
 * @returns {string} Path to the database
 */
const getDbPath = () => {
  const configuredPath = process.env.DB_PATH;
  let dbPath;

  // If configured path is absolute, use it directly
  if (configuredPath && path.isAbsolute(configuredPath)) {
    dbPath = configuredPath;
  } 
  // If path is relative, resolve it correctly based on environment
  else if (configuredPath) {
    if (process.env.NODE_ENV === 'production') {
      let appRoot = process.cwd();
      
      // Look for package.json to identify app root
      for (let i = 0; i < 3; i++) {
        if (fs.existsSync(path.join(appRoot, 'package.json'))) {
          break;
        }
        appRoot = path.dirname(appRoot);
      }
      
      dbPath = path.resolve(appRoot, configuredPath);
    } else {
      dbPath = path.resolve(process.cwd(), configuredPath);
    }
  } 
  else {
    dbPath = path.resolve(process.cwd(), 'data', 'community.db');
  }

  return dbPath;
};

/**
 * Get the backup directory path
 * @returns {string} Path to the backup directory
 */
const getBackupDir = () => {
  const dbPath = getDbPath();
  let dataDir = path.dirname(dbPath);
  if (path.basename(dataDir) !== 'data') {
    dataDir = path.resolve(process.cwd(), 'data');
  }
  const backupDir = path.join(dataDir, 'backups');
  return backupDir;
};

/**
 * Ensure the backup directory exists
 * @returns {Promise<string>} Path to backup directory
 */
const ensureBackupDirExists = async () => {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create backup directory: ${err.message}`);
      throw new Error(`Cannot create backup directory: ${err.message}`);
    }
  }
  
  // Verify directory is writable
  try {
    const testFile = path.join(backupDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (err) {
    console.error(`Backup directory is not writable: ${err.message}`);
    throw new Error(`Backup directory exists but is not writable: ${err.message}`);
  }
  
  return backupDir;
};

/**
 * Create a database backup
 * @returns {Promise<Object>} Backup details
 */
const createDatabaseBackup = async () => {
  try {
    // Get database path
    const dbPath = getDbPath();
    
    // Ensure database exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}`);
    }
    
    const backupDir = await ensureBackupDirExists();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `mcp-db-backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFileName);
    await cleanupOldBackups();
    const tempBackupPath = `${backupPath}.tmp`;
    const source = fs.createReadStream(dbPath);
    const dest = fs.createWriteStream(tempBackupPath);
    
    // Copy the file with better error handling
    try {
      await new Promise((resolve, reject) => {
        source.pipe(dest);
        source.on('error', (err) => {
          console.error(`Error reading from source database: ${err.message}`);
          reject(new Error(`Failed to read database: ${err.message}`));
        });
        dest.on('error', (err) => {
          console.error(`Error writing to backup file: ${err.message}`);
          reject(new Error(`Failed to write backup: ${err.message}`));
        });
        dest.on('finish', resolve);
      });
    } catch (streamErr) {
      if (fs.existsSync(tempBackupPath)) {
        try {
          fs.unlinkSync(tempBackupPath);
        } catch (cleanupErr) {
          console.error(`Failed to clean up temporary backup file: ${cleanupErr.message}`);
        }
      }
      throw streamErr;
    }
    
    // Rename the temporary file to the final backup name
    try {
      fs.renameSync(tempBackupPath, backupPath);
    } catch (renameErr) {
      try {
        if (fs.existsSync(tempBackupPath)) {
          fs.unlinkSync(tempBackupPath);
        }
      } catch (cleanupErr) {
        console.error(`Failed to clean up after rename error: ${cleanupErr.message}`);
      }
      throw new Error(`Failed to finalize backup: ${renameErr.message}`);
    }
    
    // Always ensure proper permissions for the backup file (not just in production)
    try {
      fs.chmodSync(backupPath, 0o664);
      
      // Try to set group ownership if in production environment
      if (process.env.NODE_ENV === 'production') {
        const { execSync } = require('child_process');
        execSync(`chgrp www-data "${backupPath}"`, { stdio: 'ignore' });
      }
      
    } catch (permError) {
      console.error(`Warning: Couldn't set permissions on backup file: ${permError.message}`);
    }
    
    // Return backup details
    return {
      fileName: backupFileName,
      path: backupPath,
      size: fs.statSync(backupPath).size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error creating backup: ${error.message}`);
    throw error;
  }
};

/**
 * Clean up old backups, keeping only the 5 most recent
 * @returns {Promise<void>}
 */
const cleanupOldBackups = async () => {
  try {
    const backupDir = getBackupDir();
    
    if (!fs.existsSync(backupDir)) {
      return;
    }
    
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('mcp-db-backup-'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); 
    
    // Delete all but the 5 most recent backups
    if (files.length > 5) {
      for (let i = 5; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
      }
    }
  } catch (err) {
    console.error(`Error cleaning up old backups: ${err.message}`);
  }
};

/**
 * List all database backups
 * @returns {Promise<Array>} List of backup files with details
 */
const listDatabaseBackups = async () => {
  try {
    // Get backup directory path
    const backupDir = getBackupDir();
    
    // If backup directory doesn't exist, return empty list
    if (!fs.existsSync(backupDir)) {
      return [];
    }
    
    // Get list of backup files
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('mcp-db-backup-'));
    const backups = [];
    for (const file of files) {
      try {
        const filePath = path.join(backupDir, file);
        if (!fs.existsSync(filePath)) {
          continue;
        }
        
        const stats = fs.statSync(filePath);
        
        backups.push({
          fileName: file,
          path: filePath,
          size: stats.size,
          created: stats.mtime.toISOString(),
          displayDate: file.replace('mcp-db-backup-', '').replace('.db', '').replace(/-/g, ':')
        });
      } catch (fileError) {
        console.error(`Error processing backup file ${file}: ${fileError.message}`);
      }
    }
    
    // Sort by creation date, newest first
    return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch (error) {
    console.error(`Error listing database backups: ${error.message}`);
    throw new Error(`Failed to list database backups: ${error.message}`);
  }
};

/**
 * Restore a database from backup
 * @param {string} fileName - Name of the backup file to restore
 * @returns {Promise<Object>} Restoration details
 */
const restoreDatabaseBackup = async (fileName) => {
  try {
    if (!fileName) {
      throw new Error('Backup file name is required');
    }
    
    const sanitizedFileName = path.basename(fileName);
    const backupPath = path.join(getBackupDir(), sanitizedFileName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${sanitizedFileName}`);
    }
    const dbPath = getDbPath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preRestoreBackupFileName = `pre-restore-${timestamp}.db`;
    const preRestoreBackupPath = path.join(getBackupDir(), preRestoreBackupFileName);
    
    try {
      const source = fs.createReadStream(dbPath);
      const dest = fs.createWriteStream(preRestoreBackupPath);
      await new Promise((resolve, reject) => {
        source.pipe(dest);
        source.on('error', reject);
        dest.on('error', reject);
        dest.on('finish', resolve);
      });
      
      // Set proper permissions on pre-restore backup
      try {
        fs.chmodSync(preRestoreBackupPath, 0o664); 
        if (process.env.NODE_ENV === 'production') {
          const { execSync } = require('child_process');
          execSync(`chgrp www-data "${preRestoreBackupPath}"`, { stdio: 'ignore' });
        }
        
      } catch (permError) {
        console.error(`Warning: Couldn't set permissions on pre-restore backup file: ${permError.message}`);
      }
      
    } catch (err) {
      console.error(`Error creating pre-restore backup: ${err.message}`);
    }
    const tempDbPath = `${dbPath}.tmp`;
    const source = fs.createReadStream(backupPath);
    const dest = fs.createWriteStream(tempDbPath);
    
    await new Promise((resolve, reject) => {
      source.pipe(dest);
      source.on('error', reject);
      dest.on('error', reject);
      dest.on('finish', resolve);
    });
    
    fs.renameSync(tempDbPath, dbPath);
    try {
      fs.chmodSync(dbPath, 0o664); 
      if (process.env.NODE_ENV === 'production') {
        const { execSync } = require('child_process');
        execSync(`chgrp www-data "${dbPath}"`, { stdio: 'ignore' });
      }
      
    } catch (permError) {
      console.error(`Warning: Couldn't set permissions on restored database file: ${permError.message}`);
    }
    
    // Create a marker file with restoration info
    const markerPath = path.join(process.cwd(), 'data', 'restored_backup_info.json');
    const markerData = {
      restoredFromBackup: true,
      backupName: sanitizedFileName,
      restoredAt: new Date().toISOString()
    };
    
    try {
      fs.writeFileSync(markerPath, JSON.stringify(markerData, null, 2));
    } catch (markerErr) {
      console.error(`Error writing restore marker file: ${markerErr.message}`);
    }
    
    // Return success response data
    return {
      fileName: sanitizedFileName,
      timestamp: new Date().toISOString(),
      preRestoreBackup: preRestoreBackupFileName
    };
  } catch (error) {
    console.error(`Error restoring database: ${error.message}`);
    throw error;
  }
};

/**
 * Delete a database backup
 * @param {string} fileName - Name of the backup file to delete
 * @returns {Promise<boolean>} Success indicator
 */
const deleteDatabaseBackup = async (fileName) => {
  try {
    if (!fileName) {
      throw new Error('Backup file name is required');
    }
    const sanitizedFileName = path.basename(fileName);
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, sanitizedFileName);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${sanitizedFileName}`);
    }
    
    try {
      const testFile = path.join(backupDir, '.delete_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (permErr) {
      throw new Error(`Cannot delete backup: Permission denied (${permErr.message})`);
    }
    
    try {
      fs.unlinkSync(backupPath);
      return true;
    } catch (unlinkErr) {
      throw new Error(`Failed to delete file: ${unlinkErr.message}`);
    }
  } catch (error) {
    console.error(`Error deleting database backup: ${error.message}`);
    throw error;
  }
};

/**
 * Upload a database backup
 * @param {Object} uploadedFile - The uploaded file object with file details and data
 * @returns {Promise<Object>} Upload details
 */
const uploadDatabaseBackup = async (uploadedFile) => {
  try {
    if (!uploadedFile) {
      throw new Error('No backup file provided');
    }
    
    const validExtensions = ['.db'];
    const fileExt = path.extname(uploadedFile.name).toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      throw new Error(`Invalid file type. Only ${validExtensions.join(', ')} files are allowed`);
    }
    if (!uploadedFile.name.startsWith('mcp-db-backup-')) {
      throw new Error('Invalid backup file name format. Must start with "mcp-db-backup-"');
    }
    const backupDir = await ensureBackupDirExists();
    const destPath = path.join(backupDir, uploadedFile.name);
    if (fs.existsSync(destPath)) {
      throw new Error(`A backup with the name ${uploadedFile.name} already exists`);
    }
    
    // This function may need to be adjusted based on how file uploads are handled
    if (typeof uploadedFile.mv === 'function') {
      await uploadedFile.mv(destPath);
    } else if (uploadedFile.tempFilePath) {
      fs.copyFileSync(uploadedFile.tempFilePath, destPath);
      
      // Clean up the temporary file
      try {
        fs.unlinkSync(uploadedFile.tempFilePath);
      } catch (unlinkError) {
        console.error('Error deleting temporary file:', unlinkError);
      }
    } else {
      throw new Error('Unsupported file upload method');
    }

    try {
      fs.chmodSync(destPath, 0o664); 
      if (process.env.NODE_ENV === 'production') {
        const { execSync } = require('child_process');
        execSync(`chgrp www-data "${destPath}"`, { stdio: 'ignore' });
      }
      
    } catch (permError) {
      console.error(`Warning: Couldn't set permissions on uploaded backup file: ${permError.message}`);
    }
    await cleanupOldBackups();
    const stats = fs.statSync(destPath);
    
    return {
      fileName: uploadedFile.name,
      path: destPath,
      size: stats.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error uploading database backup: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
  deleteDatabaseBackup,
  uploadDatabaseBackup,
  cleanupOldBackups,
  getDbPath,
  getBackupDir
};
