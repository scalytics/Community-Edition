/**
 * Direct file downloader for Hugging Face models
 * Uses curl for direct file downloads with progress tracking
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const axios = require('axios');

/**
 * Generate the curl command that would be used to download a file
 * @param {string} modelId - Hugging Face model ID
 * @param {string} filePath - File path (can include subdirectories)
 * @param {string} outputDir - Directory to save to
 * @param {Object} options - Additional options
 * @returns {Object} - Object containing command, args, and display command
 */
function generateCurlCommand(modelId, filePath, outputDir, options = {}) {
  // Get just the filename from the path
  const filename = path.basename(filePath);
  
  // Construct the URL for the file (using the full path from repo root)
  const fileUrl = `https://huggingface.co/${modelId}/resolve/main/${filePath}`;
  
  // For output, we just want the filename in the target directory, not any repo subdirectories
  const outputPath = path.join(outputDir, filename);
  
  console.log(`Downloading: ${filePath}`);
  console.log(`From: ${fileUrl}`);
  console.log(`To: ${outputPath}`);
  
  // Prepare curl arguments
  const curlArgs = [
    '--location',       // Follow redirects
    '--create-dirs',    // Create directories if needed
    '--output', outputPath,
    '--silent'
  ];
  
  // Add Hugging Face API token if provided
  if (options.token) {
    curlArgs.push('--header', `Authorization: Bearer ${options.token}`);
  }
  
  // Add the URL to download
  curlArgs.push(fileUrl);
  
  // Create a display version with token redacted for security
  const displayArgs = [...curlArgs];
  if (options.token) {
    const authIndex = displayArgs.indexOf('--header');
    if (authIndex !== -1) {
      displayArgs[authIndex + 1] = 'Authorization: Bearer [REDACTED]';
    }
  }
  
  return {
    command: 'curl',
    args: curlArgs,
    displayCommand: `curl ${displayArgs.join(' ')}`,
    fileUrl,
    outputPath
  };
}

/**
 * Download a specific file from Hugging Face using curl
 * @param {string} modelId - Hugging Face model ID (e.g., 'TheBloke/phi-2-GGUF')
 * @param {string} filename - Exact filename to download (e.g., 'phi-2.Q2_K.gguf')
 * @param {string} outputDir - Directory to save the file to
 * @param {Object} options - Additional options
 * @param {string} options.token - Hugging Face API token
 * @returns {Object} - Process and handlers for tracking progress
 */
async function downloadModelFile(modelId, filename, outputDir, options = {}) {
  console.log(`Direct downloader: Downloading ${filename} from ${modelId} to ${outputDir}`);
  
  try {
    // Create output directory if it doesn't exist
    if (!fsSync.existsSync(outputDir)) {
      await fs.mkdir(outputDir, { recursive: true });
    }
    
    // Generate the curl command
    const curlInfo = generateCurlCommand(modelId, filename, outputDir, options);
    
    console.log(`\nDownloading file using the following command:`);
    console.log(`${curlInfo.displayCommand}\n`);
    console.log(`File URL: ${curlInfo.fileUrl}`);
    console.log(`Output path: ${curlInfo.outputPath}`);
    
    // Update curl args with any additional options
    const finalArgs = [...curlInfo.args];
    
    // We always run in quiet mode with just a single progress line
    
    // Log command details and start the download
    const curlProcess = spawn('curl', finalArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Add the curl command to the process for display in UI
    curlProcess.curlCommand = curlInfo.displayCommand;
    curlProcess.curlOutput = [];
    
    // Function to parse curl progress output
    const parseProgress = (data) => {
      const output = data.toString();
      
      // Add to output lines for display
      if (output.trim()) {
        if (curlProcess.curlOutput.length > 20) {
          curlProcess.curlOutput.shift();
        }
        curlProcess.curlOutput.push(output.trim());
      }
      
      // curl progress-bar output looks like "#####                 33.5%"
      const percentMatch = output.match(/\s*(\d+\.\d+)%/);
      if (percentMatch && percentMatch[1]) {
        return parseFloat(percentMatch[1]);
      }
      
      return null;
    };
    
    // Return the process and progress handlers
    return {
      process: curlProcess,
      outputHandlers: {
        handleStdout: (data) => {
          return parseProgress(data);
        },
        handleStderr: (data) => {
          const output = data.toString();
          console.log(`Curl stderr: ${output}`);
          
          // Add to output lines for display
          if (output.trim()) {
            if (curlProcess.curlOutput.length > 20) {
              curlProcess.curlOutput.shift();
            }
            curlProcess.curlOutput.push(`[stderr] ${output.trim()}`);
          }
        }
      }
    };
  } catch (error) {
    console.error('Error in direct downloader:', error);
    throw error;
  }
}

/**
 * Get files from a specific path within a Hugging Face repository
 * @param {string} modelId - Hugging Face model ID
 * @param {string} subPath - Subdirectory path to check (relative to main)
 * @param {string} token - Hugging Face API token (optional)
 * @returns {Promise<Array>} - List of files and directories
 */
async function getRepoContents(modelId, subPath = '', token = null) {
  try {
    // Normalize the subpath to ensure it doesn't have leading/trailing slashes
    const normalizedPath = subPath.replace(/^\/+|\/+$/g, '');
    
    // Construct the API URL
    const apiUrlPath = normalizedPath ? `${normalizedPath}` : '';
    const apiUrl = `https://huggingface.co/api/models/${modelId}/tree/main/${apiUrlPath}`;
    
    console.log(`Checking HF repository path: ${apiUrl}`);
    
    // Set up headers for authentication if token is provided
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    // Make the API request
    const response = await axios.get(apiUrl, { headers });
    
    // The item.path from the API seems to already contain the full relative path from the repo root.
    return response.data.map(item => ({
      ...item,
      fullPath: item.path // Use item.path directly as the full path
    }));
  } catch (error) {
    console.error(`Error accessing ${subPath} in ${modelId}:`, error.message);
    return [];
  }
}

/**
 * Recursively scan repository directories to find all files
 * @param {string} modelId - Hugging Face model ID
 * @param {string} dirPath - Current directory path to scan
 * @param {string} token - Hugging Face API token (optional)
 * @param {Set} processedDirs - Set of already processed directories to avoid loops
 * @param {number} depth - Current recursion depth to prevent infinite recursion
 * @param {boolean} verbose - Whether to output detailed logs
 * @returns {Promise<Array>} - List of files
 */
async function scanDirectory(modelId, dirPath, token = null, processedDirs = new Set(), depth = 0, verbose = false) {
  // Prevent infinite recursion - limit depth to reasonable value
  if (depth > 5) {
    if (verbose) console.log(`Max directory depth reached (${depth}) for ${dirPath}, stopping recursion`);
    return [];
  }
  
  // Skip directories we've already processed (prevents loops)
  const dirKey = `${modelId}:${dirPath}`;
  if (processedDirs.has(dirKey)) {
    if (verbose) console.log(`Already processed directory ${dirPath}, skipping`);
    return [];
  }
  
  // Mark this directory as processed
  processedDirs.add(dirKey);
  
  // Only log when in debug mode and at top level to reduce noise
  if (process.env.DEBUG_MODE === 'true' && depth === 0) {
    console.log(`Scanning directory at depth ${depth}: ${dirPath || 'root'}`);
  }
  
  // Get contents of this directory
  const contents = await getRepoContents(modelId, dirPath, token);
  
  // Extract files at this level
  const files = contents.filter(item => item.type === 'file');
  
  // Find subdirectories to recursively scan
  const directories = contents.filter(item => item.type === 'directory');
  
  // Results array will contain files from this level + subdirectories
  let allFiles = [...files];
  
  // Recursively scan subdirectories
  for (const dir of directories) {
    const subFiles = await scanDirectory(
      modelId, 
      dir.fullPath, 
      token, 
      processedDirs,
      depth + 1,
      verbose
    );
    allFiles = allFiles.concat(subFiles);
  }
  
  return allFiles;
}

/**
 * Get file list for a model in Hugging Face, fully recursive search
 * @param {string} modelId - Hugging Face model ID
 * @param {string} token - Hugging Face API token (optional)
 * @returns {Promise<Array>} - List of files
 */
async function getModelFiles(modelId, token = null) {
  try {
    // Log once at the beginning of the search
    console.log(`Searching for model files in repository: ${modelId}`);
    
    // Perform complete recursive scan starting from root
    const allFiles = await scanDirectory(modelId, '', token, new Set(), 0, false);
    
    // Log detected model files
    const modelFiles = allFiles.filter(file => 
      ['.bin', '.safetensors', '.pt', '.pth'].some(ext => file.path.toLowerCase().endsWith(ext))
    );
    
    if (modelFiles.length > 0) {
      console.log(`Found ${modelFiles.length} model files:`);
      
      // Only log the available model files once
      console.log('Available model files:');
      modelFiles.forEach(file => {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        console.log(`- ${file.path} (${fileSizeMB} MB)`);
      });
    } else {
      console.error('No suitable model files found in this repository');
      
      // Only show a few representative files as a fallback
      const representativeFiles = allFiles.slice(0, 5);
      if (representativeFiles.length > 0) {
        console.log('Files found in repository:');
        representativeFiles.forEach(file => {
          console.log(`- ${file.path}`);
        });
       }
     }
     
     // Format file information
     return allFiles.map(item => ({
      name: path.basename(item.path),
      path: item.fullPath || item.path,
      size: item.size || 0,
      lastModified: item.lastCommit?.date
    }));
  } catch (error) {
    console.error(`Error getting model files for ${modelId}:`, error);
    return [];
  }
}

module.exports = {
  downloadModelFile,
  getModelFiles
};
