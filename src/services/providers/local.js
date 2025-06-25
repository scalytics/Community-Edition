/**
 * Local model provider implementation
 * 
 * This module handles invocation of local AI models through various methods
 */
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const os = require('os');

/**
 * Call a local AI model
 * 
 * @param {Object} options - Options for the model call
 * @param {string} options.modelPath - Path to the model file
 * @param {string} options.prompt - Prompt to send to the model
 * @param {Object} options.parameters - Additional parameters for the model
 * @returns {Promise<Object>} - Model response
 */
exports.callModel = async (options) => {
  const { modelPath, prompt, parameters = {} } = options;
  
  // Create a temporary file to store the parameters
  const paramFile = path.join(os.tmpdir(), `model_params_${Date.now()}.json`);
  
  // Write the parameters to the file
  // Default to using GPU with all layers if not specified
  const useGpu = parameters.use_gpu !== false;
  
  // Import prompt formatter
  const { applyPromptFormat } = require('../../../scripts/apply_prompt_format');
  
  // Format the prompt based on model type
  const formattedPrompt = applyPromptFormat(modelPath, prompt);
  
  // Prepare model parameters
  const modelParams = {
    model: modelPath,
    prompt: formattedPrompt,
    // Model generation parameters with descriptions
    temperature: parameters.temperature || 0.7,     // Controls randomness: 0.0=deterministic, 1.0=creative
    max_tokens: Math.min(parameters.max_tokens || 1024, 2048),  // Cap maximum tokens to prevent timeouts
    top_p: parameters.top_p || 1.0,                 // Nucleus sampling: 1.0=consider all tokens, 0.1=only most likely
    top_k: parameters.top_k || 40,                  // Limits to top K most likely tokens (0=disable)
    stop: parameters.stop || null,                  // Stop sequences to end generation early
    repeat_penalty: parameters.repeat_penalty || 1.1, // Penalty for repeating tokens: >1.0 reduces repetition
    
    // Context parameters - set reasonable defaults based on model size
    n_ctx: parameters.n_ctx || 8192,                // Context size in tokens (optimized for memory usage)
    
    // GPU acceleration parameters
    n_gpu_layers: parameters.n_gpu_layers !== undefined ? parameters.n_gpu_layers : (useGpu ? -1 : 0),
    main_gpu: parameters.main_gpu || 0,             // GPU device to use (usually 0)
    
    // Performance parameters
    n_threads: parameters.n_threads || 0,           // CPU threads (0=auto)
    batch_size: parameters.batch_size || 512        // Batch size for prompt processing
  };
  
  // Add tensor_split for multi-GPU support if using GPUs
  if (useGpu) {
    try {
      // Try to detect number of GPUs using nvidia-smi
      const gpuListOutput = execSync('nvidia-smi --list-gpus', { encoding: 'utf8' });
      const gpuCount = gpuListOutput.trim().split('\n').length;
      
      if (gpuCount > 1) {
        // Create even split across available GPUs
        const splitValue = 1.0 / gpuCount;
        modelParams.tensor_split = Array(gpuCount).fill(splitValue);
        console.log(`Configuring tensor_split for ${gpuCount} GPUs: [${modelParams.tensor_split.join(', ')}]`);
      }
    } catch (error) {
      console.log('Could not determine GPU count for tensor_split:', error.message);
    }
  }
  
  // Convert to JSON for passing to Python
  const paramsData = JSON.stringify(modelParams);
  
  fs.writeFileSync(paramFile, paramsData);
  
  // Set environment variables for GPU acceleration
  const env = Object.assign({}, process.env);
  if (useGpu) {
    env.GGML_CUDA = "1";
    env.CUDA_VISIBLE_DEVICES = "0,1";  // Make all GPUs available
    env.GGML_CUDA_FORCE = "1";
  }
  
  // Set environment variables for better debugging
  env.LLAMA_CPP_DEBUG = "1";  // Enable detailed debugging output
  
  // Define the script path
  const scriptPath = path.join(__dirname, '../../../scripts/run_model.py');
  
  // Use cached working Python path if available (initialize paths on first run)
  if (!exports.cachedWorkingPath) {
    // Only run this detection once
    console.log("Initializing Python detection - first run");
    
    // Find the best available Python path
    const pythonPaths = [];
    
    // First check if we can use the python-wrapper.sh script
    const pythonWrapperPath = path.join(__dirname, '../../../scripts/python-wrapper.sh');
    if (fs.existsSync(pythonWrapperPath)) {
      pythonPaths.push(pythonWrapperPath);
    }
    
    // Then add other known working paths
    pythonPaths.push('/var/www/connect/venv/bin/python'); // Production venv first
    pythonPaths.push('python3');                          // System Python as fallback
    
    // Create the cache for future use
    exports.pythonPathsToTry = pythonPaths;
    
    // Also set a flag to remember if we found a working path
    exports.checkedPaths = false;
  }
  
  // Use cached working path if we have one
  if (exports.cachedWorkingPath) {
    console.log(`Using cached working Python path: ${exports.cachedWorkingPath}`);
    try {
      const result = await runWithPython(exports.cachedWorkingPath, scriptPath, paramFile, env);
      // Clean up the parameter file
      try {
        fs.unlinkSync(paramFile);
      } catch (err) {
        console.warn(`Could not delete parameter file: ${err.message}`);
      }
      return result;
    } catch (err) {
      console.error(`Cached path ${exports.cachedWorkingPath} failed, retrying detection: ${err.message}`);
      // If the cached path fails, reset it and try again with full detection
      exports.cachedWorkingPath = null;
      // Fall through to try all paths
    }
  }
  
  // If we don't have a cached path or it failed, try all available paths
  if (!exports.checkedPaths) {
    console.log("Testing available Python paths...");
    
    // Try each Python path until one works
    for (const pythonPath of exports.pythonPathsToTry) {
      console.log(`Trying to run model with Python path: ${pythonPath}`);
      
      try {
        const result = await runWithPython(pythonPath, scriptPath, paramFile, env);
        // Cache the working path for future use
        exports.cachedWorkingPath = pythonPath;
        exports.checkedPaths = true;
        
        console.log(`Found working Python path, caching: ${pythonPath}`);
        
        // Clean up the parameter file
        try {
          fs.unlinkSync(paramFile);
        } catch (err) {
          console.warn(`Could not delete parameter file: ${err.message}`);
        }
        return result;
      } catch (err) {
        console.error(`Failed with Python path ${pythonPath}:`, err.message);
        // Continue to next Python path
      }
    }
    exports.checkedPaths = true; // Mark that we've checked all paths even if none worked
  }
  
  // Removed CLI fallback logic.
  
  // If we got here, all Python methods failed
  // Clean up the parameter file before throwing
  try {
    fs.unlinkSync(paramFile);
  } catch (err) {
    console.warn(`Could not delete parameter file during error handling: ${err.message}`);
  }
  throw new Error(`Failed to run model with any available Python method. Check Python environment and script paths.`);
};

/**
 * Helper function to run a model with a specific Python path
 */
function runWithPython(pythonPath, scriptPath, paramFile, env) {
  return new Promise((resolve, reject) => {
    // Set environment variables to control debugging and performance
    env.LLAMA_CPP_DEBUG = "0";  // Disable verbose debugging
    env.GGML_VERBOSE = "0";     // Disable GGML verbose mode
    env.GGML_MMAP = "1";        // Enable memory mapping for faster loading
    env.LLAMA_KV_CACHE_TYPE = "f16";  // Use f16 for KV cache (more efficient)
    env.LLAMA_PREFER_LEGACY_FORMAT = "1"; // Helps with the "GENERATION QUALITY WILL BE DEGRADED" warning

    const modelProcess = spawn(pythonPath, [
      scriptPath,
      '--params', paramFile
    ], { env });
    
    let outputData = '';
    let errorData = '';
    
    modelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      outputData += text;
    });
    
    modelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      
      // Only log errors to console but don't add them to the response
      errorData += text;
      
      // Don't log all stderr - it's too verbose
      // Only log actual errors or warnings
      if (text.includes('Error:') || text.includes('Warning:') || 
          text.includes('failed') || text.includes('ERROR')) {
        console.log(`Model stderr: ${text}`);
      }
    });
    
    modelProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Process exited with code ${code}`);
        reject(new Error(`Model execution failed: ${errorData}`));
      } else {
        try {
          // Try to parse as JSON
          const response = JSON.parse(outputData);
          resolve(response);
        } catch (e) {
          // If not valid JSON, still return the output as a message
          console.warn(`Warning: Could not parse model output as JSON: ${e.message}`);
          
          // Extract a meaningful response from the output
          const cleanedOutput = outputData.trim()
            .replace(/^Loading.*$/mg, '') // Remove loading messages
            .replace(/^\[.*?\].*$/mg, '') // Remove log lines
            .trim();
          
          resolve({
            message: cleanedOutput || 'Model executed but returned no output',
            provider: 'Local'
          });
        }
      }
    });
    
    modelProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Check if a model file exists and is accessible
 * 
 * @param {string} modelPath - Path to the model file
 * @returns {Promise<boolean>} - Whether the model exists
 */
exports.checkModelExists = async (modelPath) => {
  try {
    await fs.promises.access(modelPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};
