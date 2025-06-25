/**
 * Model Directory Service
 * 
 * Handles operations related to model directories including listing, checking, and deletion
 */
const fs = require('fs');
const path = require('path');
const Model = require('../../models/Model');
const diskUtils = require('../../utils/diskUtils');
const db = require('../../config/database');

// Get models directory path - ensure absolute path is used, especially in production
const getModelsDir = () => {
  const configuredPath = process.env.MODELS_DIR;
  let modelsDirPath;

  // If path is absolute, use it directly
  if (configuredPath && path.isAbsolute(configuredPath)) {
    modelsDirPath = configuredPath;
  } 
  // If path is relative, resolve it based on current working directory or app root
  else if (configuredPath) {
    // For production, convert relative paths to absolute
    if (process.env.NODE_ENV === 'production') {
      // Try to find the application root (parent of "src" directory)
      let appRoot = process.cwd();
      
      // Walk up to three levels up to find a directory with package.json (app root)
      for (let i = 0; i < 3; i++) {
        if (fs.existsSync(path.join(appRoot, 'package.json'))) {
          break;
        }
        appRoot = path.dirname(appRoot);
      }
      
      modelsDirPath = path.resolve(appRoot, configuredPath);
    } else {
      // For development, can use relative paths
      modelsDirPath = path.resolve(process.cwd(), configuredPath);
    }
  } 
  // Default path if nothing configured
  else {
    modelsDirPath = path.resolve(process.cwd(), 'models');
  }

  return modelsDirPath;
};

// Resolve models directory path once
const MODELS_DIR = getModelsDir();

  // Make sure the models directory exists with better error handling
  try {
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
      
      // Verify directory was created
      if (!fs.existsSync(MODELS_DIR)) {
        throw new Error(`Failed to create models directory: ${MODELS_DIR}`);
      }
      
      // Set proper permissions for new directory in production
      if (process.env.NODE_ENV === 'production') {
        try {
          // Set directory permissions to 2775 (rwxrwsr-x)
          fs.chmodSync(MODELS_DIR, 0o2775);
          
          // Group ownership (e.g., www-data) is handled by deployment/update scripts
          // (like fix_maintenance_permissions.sh or saas/modules/fix_permissions.sh)
          // as Node.js often lacks permissions for chgrp.
          console.log('Skipping chgrp in Node.js; deployment scripts handle group ownership.');
        } catch (permSetErr) {
          console.log(`Note: Initial permission setting failed: ${permSetErr.message}`); // Keep chmod error logging
          console.log('The maintenance permissions script will handle this during deployment/update');
        }
      }
    }
    
    // Check directory permissions
    try {
      const testFile = path.join(MODELS_DIR, '.permission_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (permErr) {
      console.error(`Models directory exists but is not writable: ${permErr.message}`);
    }
  } catch (err) {
    console.error(`Error managing models directory: ${err.message}`);
    // Continue execution - we'll handle directory access errors in the specific functions
  }

/**
 * Check if a directory contains model files (.gguf, .bin, etc.)
 * @param {string} dirPath - Path to the directory to check
 * @returns {Promise<Object>} - Object containing boolean result and list of found model files
 */
const directoryContainsModelFiles = async (dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
    const foundModelFiles = [];
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          const extension = path.extname(file).toLowerCase();
          
          if (modelExtensions.includes(extension)) {
            console.log(`Found model file in directory: ${file}`);
            foundModelFiles.push(file);
          }
        } else if (stats.isDirectory()) {
          // Recursively check subdirectories
          const subDirResult = await directoryContainsModelFiles(filePath);
          if (subDirResult.containsModelFiles) {
            // Add subdirectory prefix to filenames
            const subDirFiles = subDirResult.modelFiles.map(f => `${file}/${f}`);
            foundModelFiles.push(...subDirFiles);
          }
        }
      } catch (statErr) {
        console.error(`Error accessing file ${file}: ${statErr.message}`);
        continue;
      }
    }
    
    return {
      containsModelFiles: foundModelFiles.length > 0,
      modelFiles: foundModelFiles
    };
  } catch (error) {
    console.error(`Error checking directory for model files: ${error.message}`);
    return {
      containsModelFiles: false,
      modelFiles: []
    };
  }
};

/**
 * Check if any model in the database references this directory
 * @param {string} dirPath - Path to the directory to check
 * @returns {Promise<boolean>} - Whether any model references this directory
 */
const isDirectoryReferencedInDatabase = async (dirPath) => {
  try {
    // Get all models from the database
    const models = await Model.getAll(false);
    
    // Normalize the directory path for comparison
    const normalizedDirPath = path.normalize(dirPath).toLowerCase();
    
    // Check if any model references this directory
    for (const model of models) {
      if (!model.model_path) continue;
      
      const modelPath = path.normalize(model.model_path).toLowerCase();
      
      if (modelPath.startsWith(normalizedDirPath) || 
          modelPath.includes(path.basename(normalizedDirPath).toLowerCase())) {
        console.log(`Directory is referenced by model in database: ${model.name} (${model.id})`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking if directory is referenced in database: ${error.message}`);
    return false;
  }
};

/**
 * List all model directories and stale database entries
 * @returns {Promise<Array>} List of model directories with details
 */
const listModelDirectories = async () => {
  try {
    const directories = [];
    
    // 1. Process filesystem directories (existing behavior)
    if (fs.existsSync(MODELS_DIR)) {
      const dirEntries = fs.readdirSync(MODELS_DIR, { withFileTypes: true });
      
      // Filter to get only directories, excluding hidden files, bin, config, and lost+found
      const filteredEntries = dirEntries.filter(entry => {
        // Skip ., .gitkeep, bin, config, and lost+found directories
        if (entry.name.startsWith('.') || entry.name === 'bin' || entry.name === 'config' || entry.name === 'lost+found') {
          return false;
        }
        
        // Keep only directories
        return entry.isDirectory();
      });
      
      // Process each directory into the required format
      const fsDirectories = await Promise.all(filteredEntries.map(async entry => {
        const dirPath = path.join(MODELS_DIR, entry.name);
        let hasConfig = false;
        let fileCount = 0;
        let files = [];
        let totalSize = 0;
        
        try {
          // Check if directory has config.json
          hasConfig = fs.existsSync(path.join(dirPath, 'config.json'));
          
          // List files and calculate size
          files = fs.readdirSync(dirPath);
          fileCount = files.length;
          
          // Calculate total size of all files
          for (const file of files) {
            try {
              const filePath = path.join(dirPath, file);
              const stats = fs.statSync(filePath);
              if (stats.isFile()) {
                totalSize += stats.size;
              }
            } catch (fileErr) {
              console.log(`Error processing file ${file}: ${fileErr.message}`);
            }
          }
        } catch (err) {
          console.error(`Error reading directory ${entry.name}: ${err.message}`);
        }
        
        // Get directory stats
        let stats = { birthtime: new Date(), mtime: new Date() };
        try {
          stats = fs.statSync(dirPath);
        } catch (err) {
          console.error(`Error getting stats for ${entry.name}: ${err.message}`);
        }
        
        // Check if directory contains model files
        const containsModelFiles = await directoryContainsModelFiles(dirPath);
        
        // Check if directory is referenced in database
        const isReferencedInDB = await isDirectoryReferencedInDatabase(dirPath);
        
        return {
          name: entry.name,
          path: dirPath,
          created: stats.birthtime,
          modified: stats.mtime,
          fileCount,
          totalSize,
          hasConfig,
          files,
          isActive: containsModelFiles || isReferencedInDB,
          containsModelFiles,
          isReferencedInDB,
          type: 'filesystem'
        };
      }));
      
      directories.push(...fsDirectories);
    }
    
    
    return directories;
  } catch (error) {
    console.error('Error listing model directories:', error);
    throw error;
  }
};

/**
 * Delete a model directory 
 * @param {string} dirName - Name of the directory to delete
 * @returns {Promise<Object>} Result of the deletion operation
 */
const deleteModelDirectory = async (dirName) => {
  try {
    if (!dirName) {
      throw new Error('Directory name is required');
    }
    
    // Construct full path and perform safety checks
    const dirPath = path.join(MODELS_DIR, dirName);
    
    // Safety check: Directory must exist
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirName}`);
    }
    
    // Safety check: Must be a directory
    if (!fs.statSync(dirPath).isDirectory()) {
      throw new Error(`Not a directory: ${dirName}`);
    }
    
    // Safety check: Must be within models directory
    const normalizedPath = path.normalize(dirPath);
    const normalizedModelsDir = path.normalize(MODELS_DIR);
    
    if (!normalizedPath.startsWith(normalizedModelsDir) || normalizedPath === normalizedModelsDir) {
      throw new Error(`Security error: Cannot delete outside of models directory or the models directory itself`);
    }
    
    // Check if directory contains model files
    const containsModelFiles = await directoryContainsModelFiles(dirPath);
    
    // Check if directory is referenced in the database
    const isReferencedInDatabase = await isDirectoryReferencedInDatabase(dirPath);
    
    // If directory contains model files or is referenced in database, prevent deletion
    if (containsModelFiles.containsModelFiles || isReferencedInDatabase) {
      throw new Error(`Cannot delete directory: ${dirName} because it ${containsModelFiles.containsModelFiles ? 'contains model files' : ''} ${containsModelFiles.containsModelFiles && isReferencedInDatabase ? 'and' : ''} ${isReferencedInDatabase ? 'is referenced in the database' : ''}. Please remove from model manager first.`);
    }
    
    // Log what we're trying to delete
    console.log(`Attempting to delete model directory: ${dirPath}`);
    
    // Use our disk utility for directory removal
    const deleted = await diskUtils.removeDirectory(dirPath);
    
    // Check final result
    const success = !await diskUtils.pathExists(dirPath);
    const message = success 
      ? `Successfully deleted model directory: ${dirName}`
      : `Failed to delete model directory: ${dirName}`;
    
    return {
      success,
      message,
      data: {
        dirName,
        dirPath,
        deleted
      }
    };
  } catch (error) {
    console.error('Error deleting model directory:', error);
    throw error;
  }
};

/**
 * Force delete a model directory even if it contains model files
 * Will still prevent deletion if the directory is referenced in the database
 * @param {string} dirName - Name of the directory to delete
 * @returns {Promise<Object>} Result of the deletion operation
 */
const forceDeleteModelDirectory = async (dirName) => {
  try {
    if (!dirName) {
      throw new Error('Directory name is required');
    }
    
    // Construct full path and perform safety checks
    const dirPath = path.join(MODELS_DIR, dirName);
    
    // Safety check: Directory must exist
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirName}`);
    }
    
    // Safety check: Must be a directory
    if (!fs.statSync(dirPath).isDirectory()) {
      throw new Error(`Not a directory: ${dirName}`);
    }
    
    // Safety check: Must be within models directory
    const normalizedPath = path.normalize(dirPath);
    const normalizedModelsDir = path.normalize(MODELS_DIR);
    
    if (!normalizedPath.startsWith(normalizedModelsDir) || normalizedPath === normalizedModelsDir) {
      throw new Error(`Security error: Cannot delete outside of models directory or the models directory itself`);
    }
    
    // Check if directory contains model files
    const modelFilesResult = await directoryContainsModelFiles(dirPath);
    
    // Check if directory is referenced in the database
    const isReferencedInDatabase = await isDirectoryReferencedInDatabase(dirPath);
    
    // CRITICAL: If directory is referenced in database, prevent deletion
    if (isReferencedInDatabase) {
      throw new Error(`Cannot force delete directory: ${dirName} because it is referenced in the database. Please remove the model from the model manager first.`);
    }
    
    // Log what we're trying to delete
    console.log(`Force deleting model directory (including model files): ${dirPath}`);
    
    // Use our disk utility for directory removal
    const deleted = await diskUtils.removeDirectory(dirPath);
    
    // Check final result
    const success = !await diskUtils.pathExists(dirPath);
    const message = success
      ? `Successfully force deleted model directory: ${dirName}`
      : `Failed to force delete model directory: ${dirName}`;
    
    return {
      success,
      message,
      data: {
        dirName,
        dirPath,
        deleted,
        containedModelFiles: modelFilesResult.containsModelFiles,
        modelFiles: modelFilesResult.modelFiles
      }
    };
  } catch (error) {
    console.error('Error force deleting model directory:', error);
    throw error;
  }
};



/**
 * Get system storage information
 * @returns {Promise<Object>} Storage information
 */
const getStorageInfo = async () => {
  try {
    // Get models directory info
    let modelsSize = 0;
    let modelCount = 0;
    let modelDirectories = [];
    
    if (fs.existsSync(MODELS_DIR)) {
      const entries = fs.readdirSync(MODELS_DIR, { withFileTypes: true });
      
      // Count directories
      modelDirectories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      modelCount = modelDirectories.length;
      
      // Calculate total size using our utility
      modelsSize = await diskUtils.getDirectorySize(MODELS_DIR);
    }
    
    const diskInfo = await diskUtils.getDiskSpace(MODELS_DIR);
    
    return {
      modelsDirectory: MODELS_DIR,
      modelsSize,
      modelCount,
      modelDirectories,
      diskInfo
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    // Return a structure that the frontend can handle without crashing
    return {
      modelsDirectory: MODELS_DIR,
      modelsSize: 0,
      modelCount: 0,
      modelDirectories: [],
      diskInfo: { total: 0, used: 0, available: 0, success: false, error: error.message }
    };
  }
};

module.exports = {
  listModelDirectories,
  deleteModelDirectory,
  forceDeleteModelDirectory,
  getStorageInfo,
  directoryContainsModelFiles,
  isDirectoryReferencedInDatabase,
  MODELS_DIR
};
