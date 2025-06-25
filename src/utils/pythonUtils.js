/**
 * Python Execution Utilities
 * 
 * This module provides utilities for properly executing Python scripts
 * with the correct environment and virtual environment.
 */
const { exec, spawn } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

// Get the path to the Python wrapper script
const PYTHON_WRAPPER = process.env.PYTHON_CMD || path.join(__dirname, '../../scripts/python-wrapper.sh');

// Check if the wrapper exists
const wrapperExists = fs.existsSync(PYTHON_WRAPPER);
if (!wrapperExists) {
  console.warn(`[WARNING] Python wrapper script not found at ${PYTHON_WRAPPER}`);
  console.warn('Python commands may not work correctly with virtual environment!');
}

// Enforce standard Python venv path
const checkPythonPaths = () => {
  // In production, force the standard path regardless of environment variables
  const inProduction = process.cwd() === '/var/www/connect';
  
  if (inProduction) {
    const standardPath = '/var/www/connect/venv';
    console.log(`[INFO] Production environment detected, using standard venv path: ${standardPath}`);
    return { 
      exists: fs.existsSync(standardPath), 
      path: standardPath,
      python: path.join(standardPath, 'bin', 'python'),
      pip: path.join(standardPath, 'bin', 'pip')
    };
  }
  
  // In development, prioritize the standard path 
  const possiblePaths = [
    path.join(process.cwd(), 'venv'),                  // Standard venv location at app root (ONLY preferred option)
    process.env.PYTHON_VENV_DIR,                       // Only as fallback if explicitly set
  ].filter(Boolean);
  
  // Check if standard path exists
  const standardPath = path.join(process.cwd(), 'venv');
  if (fs.existsSync(standardPath)) {
    const pythonBin = path.join(standardPath, 'bin', 'python');
    if (fs.existsSync(pythonBin)) {
      console.log(`[INFO] Found valid Python virtual environment at: ${standardPath}`);
      return { 
        exists: true, 
        path: standardPath,
        python: pythonBin,
        pip: path.join(standardPath, 'bin', 'pip')
      };
    }
  }
  
  // Try environment variable as fallback
  if (process.env.PYTHON_VENV_DIR && fs.existsSync(process.env.PYTHON_VENV_DIR)) {
    const pythonBin = path.join(process.env.PYTHON_VENV_DIR, 'bin', 'python');
    if (fs.existsSync(pythonBin)) {
      console.log(`[INFO] Using PYTHON_VENV_DIR virtual environment at: ${process.env.PYTHON_VENV_DIR}`);
      // Update environment variable to standard path for future use
      console.log(`[WARNING] Using non-standard Python path. Consider migrating to: ${standardPath}`);
      return { 
        exists: true, 
        path: process.env.PYTHON_VENV_DIR,
        python: pythonBin,
        pip: path.join(process.env.PYTHON_VENV_DIR, 'bin', 'pip')
      };
    }
  }
  
  // No valid environment found
  console.log(`[WARNING] No valid Python virtual environment found, attempted: ${standardPath}`);
  return { exists: false };
};

// Check Python environment on module load
const pythonEnv = checkPythonPaths();
if (pythonEnv.exists) {
  // Set environment variables if found
  process.env.PYTHON_VENV_DIR = pythonEnv.path;
} else {
  console.warn('[WARNING] No valid Python virtual environment found');
}

/**
 * Execute a Python script with the correct environment
 * 
 * @param {string} scriptPath - Path to the Python script
 * @param {string[]} args - Arguments to pass to the script
 * @param {Object} options - Options to pass to child_process.exec
 * @returns {Promise<{stdout: string, stderr: string}>} - Promise resolving to execution result
 */
async function executePythonScript(scriptPath, args = [], options = {}) {
  // Log execution for debugging
  console.log(`[WARN] Executing Python script: ${scriptPath} ${args.join(' ')}`);
  console.log(`[WARN] Using Python environment:
    PYTHON_CMD=${process.env.PYTHON_CMD || 'not set'}
    PYTHON_VENV_DIR=${process.env.PYTHON_VENV_DIR || 'not set'}
    PRESERVE_ADMIN_PASSWORD=${process.env.PRESERVE_ADMIN_PASSWORD || 'not set'}
    NEVER_RESET_ADMIN_PASSWORD=${process.env.NEVER_RESET_ADMIN_PASSWORD || 'not set'}
  `);

  // Try using the wrapper script first (this is the best approach)
  if (wrapperExists) {
    const command = `${PYTHON_WRAPPER} ${scriptPath} ${args.join(' ')}`;
    
    try {
      // Pass through all environment variables, especially the password protection ones
      const execOptions = {
        ...options,
        env: {
          ...process.env,
          ...options.env,
        }
      };
      
      // Important: explicitly pass these variables
      execOptions.env.PRESERVE_ADMIN_PASSWORD = process.env.PRESERVE_ADMIN_PASSWORD || 'true';
      execOptions.env.NEVER_RESET_ADMIN_PASSWORD = process.env.NEVER_RESET_ADMIN_PASSWORD || 'true';
      
      // Log the full command for debugging
      console.log(`[WARN] Python exec command: ${command}`);
      
      return await execPromise(command, execOptions);
    } catch (error) {
      console.error(`Error executing Python script with wrapper: ${error.message}`);
      // If wrapper fails, fall through to the next method
    }
  }
  
  // If wrapper failed or doesn't exist, try the detected virtual env directly
  if (pythonEnv.exists) {
    try {
      const command = `${pythonEnv.python} ${scriptPath} ${args.join(' ')}`;
      console.log(`[WARN] Using detected Python virtual environment: ${command}`);
      
      const execOptions = {
        ...options,
        env: {
          ...process.env,
          ...options.env,
          PATH: `${path.dirname(pythonEnv.python)}:${process.env.PATH}`,
          PYTHONPATH: pythonEnv.path,
          VIRTUAL_ENV: pythonEnv.path
        }
      };
      
      return await execPromise(command, execOptions);
    } catch (error) {
      console.error(`Error executing Python script with detected venv: ${error.message}`);
      // If direct venv execution fails, fall through to system Python
    }
  }
  
  // Last resort: direct Python execution
  console.warn(`[WARNING] Falling back to system Python for: ${scriptPath}`);
  console.warn('This may not work correctly for Python modules requiring virtual environment!');
  
  try {
    const command = `python3 ${scriptPath} ${args.join(' ')}`;
    return await execPromise(command, options);
  } catch (error) {
    console.error(`All Python execution methods failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check if Python virtual environment is properly configured
 * @returns {Promise<boolean>} True if Python virtual environment is available
 */
async function checkPythonEnvironment() {
  try {
    // Check if python wrapper exists
    if (!wrapperExists) {
      console.warn('Python wrapper script not found, virtual environment might not be accessible');
      return false;
    }
    
    // Check if python is available
    const { stdout, stderr } = await execPromise(`${PYTHON_WRAPPER} -c "print('Python environment ok')"`);
    
    if (stdout.includes('Python environment ok')) {
      console.log('Python virtual environment check passed');
      return true;
    } else {
      console.warn('Python virtual environment check failed:', stderr);
      return false;
    }
  } catch (error) {
    console.error('Python environment check error:', error.message);
    return false;
  }
}

module.exports = {
  executePythonScript,
  checkPythonEnvironment,
  PYTHON_WRAPPER
};
