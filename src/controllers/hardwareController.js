const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data/hardware');

// Create the hardware data directory on module load
(async () => {
  try {
    await fsPromises.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // Silently handle errors
  }
})();

// In-memory for historical data
const historicalData = {
  cpu: [],
  memory: [],
  gpu: []
};

// Maximum data points to store
const MAX_HISTORY_LENGTH = 8640; 

// File paths for historical data
const dataFiles = {
  cpu: path.join(dataDir, 'cpu_history.json'),
  memory: path.join(dataDir, 'memory_history.json'),
  gpu: path.join(dataDir, 'gpu_history.json')
};

// Intervals for monitoring and saving data (in milliseconds)
const COLLECTION_INTERVAL = 10 * 1000; 
const SAVE_INTERVAL = 5 * 60 * 1000;

/**
 * Ensure the data directory exists
 * @returns {Promise<boolean>} True if directory exists/was created, false otherwise
 */
const ensureDataDirExists = async () => {
  try {
    await fsPromises.mkdir(dataDir, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Save historical data to files
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
const saveHistoricalData = async () => {
  try {
    // Ensure directory exists before writing
    const dirExists = await ensureDataDirExists();
    if (!dirExists) {
      return false;
    }
    
    // Save each data type to its own file
     for (const type of Object.keys(historicalData)) {
       const filePath = dataFiles[type];
       const currentData = historicalData[type]; // Get current in-memory data

       // Check if we have data for this type
       if (currentData && currentData.length > 0) {
         try {
           // Calculate the timestamp 24 hours ago
           const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

           // Filter the data to keep only entries within the last 24 hours
           const dataToSave = currentData.filter(entry => {
             // Ensure entry.time exists and is a valid date string
             if (!entry || !entry.time) return false;
             try {
               // Compare timestamp directly
               return new Date(entry.time).getTime() >= twentyFourHoursAgo;
             } catch (e) {
               // Invalid date format, discard
               console.warn(`[HardwareCtrl] Discarding invalid date entry in ${type}_history.json:`, entry.time);
               return false;
             }
           });

           // Write the filtered data to the file
           await fsPromises.writeFile(
             filePath,
             JSON.stringify(dataToSave, null, 2) // Write the filtered data
           );
         } catch (err) {
          // Silent fail for individual files
        }
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Load historical data from files
 * @returns {Promise<boolean>} True if successful (even if no data was loaded), false on error
 */
const loadHistoricalData = async () => {
  try {
    // Ensure directory exists before reading
    const dirExists = await ensureDataDirExists();
    if (!dirExists) {
      return false;
    }
    
    let dataLoaded = false;
    
    // Load each data type from its file
    for (const type of Object.keys(historicalData)) {
      const filePath = dataFiles[type];
      try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Validate and use the loaded data
        if (Array.isArray(parsedData)) {
          historicalData[type] = parsedData;
          dataLoaded = true;
        }
      } catch (err) {
        // File may not exist yet, which is fine
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

// Add a new data point to history
const addHistoricalDataPoint = (type, dataPoint) => {
  historicalData[type].push({
    ...dataPoint,
    time: new Date().toISOString()
  });
  
  // Keep only the most recent data points
  if (historicalData[type].length > MAX_HISTORY_LENGTH) {
    historicalData[type].shift();
  }
};

// Initialize with current time
const initializeHistoricalData = () => {
  // Clear existing data
  historicalData.cpu = [];
  historicalData.memory = [];
  historicalData.gpu = [];
  
  // Initialize with empty data points
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    historicalData.cpu.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0
    });
    
    // Use usagePercent for memory too for consistency with frontend expectations
    historicalData.memory.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0, // Add this field for consistency
      usedPercent: 0    // Keep original too
    });
    
    historicalData.gpu.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0
    });
  }
  
  // Reverse to have chronological order
  historicalData.cpu.reverse();
  historicalData.memory.reverse();
  historicalData.gpu.reverse();
};

// Set up the initial environment
const setupEnvironment = async () => {
  // Try to load historical data first
  const loaded = await loadHistoricalData();
  
  // If no data was loaded or loading failed, initialize with empty data
  if (!loaded || historicalData.cpu.length === 0) {
    initializeHistoricalData();
    
    // Save the initialized data immediately
    await saveHistoricalData();
  }
  
  // Get some initial data
  try {
    const cpuUsage = await calculateCpuUsage();
    const memoryInfo = getMemoryInfo();
    
    // Add initial data points
    addHistoricalDataPoint('cpu', { usagePercent: cpuUsage.total });
    addHistoricalDataPoint('memory', { 
      usedPercent: memoryInfo.percentUsed,
      usagePercent: memoryInfo.percentUsed
    });
    
    // Save immediately after adding initial data points
    await saveHistoricalData();
  } catch (err) {
    // Silent error handling
  }
  
  // Set up periodic saving
  const saveInterval = setInterval(saveHistoricalData, SAVE_INTERVAL);
  
  // Set up periodic data collection for permanent monitoring
  const collectionInterval = setInterval(async () => {
    try {
      // Collect hardware metrics
      const [cpuUsage, memoryInfo, gpuInfo] = await Promise.all([
        calculateCpuUsage(),
        getMemoryInfo(),
        getGpuInfo()
      ]);
      
      // Add CPU usage to historical data
      addHistoricalDataPoint('cpu', { usagePercent: cpuUsage.total });
      
      // Add memory usage to historical data
      addHistoricalDataPoint('memory', { 
        usedPercent: memoryInfo.percentUsed,
        usagePercent: memoryInfo.percentUsed
      });
      
      // Add GPU usage if available
      if (gpuInfo.devices.length > 0) {
        const totalUtilization = gpuInfo.devices.reduce((sum, device) => 
          sum + (device.utilization || 0), 0);
        const avgUtilization = gpuInfo.devices.length > 0 ? 
          totalUtilization / gpuInfo.devices.length : 0;
        
        addHistoricalDataPoint('gpu', { usagePercent: avgUtilization });
      } else {
        addHistoricalDataPoint('gpu', { usagePercent: 0 });
      }
    } catch (error) {
      // Silent error handling for robustness
      console.error('Error collecting hardware metrics:', error);
    }
  }, COLLECTION_INTERVAL);
  
  // Handle process termination to save data before exit
  process.on('SIGTERM', async () => {
    await saveHistoricalData();
    clearInterval(saveInterval);
    clearInterval(collectionInterval);
  });
  
  process.on('SIGINT', async () => {
    await saveHistoricalData();
    clearInterval(saveInterval);
    clearInterval(collectionInterval);
  });
};

// Initialize the environment when this module is loaded
setupEnvironment().catch(() => {
  // Silent error handling
});

/**
 * Get detailed CPU information including frequency for Xeon CPUs
 * @returns {Promise<Object>} Detailed CPU information
 */
const getDetailedCpuInfo = async () => {
  try {
    const cpuInfoBasic = {
      model: os.cpus()[0].model,
      cores: os.cpus().length,
      speed: os.cpus()[0].speed || 0, // Default speed from os module
      loadAvg: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime()
    };
    
    // Get detailed per-core information
    cpuInfoBasic.cores = os.cpus().length;
    cpuInfoBasic.coreInfo = os.cpus().map((core, index) => ({
      id: index,
      model: core.model,
      speed: core.speed,
      times: core.times
    }));
    
    return cpuInfoBasic;
  } catch (error) {
    // Fall back to basic OS info
    return {
      model: os.cpus()[0].model,
      cores: os.cpus().length,
      speed: os.cpus()[0].speed,
      loadAvg: os.loadavg()
    };
  }
};

/**
 * Calculate CPU usage percentage
 * @returns {Promise<Object>} CPU usage percentages
 */
const calculateCpuUsage = async () => {
  try {
    // Get initial CPU usage info
    const startMeasure = os.cpus();
    
    // Wait for 300ms to get a more accurate measure
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get CPU info again
    const endMeasure = os.cpus();
    
    // Calculate CPU usage for each core
    const cpuUsage = startMeasure.map((startCore, index) => {
      const endCore = endMeasure[index];
      
      // Calculate the difference in CPU times
      const startTotal = Object.values(startCore.times).reduce((a, b) => a + b, 0);
      const endTotal = Object.values(endCore.times).reduce((a, b) => a + b, 0);
      
      const startIdle = startCore.times.idle;
      const endIdle = endCore.times.idle;
      
      const totalDiff = endTotal - startTotal;
      const idleDiff = endIdle - startIdle;
      
      // Calculate usage percentage
      const usagePercent = 100 - (idleDiff / totalDiff * 100);
      
      return {
        core: index,
        usage: usagePercent
      };
    });
    
    // Calculate average CPU usage (normalized to 0-100%)
    const totalUsage = Math.min(100, cpuUsage.reduce((sum, core) => sum + core.usage, 0) / cpuUsage.length);
    
    return {
      total: totalUsage,
      perCore: cpuUsage
    };
  } catch (error) {
    // Fall back to process.cpuUsage()
    const cpuUsage = process.cpuUsage();
    return {
      user: cpuUsage.user / 1000000, // Convert to seconds
      system: cpuUsage.system / 1000000,
      total: (cpuUsage.user + cpuUsage.system) / 1000000
    };
  }
};

/**
 * Get memory usage statistics (FIXED FOR APPLE SILICON)
 * @returns {Promise<Object>} Memory usage information
 */
const getMemoryInfo = async () => {
  const totalMemory = os.totalmem();
  let usedMemory;

  if (os.platform() === 'darwin') {
    try {
      const { stdout } = await execPromise('vm_stat', { timeout: 5000 });
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      
      // Find page size from header: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
      let pageSize = 4096; // Default fallback
      const headerLine = lines.find(line => line.toLowerCase().includes('page size of'));
      if (headerLine) {
        const pageSizeMatch = headerLine.match(/page size of (\d+)/i);
        if (pageSizeMatch) {
          pageSize = parseInt(pageSizeMatch[1], 10);
        }
      }
      
      // Find free and inactive pages
      let pagesFree = 0;
      let pagesInactive = 0;
      
      for (const line of lines) {
        // Match "Pages free:                                3551."
        const freeMatch = line.match(/^Pages free:\s*(\d+)\.?/i);
        if (freeMatch) {
          pagesFree = parseInt(freeMatch[1], 10);
          continue;
        }
        
        // Match "Pages inactive:                           81795."
        const inactiveMatch = line.match(/^Pages inactive:\s*(\d+)\.?/i);
        if (inactiveMatch) {
          pagesInactive = parseInt(inactiveMatch[1], 10);
          continue;
        }
      }

      // Validate we found the required values
      if (pagesFree >= 0 && pagesInactive >= 0) {
        const freeMemory = (pagesFree + pagesInactive) * pageSize;
        usedMemory = totalMemory - freeMemory;
        
        // Sanity check: used memory shouldn't exceed total memory or be negative
        if (usedMemory < 0 || usedMemory > totalMemory) {
          console.warn(`[HardwareCtrl] Calculated memory values seem incorrect: used=${Math.round(usedMemory/1024/1024)}MB, total=${Math.round(totalMemory/1024/1024)}MB, falling back to os.freemem()`);
          throw new Error(`Invalid calculated memory values`);
        }
      } else {
        throw new Error('Could not find valid page counts in vm_stat output.');
      }

    } catch (e) {
      console.warn(`[HardwareCtrl] vm_stat parsing failed on macOS (${e.message}), falling back to os.freemem()`);
      usedMemory = totalMemory - os.freemem();
    }
  } else {
    // Non-macOS platforms
    usedMemory = totalMemory - os.freemem();
  }

  const freeMemory = totalMemory - usedMemory;
  const percentUsed = Math.max(0, Math.min(100, (usedMemory / totalMemory) * 100));
  
  return {
    total: totalMemory,
    free: freeMemory,
    used: usedMemory,
    percentUsed: percentUsed
  };
};

/**
 * Get GPU information from the system with cleaned up device names
 * @param {Object} [memoryInfo] - Optional pre-fetched memory info to avoid redundant calls.
 * @returns {Promise<Object>} GPU information including devices and software
 */
const getGpuInfo = async (memoryInfo) => {
  try {
    // For storing detected GPU devices
    let devices = [];
    let appleGpuDetected = false; // Flag to track Apple GPU detection
    
    // Check if running on macOS (for Apple GPU detection)
    const isMacOS = os.platform() === 'darwin';
    
    // Try to detect Apple Silicon GPU if on macOS
    if (isMacOS) {
      try {
        // Use system_profiler to get GPU info on Mac
        const { stdout } = await execPromise('system_profiler SPDisplaysDataType', { timeout: 5000 });
        
        if (stdout && stdout.includes('Apple') && (
            stdout.includes('M1') || 
            stdout.includes('M2') || 
            stdout.includes('M3') || 
            stdout.includes('Apple GPU')
        )) {
          // Extract GPU name from output
          let gpuName = 'Apple GPU';
          const gpuMatch = stdout.match(/Chipset Model:\s*(Apple M\d\w*|Apple GPU)/i); // Adjusted regex
          if (gpuMatch && gpuMatch[1]) {
            gpuName = gpuMatch[1];
          }
          
          // Add the Apple GPU to devices
          const memInfo = memoryInfo || await getMemoryInfo(); // Use provided memory info or fetch it
          devices.push({
            id: '0',
            type: 'Apple',
            name: gpuName,
            utilization: 0, // We'll estimate this from CPU usage
            memory: {
              // For unified memory, represent a portion of system RAM
              used: memInfo.used / (1024 * 1024), // Convert to MiB
              total: memInfo.total / (1024 * 1024) // Convert to MiB
            }
          });
          appleGpuDetected = true; // Set flag
          
          // If we have CPU usage data, estimate GPU utilization
          // (Apple GPUs are integrated with the CPU)
          try {
            const cpuUsage = await calculateCpuUsage();
            if (devices[0] && cpuUsage.total) {
              // On Apple Silicon, GPU utilization often correlates with CPU
              devices[0].utilization = Math.min(100, cpuUsage.total * 0.8);
            }
          } catch (e) {
            // Ignore errors in utilization estimation
          }
        }
      } catch (error) {
        // Silent Apple GPU detection error
      }
    }
    
    // Try to detect NVIDIA GPUs ONLY if an Apple GPU wasn't already found
    if (!appleGpuDetected) {
      const hasNvidiaSmi = await (async () => {
        try {
          // Try which command but suppress any error output
          await execPromise('which nvidia-smi 2>/dev/null', { timeout: 2000 });
          return true;
        } catch (error) {
          // nvidia-smi not available - no error logging needed
          return false;
        }
      })();
      
      if (hasNvidiaSmi) {
        try {
          // Use direct query approach for reliable data extraction
          const { stdout } = await execPromise(
            'nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null', 
            { timeout: 5000 }
          );
          
          if (stdout && stdout.trim()) {
            // Parse CSV output directly
            const gpuEntries = [];
            
            // Split by lines and process each GPU
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              // Split by comma and trim each value
              const [index, name, temperature, utilization, memoryUsed, memoryTotal] = line.split(',').map(s => s.trim());
              
              // Clean up the GPU name - remove duplicated vendor names
              let cleanName = name;
              if (name && name.includes('NVIDIA')) {
                cleanName = name.replace(/\s+(NVIDIA|AMD|Intel)\s*$/i, '');
              }
              
              // Add entry with all values parsed as integers where appropriate
              gpuEntries.push({
                id: index,
                type: 'NVIDIA',
                name: cleanName || `GPU ${index}`,
                temperature: parseInt(temperature) || 0,
                utilization: parseInt(utilization) || 0,
                memory: {
                  used: parseInt(memoryUsed) || 0,
                  total: parseInt(memoryTotal) || 0
                }
              });
            }
            
            // If NVIDIA GPUs found, they take precedence (or are the only ones)
            devices = gpuEntries; 
          }
        } catch (error) {
          // Silently ignore GPU detection errors
        }
      }
    } // End of if (!appleGpuDetected)
    
    // Create the software info object
    let cudaVersion = null;
    // Only check CUDA version if not on Apple Silicon (or if nvidia-smi exists anyway)
    if (!appleGpuDetected) {
      try {
        const { stdout: smiOutput } = await execPromise('nvidia-smi', { timeout: 3000 });
        const cudaMatch = smiOutput.match(/CUDA Version:\s+(\d+\.\d+)/i);
        if (cudaMatch && cudaMatch[1]) {
          cudaVersion = cudaMatch[1];
        }
      } catch (e) {
        // Ignore, continue without CUDA version
      }
    }
    
    const software = {
      cuda: cudaVersion
    };
    
    return {
      devices,
      software,
      history: historicalData.gpu  // Historical data
    };
  } catch (error) {
    return {
      devices: [],
      software: {},
      history: []
    };
  }
};

/**
 * Ensure data points have the proper format with usagePercent field
 */
const ensureDataPointFormat = (dataPoints) => {
  if (!Array.isArray(dataPoints)) return [];
  
  return dataPoints.map(point => {
    // Ensure the point has a usagePercent field
    if (point.usagePercent === undefined && point.usedPercent !== undefined) {
      return {
        ...point,
        usagePercent: point.usedPercent
      };
    }
    return point;
  });
};

/**
 * Get all hardware information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const vllmService = require('../services/vllmService');
const Model = require('../models/Model');

// ... (keep the rest of the file until getHardwareInfo)

const getHardwareInfo = async (req, res) => {
  try {
    // vLLM service replaces the old worker pool manager.
    const vllmStatusObject = {
      activeModelId: vllmService.activeModelId,
      vllmProcess: vllmService.vllmProcess ? 'running' : 'stopped'
    };

    // Fetch memory info first to pass into other functions
    const memoryInfoResult = await getMemoryInfo();

    // Collect remaining hardware information in parallel
    const [cpuInfoResult, cpuUsageResult, gpuInfoResult, effectiveVramLimitGbResult] = await Promise.all([
      getDetailedCpuInfo(),
      calculateCpuUsage(),
      getGpuInfo(memoryInfoResult), // Pass memory info to GPU info getter
      getEffectiveGpuVramLimitGb()
    ]);

    // Create GPU -> Model mapping for the single active vLLM model
    let activeModelName = null;
    if (vllmStatusObject.activeModelId) {
      const model = await Model.findById(vllmStatusObject.activeModelId);
      if (model) {
        activeModelName = model.name;
      }
    }

    const gpuToModelMap = {};
    if (activeModelName && gpuInfoResult.devices.length > 0) {
      // vLLM uses all available GPUs for the single active model
      gpuInfoResult.devices.forEach(device => {
        gpuToModelMap[device.id] = activeModelName;
      });
    }

    // Augment GPU devices with assigned model names using gpuInfoResult
    const augmentedGpuDevices = gpuInfoResult.devices.map(device => ({ // Use gpuInfoResult
      ...device,
      assignedModel: gpuToModelMap[device.id] || null // Add assignedModel, default to null
    }));

    // Add CPU usage to historical data using cpuUsageResult
    addHistoricalDataPoint('cpu', { usagePercent: cpuUsageResult.total }); // Use cpuUsageResult
    
    // Add memory usage to historical data with both field names for consistency using memoryInfoResult
    addHistoricalDataPoint('memory', {
      usedPercent: memoryInfoResult.percentUsed, // Use memoryInfoResult
      usagePercent: memoryInfoResult.percentUsed  // Use memoryInfoResult
    });

    // Process memory data to ensure all entries have usagePercent
    historicalData.memory = ensureDataPointFormat(historicalData.memory);

    // Add GPU usage to historical data if available using gpuInfoResult
    if (gpuInfoResult.devices.length > 0) { // Use gpuInfoResult
      // Calculate average GPU utilization
      const totalUtilization = gpuInfoResult.devices.reduce((sum, device) => // Use gpuInfoResult
        sum + (device.utilization || 0), 0);
      const avgUtilization = gpuInfoResult.devices.length > 0 ? // Use gpuInfoResult
        totalUtilization / gpuInfoResult.devices.length : 0;

      addHistoricalDataPoint('gpu', { usagePercent: avgUtilization });
    } else {
      addHistoricalDataPoint('gpu', { usagePercent: 0 });
    }
    
    // Construct response using the destructured results
    const hardwareInfo = {
      cpu: {
        ...cpuInfoResult, // Use cpuInfoResult
        usage: cpuUsageResult, // Use cpuUsageResult
        history: historicalData.cpu
      },
      memory: {
        ...memoryInfoResult, // Use memoryInfoResult
        history: ensureDataPointFormat(historicalData.memory)
      },
      gpu: {
        ...gpuInfoResult, // Use gpuInfoResult
        devices: augmentedGpuDevices, // Override devices with the augmented list
        history: historicalData.gpu
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        uptime: os.uptime(),
        hostname: os.hostname()
      },
      // Explicitly include the vLLM status object in the response
      poolStatus: vllmStatusObject,
      // Include the calculated effective VRAM limit (ensure it's a number)
      effectiveVramLimitGb: effectiveVramLimitGbResult // Use the correctly extracted result
    };

    res.json(hardwareInfo);
  } catch (error) {
    // Enhanced detailed error logging
    console.error('[HardwareCtrl] FATAL ERROR in getHardwareInfo:', error.message); 
    console.error('[HardwareCtrl] Stack Trace:', error.stack || 'No stack trace available'); // Log the full stack trace
    // Log additional context if available (e.g., error code, syscall)
    if (error.code) console.error('[HardwareCtrl] Error Code:', error.code);
    if (error.syscall) console.error('[HardwareCtrl] Syscall:', error.syscall);
    
    res.status(500).json({ 
      error: 'Failed to retrieve hardware information', 
      // Optionally include a sanitized error message or ID in development/debug mode
      // details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error occurred.' 
    });
  }
};

/**
 * Get historical hardware usage data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getHardwareHistory = (req, res) => {
  res.json(historicalData);
};

/**
 * Force refresh GPU information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refreshGpuInfo = async (req, res) => {
  try {
    // Get fresh GPU info
    const gpuInfo = await getGpuInfo();
    
    res.json(gpuInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh GPU information' });
  }
};

/**
 * Get only the list of GPU indices available on the system.
 * Uses nvidia-smi. Returns empty array if nvidia-smi fails or no GPUs found.
 * @returns {Promise<Array<string>>} A promise resolving to an array of GPU index strings (e.g., ['0', '1']).
 */
const getGpuIndices = async () => {
  try {
    // This command is more robust for parsing than --list-gpus
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=index --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    
    if (stdout && stdout.trim()) {
      const indices = stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
      if (indices.length > 0) {
        console.log(`[HardwareCtrl] Detected NVIDIA GPU indices via query: ${indices.join(', ')}`);
        return indices;
      }
    }
  } catch (error) {
    // This error is expected if nvidia-smi is not installed or fails.
    console.log(`[HardwareCtrl] nvidia-smi query failed. Checking for other GPU types.`);
  }

  // Fallback for Apple Silicon (macOS)
  if (os.platform() === 'darwin') {
     try {
       const { stdout: sysProfiler } = await execPromise('system_profiler SPDisplaysDataType', { timeout: 5000 });
       if (sysProfiler && (sysProfiler.includes('Apple M1') || sysProfiler.includes('Apple M2') || sysProfiler.includes('Apple M3') || sysProfiler.includes('Apple GPU'))) {
           console.log('[HardwareCtrl] Detected Apple Silicon GPU.');
           return ['0']; // Apple Silicon is treated as a single device at index 0
       }
     } catch (macError) {
       console.warn(`[HardwareCtrl] Failed to detect Apple Silicon GPU via system_profiler: ${macError.message}`);
     }
  }
  
  // If we reach here, no compatible GPUs were detected.
  console.warn('[HardwareCtrl] No compatible GPUs detected. Local model inference will not be available.');
  return []; 
};

// --- VRAM Limit Calculation ---
let cachedEffectiveVramLimitGb = null;
const VRAM_SAFETY_MARGIN_GB = 2; // Configurable safety margin

/**
 * Detects the total VRAM of the primary GPU (index 0) and returns an effective limit
 * after subtracting a safety margin. Caches the result.
 * @returns {Promise<number>} Effective VRAM limit in GB. Returns 0 if no compatible GPU found or error occurs.
 */
const getEffectiveGpuVramLimitGb = async () => {
  if (cachedEffectiveVramLimitGb !== null) {
    return cachedEffectiveVramLimitGb;
  }

  try {
    const gpuInfo = await getGpuInfo(); // Reuse existing detection logic

    // Find the primary GPU (index '0' or the first one found)
    const primaryGpu = gpuInfo.devices?.find(d => d.id === '0') || gpuInfo.devices?.[0];

    let totalAvailableGb = 0;
    let calculationSource = "Unknown";

    if (primaryGpu?.type === 'Apple') {
      // Apple Silicon: Use a fraction (e.g., 75%) of total system memory as base.
      calculationSource = "Apple Silicon (75% System RAM)";
      const totalSystemMemBytes = os.totalmem();
      const estimatedAvailableBytes = totalSystemMemBytes * 0.75; // Apply 75% heuristic
      totalAvailableGb = estimatedAvailableBytes / (1024 * 1024 * 1024); // Convert Bytes to GB
    } else if (primaryGpu?.memory && typeof primaryGpu.memory.total === 'number') {
      // Dedicated GPU (e.g., NVIDIA): Use reported VRAM total.
      calculationSource = "Dedicated GPU VRAM";
      const totalVramMib = primaryGpu.memory.total;
      totalAvailableGb = totalVramMib / 1024; // Convert MiB to GB
    } else {
      // Fallback if no primary GPU or VRAM info found
      console.warn('[HardwareCtrl] Could not determine VRAM for primary GPU. Defaulting VRAM limit to 0 GB.');
      cachedEffectiveVramLimitGb = 0;
      return 0;
    }

    // Apply safety margin
    let effectiveLimitGb = 0;
    if (totalAvailableGb <= VRAM_SAFETY_MARGIN_GB) {
       console.warn(`[HardwareCtrl] Source: ${calculationSource}. Available memory (${totalAvailableGb.toFixed(1)} GB) is less than or equal to safety margin (${VRAM_SAFETY_MARGIN_GB} GB). Setting effective limit to 0 GB.`);
       effectiveLimitGb = 0;
    } else {
       effectiveLimitGb = totalAvailableGb - VRAM_SAFETY_MARGIN_GB;
    }

    // Cache and return the calculated limit (ensure it's not negative)
    cachedEffectiveVramLimitGb = Math.max(0, effectiveLimitGb); 
    return cachedEffectiveVramLimitGb;

  } catch (error) {
    console.error(`[HardwareCtrl] Error getting effective VRAM limit: ${error.message}. Defaulting to 0 GB.`);
    cachedEffectiveVramLimitGb = 0; // Cache 0 on error
    return 0;
  }
};
// --- End VRAM Limit Calculation ---


module.exports = {
  getHardwareInfo,
  getHardwareHistory,
  refreshGpuInfo,
  // Export these for other modules that might need them
  getDetailedCpuInfo,
  calculateCpuUsage,
  getMemoryInfo,
  getGpuInfo,
  // Export the data storage functions
  saveHistoricalData,
  getGpuIndices, // Keep existing export
  getEffectiveGpuVramLimitGb // Export the new VRAM limit function
};
