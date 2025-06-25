const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Default model directory (where models are stored)
const MODELS_DIR = process.env.MODELS_DIR || path.join(process.cwd(), 'models');

// Initialize the model directory path

/**
 * Model file utility functions
 */
const modelFileUtils = {
  /**
   * Directly find and delete a model directory by name pattern
   * @param {string} modelName - The model name to search for
   * @returns {Promise<{deleted: boolean, path: string|null}>} - Result of deletion 
   */
  deleteModelDirectoryByName: async (modelName) => {
    if (!modelName) return { deleted: false, path: null };
    
    console.log(`Looking for model directories matching: ${modelName}`);
    
    // Normalize the model name for comparison (for matching filenames)
    const normalizedName = modelName.toLowerCase().replace(/[\s_.-]+/g, '-');
    
    try {
      // Get all entries in the models directory
      const entries = await fs.readdir(MODELS_DIR, { withFileTypes: true });
      
      console.log(`Checking ${entries.length} entries in models directory for matches to: ${modelName}`);
      
      // Process directories one by one
      for (const entry of entries) {
        // Skip non-directories, hidden files, and special directories
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }
        
        const dirName = entry.name.toLowerCase();
        
        // Skip bin directory
        if (dirName === 'bin') {
          console.log(`Skipping bin directory`);
          continue;
        }
        
        const dirPath = path.join(MODELS_DIR, entry.name);
        
        // Skip the models directory itself
        if (dirPath === MODELS_DIR) {
          console.log(`Skipping models directory itself`);
          continue;
        }
        
        // Check for various forms of the model name
        const isMatch = dirName.includes(normalizedName) || 
                        dirName.includes(modelName.toLowerCase()) ||
                        normalizedName.includes(dirName);
                        
        if (isMatch) {
          console.log(`Found potential model directory: ${dirPath}`);
          
          // Try to delete the directory
          const deleted = await modelFileUtils.safeDeleteModelDirectory(dirPath);
          if (deleted) {
            console.log(`Successfully deleted model directory: ${dirPath}`);
            return { deleted: true, path: dirPath };
          }
        }
      }
      
      console.log(`No matching directories found or could not delete directories for model: ${modelName}`);
      return { deleted: false, path: null };
    } catch (err) {
      console.error(`Error searching for model directories: ${err.message}`);
      return { deleted: false, path: null };
    }
  },

  /**
   * Delete model files for a model
   * @param {object} model - The model object with path and metadata
   * @returns {Promise<{deleted: boolean, path: string|null}>} - Result of deletion
   */
  deleteModelFiles: async (model) => {
    if (!model || !model.model_path) {
      return { deleted: false, path: null };
    }
    
    console.log(`Attempting to delete files for model: ${model.name}`);
    
    let fileDeleted = false;
    let dirDeleted = false;
    let deletedPath = null;
    
    // First, try to directly delete any directories matching the model name
    // This is the most reliable approach, especially for models downloaded via the UI
    const directoryDeleted = await modelFileUtils.deleteModelDirectoryByName(model.name);
    if (directoryDeleted.deleted) {
      return directoryDeleted;
    }
    
    // If that failed, check if the model is in a subdirectory of the models folder
    const modelDir = path.dirname(model.model_path);
    const isInModelSubdir = modelDir.startsWith(MODELS_DIR) && modelDir !== MODELS_DIR;
    
    if (isInModelSubdir) {
      console.log(`Model appears to be in a subdirectory: ${modelDir}`);
      
      // Try to delete the entire directory
      dirDeleted = await modelFileUtils.safeDeleteModelDirectory(modelDir);
      if (dirDeleted) {
        console.log(`Successfully deleted model directory: ${modelDir}`);
        return { deleted: true, path: modelDir };
      }
    }
    
    // If directory deletion failed or wasn't attempted, try the individual file
    fileDeleted = await modelFileUtils.safeDeleteFile(model.model_path);
    if (fileDeleted) {
      deletedPath = model.model_path;
      
      // After deleting the file, try again to delete its parent directory
      // This is important as we want to clean up empty directories
      if (isInModelSubdir) {
        console.log(`File deleted, now attempting to clean up parent directory: ${modelDir}`);
        dirDeleted = await modelFileUtils.safeDeleteModelDirectory(modelDir);
        if (dirDeleted) {
          console.log(`Successfully deleted parent directory after file deletion: ${modelDir}`);
          return { deleted: true, path: modelDir };
        }
      }
      
      // If we couldn't delete the directory but deleted the file, that's still a success
      return { deleted: true, path: deletedPath };
    }
    
    // Try the model file in the standard models directory
    const filename = path.basename(model.model_path);
    const standardPath = path.join(MODELS_DIR, filename);
    
    fileDeleted = await modelFileUtils.safeDeleteFile(standardPath);
    if (fileDeleted) {
      deletedPath = standardPath;
      
      // After deleting the standard path file, try again to delete the subdirectory if it exists
      if (isInModelSubdir) {
        dirDeleted = await modelFileUtils.safeDeleteModelDirectory(modelDir);
        if (dirDeleted) {
          return { deleted: true, path: modelDir };
        }
      }
      
      return { deleted: true, path: deletedPath };
    }
    
    // If that failed too, try finding files by model name pattern
    const possiblePaths = modelFileUtils.getPossibleModelPaths(model);
    
    for (const possiblePath of possiblePaths) {
      try {
        const stats = await fs.stat(possiblePath);
        if (stats.isDirectory()) {
          const dirDeleted = await modelFileUtils.safeDeleteModelDirectory(possiblePath);
          if (dirDeleted) {
            return { deleted: true, path: possiblePath };
          }
        } else if (stats.isFile()) {
          const fileDeleted = await modelFileUtils.safeDeleteFile(possiblePath);
          if (fileDeleted) {
            return { deleted: true, path: possiblePath };
          }
        }
      } catch (err) {
        // Path doesn't exist, continue to next
      }
    }
    
    // If everything failed, try a more aggressive search through models directory
    try {
      const dirEntries = await fs.readdir(MODELS_DIR);
      const modelName = model.name.toLowerCase().replace(/\s+/g, '-');
      
      // Look for directories or files that match the model name
      for (const entry of dirEntries) {
        const entryPath = path.join(MODELS_DIR, entry);
        const stats = await fs.stat(entryPath);
        
        const entryLower = entry.toLowerCase();
        const matchesName = entryLower.includes(modelName);
        
        if (matchesName || (model.model_path && entryLower.includes(path.basename(model.model_path).toLowerCase()))) {
          if (stats.isDirectory()) {
            const dirDeleted = await modelFileUtils.safeDeleteModelDirectory(entryPath);
            if (dirDeleted) {
              return { deleted: true, path: entryPath };
            }
          } else if (stats.isFile()) {
            const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
            if (modelExtensions.some(ext => entryLower.endsWith(ext)) && stats.size > 1024 * 1024) {
              const fileDeleted = await modelFileUtils.safeDeleteFile(entryPath);
              if (fileDeleted) {
                return { deleted: true, path: entryPath };
              }
            }
          }
        }
      }
    } catch (err) {
      console.log(`Error searching models directory: ${err.message}`);
    }
    
    console.log(`Failed to delete files for model: ${model.name}`);
    return { deleted: false, path: null };
  },

  /**
   * Get possible paths where a model might be stored
   * @param {object} model - Model object containing path and metadata
   * @returns {string[]} - Array of possible paths
   */
  getPossibleModelPaths: (model) => {
    const paths = [];
    if (!model.model_path) return paths;
    
    const storedPath = model.model_path;
    paths.push(storedPath);
    
    // Add absolute path if relative
    if (!path.isAbsolute(storedPath)) {
      paths.push(path.resolve(process.cwd(), storedPath));
    }
    
    // Add normalized model name
    const modelNameNoExt = path.basename(model.name, path.extname(model.name))
                          .replace(/\s+/g, '-').toLowerCase();
    paths.push(path.join(MODELS_DIR, modelNameNoExt));
    
    // Add directory name without extension
    const baseNameNoExt = path.basename(storedPath, path.extname(storedPath));
    paths.push(path.join(MODELS_DIR, baseNameNoExt));
    
    // Add model name directly
    paths.push(path.join(MODELS_DIR, model.name));
    
    // Add path from parts (for vendor/model formats)
    if (storedPath.includes('/')) {
      const pathParts = storedPath.split('/');
      const lastPart = pathParts[pathParts.length - 2];
      if (lastPart) {
        paths.push(path.join(MODELS_DIR, lastPart));
      }
    }
    
    // Add paths for Hugging Face models
    if (model.description && model.description.includes('Hugging Face')) {
      const hfMatch = model.description.match(/Hugging Face model: ([^/\s]+\/[^/\s]+)/i);
      if (hfMatch && hfMatch[1]) {
        const [, modelId] = hfMatch[1].split('/');
        if (modelId) {
          paths.push(path.join(MODELS_DIR, modelId));
          paths.push(path.join(MODELS_DIR, modelId.toLowerCase()));
        }
      }
    }
    
    // Add common model names paths
    const commonModelNames = ['phi-2', 'llama', 'mistral', 'zephyr', 'mpt', 'gemma'];
    for (const name of commonModelNames) {
      if (modelNameNoExt.includes(name) || 
          (model.description && model.description.toLowerCase().includes(name))) {
        paths.push(path.join(MODELS_DIR, name));
      }
    }
    
    // Remove duplicates and return
    return [...new Set(paths)];
  },
  
  /**
   * Find all model files in the models directory
   * @returns {Promise<Array<{path: string, name: string, size: number}>>} Array of model files
   */
  findAllModelFiles: async () => {
    try {
      const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
      const modelFiles = [];
      
      // Read all files in the models directory
      const files = await fs.readdir(MODELS_DIR);
      
      // Check each file
      for (const file of files) {
        const filePath = path.join(MODELS_DIR, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (modelExtensions.includes(ext) && stats.size > 1024 * 1024) { // Larger than 1MB
              modelFiles.push({
                path: filePath,
                name: file,
                size: stats.size
              });
            }
          }
        } catch (err) {
          console.log(`Error checking file ${filePath}: ${err.message}`);
        }
      }
      
      return modelFiles;
    } catch (err) {
      console.error(`Error reading models directory: ${err.message}`);
      return [];
    }
  },
  
  /**
   * Safely delete a file
   * @param {string} filePath - Path to the file to delete
   * @returns {Promise<boolean>} Whether the deletion was successful
   */
  safeDeleteFile: async (filePath) => {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        await fs.unlink(filePath);
        console.log(`Successfully deleted file: ${filePath}`);
        return true;
      } else {
        console.log(`Not deleting ${filePath} as it is not a file`);
        return false;
      }
    } catch (err) {
      console.log(`Error deleting file ${filePath}: ${err.message}`);
      return false;
    }
  },
  
  /**
   * Force recursive deletion of a directory using the external bash script
   * @param {string} dirPath - Path to the directory to delete
   * @returns {Promise<boolean>} Whether the deletion was successful
   */
  forceDeleteDirectory: async (dirPath) => {
    try {
      // IMPORTANT SAFETY CHECK: Ensure this is under the models directory
      const normalizedDirPath = path.normalize(dirPath);
      const normalizedModelsDir = path.normalize(MODELS_DIR);
      
      if (!normalizedDirPath.startsWith(normalizedModelsDir)) {
        console.log(`Safety check failed: Directory ${dirPath} is not within models directory ${MODELS_DIR}`);
        return false;
      }
      
      // Safety check: Don't delete the models directory itself
      if (normalizedDirPath === normalizedModelsDir) {
        console.log(`Safety check failed: Cannot delete the models directory itself`);
        return false;
      }
      
      console.log(`Using rm -rf to forcefully delete directory: ${dirPath}`);
      
      try {
        // Use the system rm command to delete the directory
        await execPromise(`rm -rf "${dirPath}"`);
        
        // Verify the directory is actually gone
        try {
          await fs.stat(dirPath);
          console.log(`Warning: Directory still exists after rm -rf command`);
          return false;
        } catch (statErr) {
          // This is good - the directory is gone
          console.log(`Successfully deleted directory: ${dirPath}`);
          return true;
        }
      } catch (rmErr) {
        console.error(`Error deleting directory with rm command: ${rmErr.message}`);
        return false;
      }
    } catch (err) {
      console.error(`Force delete error for ${dirPath}: ${err.message}`);
      return false;
    }
  },

  /**
   * Safely delete a model directory and its contents
   * @param {string} dirPath - Path to the directory to delete
   * @returns {Promise<boolean>} Whether the deletion was successful
   */
  safeDeleteModelDirectory: async (dirPath) => {
    try {
      // First, verify that the path exists and is a directory
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        console.log(`Not deleting ${dirPath} as it is not a directory`);
        return false;
      }
      
      // IMPORTANT SAFETY CHECK: Ensure this is under the models directory
      const normalizedDirPath = path.normalize(dirPath);
      const normalizedModelsDir = path.normalize(MODELS_DIR);
      
      if (!normalizedDirPath.startsWith(normalizedModelsDir)) {
        console.log(`Safety check failed: Directory ${dirPath} is not within models directory ${MODELS_DIR}`);
        return false;
      }
      
      // First try the aggressive approach using rm -rf (more reliable)
      const forceDeleted = await modelFileUtils.forceDeleteDirectory(dirPath);
      if (forceDeleted) {
        return true;
      }
      
      // If force delete failed, fall back to the normal Node.js approach
      console.log(`Force delete failed, falling back to manual directory cleanup`);
      
      // Get directory contents (including hidden files)
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Handle empty directory case - we can delete it immediately
      if (files.length === 0) {
        console.log(`Directory ${dirPath} is empty, deleting it directly`);
        await fs.rmdir(dirPath);
        return true;
      }
      
      // For non-empty directories, still check for model files for logging purposes
      const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
      const hasModelFiles = files.some(dirent => {
        if (dirent.isFile()) {
          return modelExtensions.some(ext => dirent.name.toLowerCase().endsWith(ext));
        }
        return false;
      });
      
      if (!hasModelFiles) {
        console.log(`Note: Directory ${dirPath} does not contain recognized model files, but will be deleted anyway`);
      }
      
      // Delete directory contents regardless of whether model files were found
      console.log(`Deleting model directory contents: ${dirPath}`);
      
      for (const dirent of files) {
        const filePath = path.join(dirPath, dirent.name);
        try {
          if (dirent.isFile()) {
            await fs.unlink(filePath);
            console.log(`  Deleted file: ${dirent.name}`);
          } else if (dirent.isDirectory()) {
            // Recursively delete subdirectories, but only within the models directory
            const deleted = await modelFileUtils.safeDeleteModelDirectory(filePath);
            if (deleted) {
              console.log(`  Deleted subdirectory: ${dirent.name}`);
            }
          } else if (dirent.isSymbolicLink()) {
            // Handle symlinks
            await fs.unlink(filePath);
            console.log(`  Deleted symlink: ${dirent.name}`);
          }
        } catch (fileErr) {
          console.log(`  Error handling ${dirent.name}: ${fileErr.message}`);
        }
      }
      
      // Try to change permissions if needed (helps with permission issues)
      try {
        await fs.chmod(dirPath, 0o777);
      } catch (err) {
        console.log(`Unable to change directory permissions: ${err.message}`);
      }
      
      // After emptying the directory, try to remove it
      try {
        await fs.rmdir(dirPath);
        console.log(`Successfully deleted model directory: ${dirPath}`);
        return true;
      } catch (rmdirErr) {
        console.log(`Error removing empty directory ${dirPath}: ${rmdirErr.message}`);
        
        // Last resort: try force delete one more time
        return await modelFileUtils.forceDeleteDirectory(dirPath);
      }
    } catch (err) {
      console.log(`Error in safeDeleteModelDirectory for ${dirPath}: ${err.message}`);
      return false;
    }
  }
};

/**
 * Helper function to format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  modelFileUtils,
  formatFileSize,
  MODELS_DIR
};
