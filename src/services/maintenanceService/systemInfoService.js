/**
 * System Information Service
 * 
 * Handles operations related to system information and server management
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');

/**
 * Get environment with extended PATH to find binaries in common locations
 * @returns {Promise<Object>} Extended environment for exec commands
 */
const getEnvWithFullPath = async () => {
  try {
    // Get the user's PATH from the shell
    const { stdout: userPath } = await execPromise('echo $PATH');
    // Create an environment object with the PATH including system directories
    return {
      env: {
        ...process.env,
        PATH: `/usr/bin:/usr/local/bin:/bin:/sbin:/usr/sbin:${userPath.trim()}:${process.env.PATH || ''}`
      }
    };
  } catch (error) {
    console.error('Error getting user PATH:', error.message);
    // Fallback to a standard extended PATH
    return {
      env: {
        ...process.env,
        PATH: `/usr/bin:/usr/local/bin:/bin:/sbin:/usr/sbin:${process.env.PATH || ''}`
      }
    };
  }
};

/**
 * Detect GPU information using various methods
 * @returns {Promise<Object>} GPU information
 */
const detectGpuInfo = async () => {
  let gpuInfo = {
    detected: false,
    gpus: [],
    detectionMethod: null,
    rawOutput: null
  };
  
  // Get environment with extended PATH
  const execOptions = await getEnvWithFullPath();
  
  try {
    // Try different nvidia-smi commands with fallbacks
    
    // First try: basic check if nvidia-smi exists and can list GPUs
    try {
      console.log('Checking for NVIDIA GPU with basic nvidia-smi...');
      const { stdout: basicOutput } = await execPromise('nvidia-smi --list-gpus', execOptions);
      
      if (basicOutput && basicOutput.trim()) {
        // We have nvidia-smi and it can list GPUs
        gpuInfo.detected = true;
        gpuInfo.detectionMethod = 'nvidia-smi-list';
        gpuInfo.rawOutput = basicOutput;
        
        // Parse the GPUs from the list
        const gpuLines = basicOutput.trim().split('\n');
        gpuInfo.gpus = gpuLines.map(line => {
          const nameMatch = line.match(/GPU \d+: (.+?) \(UUID:/);
          return {
            type: 'NVIDIA',
            name: nameMatch ? nameMatch[1] : 'NVIDIA GPU',
            detected: true
          };
        });
        
        // Continue with trying to get more detailed information
      }
    } catch (basicError) {
      console.log('Basic nvidia-smi check failed:', basicError.message);
    }
    
    // Second try: If the first check didn't work or didn't return GPUs, try direct nvidia-smi
    if (!gpuInfo.detected) {
      try {
        console.log('Trying direct nvidia-smi command...');
        const { stdout: directOutput } = await execPromise('nvidia-smi', execOptions);
        
        if (directOutput && directOutput.includes('NVIDIA-SMI')) {
          gpuInfo.detected = true;
          gpuInfo.detectionMethod = 'nvidia-smi-direct';
          gpuInfo.rawOutput = directOutput;
          
          // Try to extract GPU info from the output table
          const gpuMatches = directOutput.match(/\|\s+\d+\s+([\w\s]+)\s+/g);
          
          if (gpuMatches && gpuMatches.length > 0) {
            gpuInfo.gpus = gpuMatches.map(match => {
              const namePart = match.trim().split(/\s+/).slice(1).join(' ');
              return {
                type: 'NVIDIA', 
                name: namePart || 'NVIDIA GPU',
                detected: true
              };
            });
          } else {
            // We detected nvidia-smi works but couldn't parse the output
            gpuInfo.gpus = [{
              type: 'NVIDIA',
              name: 'NVIDIA GPU (details unavailable)',
              detected: true
            }];
          }
        }
      } catch (directError) {
        console.log('Direct nvidia-smi check failed:', directError.message);
      }
    }
    
    // If all NVIDIA checks failed, try AMD
    if (!gpuInfo.detected) {
      try {
        const { stdout: amdOutput } = await execPromise('rocm-smi --showuse');
        
        if (amdOutput && amdOutput.includes('GPU')) {
          gpuInfo.detected = true;
          gpuInfo.detectionMethod = 'rocm-smi';
          gpuInfo.rawOutput = amdOutput;
          
          const gpuLines = amdOutput.trim().split('\n').filter(line => line.includes('GPU'));
          gpuInfo.gpus = gpuLines.map(() => ({
            type: 'AMD',
            name: 'AMD GPU',
            detected: true
          }));
        }
      } catch (amdError) {
        console.log('AMD GPU detection failed:', amdError.message);
      }
    }
    
    // Check for CUDA version if we have NVIDIA GPUs
    if (gpuInfo.detected && gpuInfo.gpus.some(gpu => gpu.type === 'NVIDIA')) {
      try {
        const { stdout: nvccOutput } = await execPromise('nvcc --version');
        const versionMatch = nvccOutput.match(/release (\d+\.\d+)/);
        if (versionMatch) {
          gpuInfo.cudaVersion = versionMatch[1];
        }
      } catch (nvccError) {
        console.log('CUDA version check failed:', nvccError.message);
      }
    }
    
    return gpuInfo;
  } catch (error) {
    console.error('Error in GPU detection:', error);
    return {
      detected: false,
      gpus: [],
      error: error.message
    };
  }
};

/**
 * Get system information including version, environment, uptime, hardware, etc.
 * @returns {Promise<Object>} System information object
 */
const getSystemInfo = async () => {
  try {
    // Get database path using the module that now has proper path resolution
    const { getDbPath } = require('../maintenanceService/databaseBackupService');
    const dbPath = getDbPath();
    
    // Load database information about the most recently restored backup
    let restoredBackupInfo = null;
    
    try {
      // Check for a marker file that could be created during restore
      // Use the database directory as the base for finding the marker file
      const dbDir = path.dirname(dbPath);
      const markerPath = path.join(dbDir, 'restored_backup_info.json');
      if (fs.existsSync(markerPath)) {
        try {
          const markerData = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
          restoredBackupInfo = markerData;
        } catch (markerErr) {
          console.error(`Error reading restore marker file: ${markerErr.message}`);
          // Default backup info if marker file exists but can't be read
          restoredBackupInfo = {
            restoredFromBackup: true,
            backupName: 'Unknown',
            restoredAt: null
          };
        }
      } else {
        // Default backup info if no marker file
        restoredBackupInfo = {
          restoredFromBackup: false,
          backupName: null,
          restoredAt: null
        };
      }
    } catch (dbErr) {
      console.error(`Error getting restored backup info: ${dbErr.message}`);
      // Return default values if error occurs
      restoredBackupInfo = {
        restoredFromBackup: false,
        backupName: null,
        restoredAt: null
      };
    }
    
    // Get system version information
    let version = 'Unknown';
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        version = packageJson.version || 'Unknown';
      }
    } catch (versionErr) {
      console.error(`Error getting version info: ${versionErr.message}`);
    }
    
    // System startup time (approximation based on process uptime)
    const uptimeInSeconds = process.uptime();
    const startupTime = new Date(Date.now() - (uptimeInSeconds * 1000));
    
    // Get GPU information
    const gpuInfo = await detectGpuInfo();
    
    return {
      version,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      startupTime: startupTime.toISOString(),
      uptime: uptimeInSeconds,
      databasePath: dbPath,
      dataDirectory: path.join(process.cwd(), 'data'),
      environment: process.env.NODE_ENV || 'development',
      restoredBackupInfo,
      // Hardware information
      hardware: {
        cpu: {
          model: os.cpus()[0].model,
          cores: os.cpus().length,
          architecture: process.arch
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        },
        gpu: gpuInfo
      }
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    throw error;
  }
};

/**
 * Restart the server using PM2
 * @returns {Promise<Object>} Restart result
 */
const restartServer = async () => {
  try {
    console.log('Restart server request received');
    
    // Find PM2 binary and restart the server
    let pm2Command = '';
    
    if (process.platform === 'win32') {
      // Windows implementation
      pm2Command = 'pm2 restart wmcp';
    } else {
      // Unix-like systems - use a simple approach to find PM2 and restart
      pm2Command = `
        # Try to find PM2 in common locations
        if [ -f "$HOME/node_modules/.bin/pm2" ]; then
          "$HOME/node_modules/.bin/pm2" restart wmcp
        elif [ -f "$HOME/bin/pm2" ]; then
          "$HOME/bin/pm2" restart wmcp
        else
          pm2 restart wmcp
        fi
      `;
    }
    
    console.log('Executing PM2 restart command...');
    
    // Execute the restart command
    await execPromise(pm2Command);
    
    console.log('Server restart command executed successfully');
    
    // Return result
    return {
      success: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error restarting server:', error);
    throw error;
  }
};

module.exports = {
  getSystemInfo,
  restartServer,
  detectGpuInfo  // Export the GPU detection function so it can be used elsewhere if needed
};
