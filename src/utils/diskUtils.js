/**
 * Disk Utilities Module
 * 
 * Provides cross-platform disk and file system utilities.
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execPromise = util.promisify(exec);

/**
 * Check if a path exists
 * @param {string} targetPath - Path to check
 * @returns {Promise<boolean>} - Whether the path exists
 */
const pathExists = async (targetPath) => {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get disk space information for a path using cross-platform built-in methods.
 * @param {string} targetPath - Path to get disk space for
 * @returns {Promise<Object>} Disk space information
 */
const getDiskSpace = async (targetPath) => {
  try {
    const absolutePath = path.isAbsolute(targetPath) 
      ? targetPath 
      : path.resolve(process.cwd(), targetPath);

    // Try different methods in order of preference
    const isWindows = os.platform() === 'win32';
    
    if (isWindows) {
      return await getDiskSpaceWindows(absolutePath);
    } else {
      return await getDiskSpaceUnix(absolutePath);
    }
  } catch (error) {
    console.error(`[diskUtils] getDiskSpace failed for "${targetPath}": ${error.message}`);
    return {
      total: 0, 
      used: 0, 
      available: 0, 
      percentUsed: 0,
      success: false, 
      error: error.message, 
      method: 'fallback'
    };
  }
};

/**
 * Get disk space on Unix-like systems (Linux, macOS)
 * @param {string} absolutePath - Absolute path to check
 * @returns {Promise<Object>} Disk space information
 */
const getDiskSpaceUnix = async (absolutePath) => {
  try {
    // Use df with POSIX output format for consistency
    const command = `df -P "${absolutePath}"`;
    const { stdout } = await execPromise(command);
    
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Unexpected df output format');
    }
    
    // Get the data line (last line or second line)
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.trim().split(/\s+/);
    
    if (parts.length < 4) {
      throw new Error('Could not parse df output');
    }
    
    // df -P outputs in 1K blocks
    const totalBlocks = parseInt(parts[1], 10);
    const usedBlocks = parseInt(parts[2], 10);
    const availableBlocks = parseInt(parts[3], 10);
    
    if (isNaN(totalBlocks) || isNaN(usedBlocks) || isNaN(availableBlocks)) {
      throw new Error('Invalid numeric values from df');
    }
    
    const total = totalBlocks * 1024;
    const used = usedBlocks * 1024;
    const available = availableBlocks * 1024;
    const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
    
    return { 
      total, 
      used, 
      available, 
      percentUsed, 
      success: true, 
      method: 'unix-df' 
    };
  } catch (error) {
    // Fallback to statvfs-like approach using Node.js fs.statSync
    return getDiskSpaceNodeFallback(absolutePath);
  }
};

/**
 * Get disk space on Windows systems
 * @param {string} absolutePath - Absolute path to check
 * @returns {Promise<Object>} Disk space information
 */
const getDiskSpaceWindows = async (absolutePath) => {
  try {
    // Get the drive letter from the path
    const drive = path.parse(absolutePath).root;
    const command = `wmic logicaldisk where caption="${drive.replace('\\', '')}" get size,freespace /format:csv`;
    
    const { stdout } = await execPromise(command);
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3 && parts[1] && parts[2]) {
        const available = parseInt(parts[1], 10);
        const total = parseInt(parts[2], 10);
        
        if (!isNaN(available) && !isNaN(total)) {
          const used = total - available;
          const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
          
          return { 
            total, 
            used, 
            available, 
            percentUsed, 
            success: true, 
            method: 'windows-wmic' 
          };
        }
      }
    }
    
    throw new Error('Could not parse wmic output');
  } catch (error) {
    return getDiskSpaceNodeFallback(absolutePath);
  }
};

/**
 * Fallback method using Node.js built-in capabilities
 * @param {string} absolutePath - Absolute path to check
 * @returns {Promise<Object>} Disk space information
 */
const getDiskSpaceNodeFallback = async (absolutePath) => {
  try {
    // This is a very basic fallback - it won't give us disk space but at least won't fail
    const stats = await fs.promises.stat(absolutePath);
    
    // We can't get actual disk space with pure Node.js, so return a "unknown" result
    return {
      total: 0,
      used: 0, 
      available: 0,
      percentUsed: 0,
      success: false,
      error: 'Disk space detection not available with current method',
      method: 'node-fallback'
    };
  } catch (error) {
    return {
      total: 0,
      used: 0,
      available: 0, 
      percentUsed: 0,
      success: false,
      error: error.message,
      method: 'failed'
    };
  }
};

/**
 * Get directory size recursively
 * @param {string} directoryPath - Path to the directory
 * @returns {Promise<number>} Size in bytes
 */
const getDirectorySize = async (directoryPath) => {
  try {
    const { stdout } = await execPromise(`du -sk "${directoryPath}" | cut -f1`);
    const sizeInKB = parseInt(stdout.trim(), 10);
    if (!isNaN(sizeInKB)) {
      return sizeInKB * 1024;
    }
    throw new Error('Could not parse du output');
  } catch (commandError) {
    console.debug(`[diskUtils] Using Node.js directory size calculation: ${commandError.message}`);
    return calculateSizeRecursively(directoryPath);
  }
};

/**
 * Calculate directory size recursively using Node.js fs module
 * @param {string} dirPath - Path to directory
 * @returns {Promise<number>} Size in bytes
 */
const calculateSizeRecursively = async (dirPath) => {
  let totalSize = 0;
  const visited = new Set();

  async function getSize(currentPath) {
    if (visited.has(currentPath)) {
      return 0;
    }
    visited.add(currentPath);

    let stats;
    try {
      stats = await fs.promises.lstat(currentPath);
    } catch (error) {
      console.error(`Error getting stats for ${currentPath}: ${error.message}`);
      return 0;
    }

    if (stats.isSymbolicLink()) {
      return 0;
    }
    
    if (stats.isFile()) {
      return stats.size;
    }

    if (stats.isDirectory()) {
      let directorySize = 0;
      try {
        const files = await fs.promises.readdir(currentPath);
        const sizePromises = files.map(file => getSize(path.join(currentPath, file)));
        const fileSizes = await Promise.all(sizePromises);
        directorySize = fileSizes.reduce((acc, size) => acc + size, 0);
      } catch (error) {
        console.error(`Error reading directory ${currentPath}: ${error.message}`);
      }
      return directorySize;
    }

    return 0;
  }

  totalSize = await getSize(dirPath);
  return totalSize;
};

/**
 * Remove a directory and all its contents recursively
 * @param {string} directoryPath - Path to the directory to remove
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
const removeDirectory = async (directoryPath) => {
  try {
    const command = `rm -rf "${directoryPath}"`;
    await execPromise(command);
    const exists = await pathExists(directoryPath);
    if (!exists) {
      return true;
    }
    throw new Error('Directory still exists after command removal');
  } catch (commandError) {
    console.debug(`[diskUtils] Using Node.js directory removal: ${commandError.message}`);
    if (fs.promises.rm) {
      await fs.promises.rm(directoryPath, { recursive: true, force: true });
      return true;
    }
    return removeDirectoryRecursively(directoryPath);
  }
};

/**
 * Remove a directory recursively using Node.js fs module
 * @param {string} directoryPath - Path to remove
 * @returns {Promise<boolean>} - Whether removal was successful
 */
const removeDirectoryRecursively = async (directoryPath) => {
  if (!await pathExists(directoryPath)) {
    return true;
  }
  const stats = await fs.promises.stat(directoryPath);
  if (stats.isFile()) {
    await fs.promises.unlink(directoryPath);
    return true;
  }
  const files = await fs.promises.readdir(directoryPath);
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    await removeDirectoryRecursively(filePath);
  }
  await fs.promises.rmdir(directoryPath);
  return true;
};

module.exports = {
  getDiskSpace,
  getDirectorySize,
  removeDirectory,
  pathExists
};
