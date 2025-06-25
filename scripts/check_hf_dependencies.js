/**
 * Script to check and install Hugging Face dependencies
 * This script is run automatically when the server starts
 */

const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);

// Paths
const scriptsDir = path.join(__dirname);
const requirementsPath = path.join(scriptsDir, 'requirements.txt');
const downloadScriptPath = path.join(scriptsDir, 'download_hf_model.py');
const venvPath = path.join(scriptsDir, '../venv'); // Standard location with better isolation
const activateScriptPath = path.join(scriptsDir, 'activate_hf_env.sh');

// Safely execute a command, returning true if success, false if failure
function safeExec(command, options = {}) {
  try {
    execSync(command, { stdio: options.silent ? 'ignore' : 'inherit' });
    return true;
  } catch (error) {
    if (!options.silent) {
      console.log(`⚠️ Command failed: ${command}`);
      if (error.stderr) console.log(error.stderr.toString());
    }
    return false;
  }
}

// Safely make a file executable - handles missing chmod gracefully
function safeChmod(filePath) {
  // First try chmod directly (will work on most environments)
  if (safeExec(`chmod +x "${filePath}"`, { silent: true })) {
    return true;
  }
  
  // If chmod isn't available, try using Node.js fs
  try {
    const currentMode = fs.statSync(filePath).mode;
    // Add executable permissions (equivalent to chmod +x)
    // 0o111 = user+group+other executable permission bits
    fs.chmodSync(filePath, currentMode | 0o111);
    console.log(`✅ Made ${path.basename(filePath)} executable using Node.js fs`);
    return true;
  } catch (error) {
    console.log(`⚠️ Could not make ${path.basename(filePath)} executable: ${error.message}`);
    console.log('⚠️ The script may not work correctly without executable permissions');
    return false;
  }
}

// Check if Python is installed, install if not using system package manager
async function checkPython() {
  try {
    // Check if Python is already installed
    const pythonVersion = execSync('python3 --version 2>/dev/null || python --version').toString();
    console.log(`✅ Python detected: ${pythonVersion.trim()}`);
    return true;
  } catch (error) {
    console.log('⚠️ Python not found or not working correctly');
    console.log('⚠️ Python features will be disabled');
    return false;
  }
}

// Create virtual environment for Python
function setupVirtualEnv() {
  console.log('🔍 Setting up isolated Python virtual environment...');
  
  // Check if venv already exists
  if (fs.existsSync(venvPath)) {
    console.log('✅ Virtual environment already exists');
    
    // Update venv configuration to ensure isolation, even if it already exists
    ensureVenvIsolation(venvPath);
    return true;
  }
  
  try {
    // Create the parent directory for venv if it doesn't exist
    if (!fs.existsSync(path.dirname(venvPath))) {
      try {
        fs.mkdirSync(path.dirname(venvPath), { recursive: true });
      } catch (mkdirError) {
        console.log(`⚠️ Could not create directory for virtual environment: ${mkdirError.message}`);
        return false;
      }
    }
    
    // Method 1: Try using python3 -m venv with the --without-pip option 
    // This creates a cleaner isolated environment
    try {
      console.log('Attempting to create isolated virtual environment using venv module...');
      execSync(`python3 -m venv --without-pip "${venvPath}"`);
      console.log('✅ Virtual environment created using venv module with --without-pip');
      
      // Configure the virtual environment for complete isolation
      if (ensureVenvIsolation(venvPath)) {
        // Bootstrap pip using get-pip.py for a cleaner setup
        bootstrapPip(venvPath);
      }
      
      return true;
    } catch (venvError) {
      console.log('⚠️ Could not create isolated virtual environment with venv:', venvError.message);
      console.log('Trying standard venv approach...');
      
      try {
        execSync(`python3 -m venv "${venvPath}"`);
        console.log('✅ Virtual environment created using standard venv module');
        ensureVenvIsolation(venvPath);
        return true;
      } catch (stdVenvError) {
        console.log('⚠️ Could not create environment with standard venv:', stdVenvError.message);
      }
    }
    
    // Method 2: Try using virtualenv
    try {
      console.log('Attempting to use virtualenv...');
      execSync(`python3 -m virtualenv "${venvPath}"`);
      console.log('✅ Virtual environment created using virtualenv');
      ensureVenvIsolation(venvPath);
      return true;
    } catch (virtualenvError) {
      console.log('⚠️ Could not create virtual environment using virtualenv:', virtualenvError.message);
    }
    
    console.log('⚠️ Failed to create Python virtual environment');
    return false;
  } catch (error) {
    console.log('❌ Failed to set up virtual environment:', error.message);
    console.log('⚠️ Will proceed without a virtual environment. Some features may not work correctly.');
    return false;
  }
}

// Ensure the virtual environment is properly isolated
function ensureVenvIsolation(venvPath) {
  try {
    // Check for pyvenv.cfg file
    const pyvenvCfgPath = path.join(venvPath, 'pyvenv.cfg');
    if (fs.existsSync(pyvenvCfgPath)) {
      console.log('Ensuring virtual environment isolation...');
      
      // Read existing content
      let content = fs.readFileSync(pyvenvCfgPath, 'utf8');
      
      // Parse content to find existing settings
      const settings = {};
      content.split('\n').forEach(line => {
        const parts = line.split('=').map(part => part.trim());
        if (parts.length === 2) {
          settings[parts[0]] = parts[1];
        }
      });
      
      // Update settings
      settings['include-system-site-packages'] = 'false';
      
      // Create updated content
      const updatedContent = Object.entries(settings)
        .map(([key, value]) => `${key} = ${value}`)
        .join('\n') + '\n';
      
      // Write updated content back
      fs.writeFileSync(pyvenvCfgPath, updatedContent);
      console.log('✅ Updated pyvenv.cfg to ensure isolation');
      return true;
    } else {
      console.log('⚠️ pyvenv.cfg not found, cannot ensure isolation');
      return false;
    }
  } catch (error) {
    console.log(`⚠️ Error ensuring virtual environment isolation: ${error.message}`);
    return false;
  }
}

// Bootstrap pip installation inside the virtual environment
function bootstrapPip(venvPath) {
  try {
    console.log('Bootstrapping pip in the virtual environment...');
    
    // Get Python path inside the virtual environment
    const pythonPath = path.join(venvPath, 'bin', 'python');
    if (!fs.existsSync(pythonPath)) {
      console.log('⚠️ Python executable not found in virtual environment');
      return false;
    }
    
    // Create temp directory for get-pip.py
    const tmpDir = path.join(venvPath, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    // Download get-pip.py
    const getPipPath = path.join(tmpDir, 'get-pip.py');
    console.log('Downloading get-pip.py...');
    
    // Try with curl first, then wget if available
    try {
      execSync(`curl -s https://bootstrap.pypa.io/get-pip.py -o "${getPipPath}"`);
    } catch (curlError) {
      try {
        execSync(`wget -q https://bootstrap.pypa.io/get-pip.py -O "${getPipPath}"`);
      } catch (wgetError) {
        console.log('⚠️ Failed to download get-pip.py. Curl and wget both failed.');
        return false;
      }
    }
    
    // Install pip using get-pip.py with isolation flags
    console.log('Installing pip using get-pip.py...');
    
    // Set isolation environment variables
    const env = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PIP_USER: '0',
      PIP_REQUIRE_VIRTUALENV: '0',
      PIP_NO_USER_CONFIG: '1'
    };
    
    execSync(`"${pythonPath}" "${getPipPath}" --no-user --isolated --no-cache-dir`, { env });
    
    // Check if pip was successfully installed
    const pipPath = path.join(venvPath, 'bin', 'pip');
    if (fs.existsSync(pipPath)) {
      console.log('✅ Pip successfully bootstrapped');
      
      // Create pip.conf preemptively
      configurePipEnvironment(venvPath);
      
      // Clean up
      try {
        fs.unlinkSync(getPipPath);
        fs.rmdirSync(tmpDir);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return true;
    } else {
      console.log('⚠️ Pip installation failed');
      return false;
    }
  } catch (error) {
    console.log(`⚠️ Error bootstrapping pip: ${error.message}`);
    return false;
  }
}

// Configure pip environment to prevent user install issues
function configurePipEnvironment(venvPath) {
  // Create pip.conf directory if it doesn't exist
  const pipConfigDir = path.join(venvPath, 'pip');
  if (!fs.existsSync(pipConfigDir)) {
    try {
      fs.mkdirSync(pipConfigDir, { recursive: true });
    } catch (error) {
      console.log(`⚠️ Could not create pip config directory: ${error.message}`);
    }
  }
  
  // Create pip.conf file with proper settings if it doesn't exist
  const pipConfigFile = path.join(pipConfigDir, 'pip.conf');
  if (!fs.existsSync(pipConfigFile)) {
    try {
      const pipConfigContent = `[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
`;
      fs.writeFileSync(pipConfigFile, pipConfigContent);
      console.log(`✅ Created pip.conf at ${pipConfigFile}`);
    } catch (error) {
      console.log(`⚠️ Could not create pip.conf: ${error.message}`);
    }
  }
  
  return pipConfigFile;
}

// Install Python dependencies with robust error handling
async function installDependencies() {
  console.log('📦 Installing minimal Python dependencies...');
  
  try {
    // Check if virtual environment exists
    if (!fs.existsSync(venvPath)) {
      console.log('⚠️ Virtual environment not found, skipping dependency installation');
      return false;
    }
    
    // Determine virtual environment bin directory
    const venvBinDir = path.join(venvPath, os.platform() === 'win32' ? 'Scripts' : 'bin');
    
    // Check if pip exists in the virtual environment
    const pipPath = path.join(venvBinDir, os.platform() === 'win32' ? 'pip.exe' : 'pip');
    if (!fs.existsSync(pipPath)) {
      console.log('⚠️ pip not found in virtual environment, skipping dependency installation');
      return false;
    }
    
    // Configure pip environment and create pip.conf
    const pipConfigFile = configurePipEnvironment(venvPath);
    
    // Try to install minimal dependencies
    console.log('📦 Installing minimal dependencies in virtual environment...');
    
    // Install base packages one by one for better error handling
    const basePackages = ['pip', 'setuptools', 'wheel']; // Base packages first
    const minimalPackages = ['requests', 'tqdm']; // Minimal required packages
    
    // Helper function to install a package
    const installPackage = (pkg) => {
      try {
        // Set environment variables to prevent user installs
        const env = {
          ...process.env,
          PIP_USER: '0',
          PIP_REQUIRE_VIRTUALENV: '0',
          PIP_NO_USER_CONFIG: '1',
          PYTHONNOUSERSITE: '1'
        };
        
        // Set PIP_CONFIG_FILE if we successfully created one
        if (pipConfigFile && fs.existsSync(pipConfigFile)) {
          env.PIP_CONFIG_FILE = pipConfigFile;
        }
        
        // Use Windows compatible activate syntax
        if (os.platform() === 'win32') {
          execSync(`"${path.join(venvBinDir, 'activate.bat')}" && "${pipPath}" install --no-user --isolated --no-cache-dir ${pkg}`, { env });
        } else {
          execSync(`${path.join(venvBinDir, 'pip')} install --no-user --isolated --no-cache-dir ${pkg}`, { env });
        }
        console.log(`✅ Installed ${pkg}`);
        return true;
      } catch (error) {
        console.log(`⚠️ Failed to install ${pkg}: ${error.message}`);
        return false;
      }
    };
    
    // Install base packages
    for (const pkg of basePackages) {
      installPackage(pkg);
    }
    
    // Install minimal required packages
    for (const pkg of minimalPackages) {
      installPackage(pkg);
    }
    
    // Try to install huggingface_hub but make it optional
    try {
      // First check if the pip path exists before trying to use it
      if (fs.existsSync(pipPath)) {
        // Set environment variables to prevent user installs
        const env = {
          ...process.env,
          PIP_USER: '0',
          PIP_REQUIRE_VIRTUALENV: '0',
          PIP_NO_USER_CONFIG: '1',
          PYTHONNOUSERSITE: '1'
        };
        
        // Set PIP_CONFIG_FILE if we successfully created one
        if (pipConfigFile && fs.existsSync(pipConfigFile)) {
          env.PIP_CONFIG_FILE = pipConfigFile;
        }
        
        if (os.platform() === 'win32') {
          execSync(`"${path.join(venvBinDir, 'activate.bat')}" && "${pipPath}" install --no-user --isolated --no-cache-dir huggingface_hub`, { env });
        } else {
          execSync(`${path.join(venvBinDir, 'pip')} install --no-user --isolated --no-cache-dir huggingface_hub`, { env });
        }
        console.log('✅ Installed huggingface_hub');
      } else {
        console.log('⚠️ Pip not found, skipping huggingface_hub installation');
      }
    } catch (hfError) {
      console.log('⚠️ Failed to install huggingface_hub, some features may be limited');
    }
    
    console.log('✅ Basic dependencies installed successfully');
    return true;
  } catch (error) {
    console.log('⚠️ Dependency installation failed:', error.message);
    console.log('⚠️ Application will continue with limited functionality');
    return false;
  }
}

// Create models directory if it doesn't exist
function createModelsDir() {
  const modelsDir = path.join(process.cwd(), 'models');
  
  if (!fs.existsSync(modelsDir)) {
    try {
      fs.mkdirSync(modelsDir, { recursive: true });
      console.log('✅ Created models directory');
    } catch (error) {
      console.log('⚠️ Could not create models directory:', error.message);
    }
  } else {
    console.log('✅ Models directory already exists');
  }
  
  return true;
}

// Check for SSL support in Python without any external dependencies
async function checkSSLSupport() {
  try {
    const result = await execPromise('python3 -c "import ssl; print(\'SSL available\')"');
    if (result.stdout.includes('SSL available')) {
      console.log('✅ SSL support available in Python');
      return true;
    }
  } catch (error) {
    try {
      const result = await execPromise('python -c "import ssl; print(\'SSL available\')"');
      if (result.stdout.includes('SSL available')) {
        console.log('✅ SSL support available in Python');
        return true;
      }
    } catch (error) {
      console.log('⚠️ SSL module not available in Python');
      return false;
    }
  }
  
  return false;
}

// Main function with robust error handling
async function checkHuggingFaceDependencies() {
  console.log('🔍 Checking and configuring model dependencies...');
  
  // Create models directory regardless of Python status
  createModelsDir();
  
  // Check for Python - if not available, we'll still continue but with limited functionality
  const pythonOk = await checkPython();
  if (!pythonOk) {
    console.log('⚠️ Python not available. Model management will be limited.');
    console.log('⚠️ Application will continue with basic functionality only.');
    return false;
  }
  
  // Check SSL support - this affects how we download models
  const sslSupported = await checkSSLSupport();
  
  // Create a virtual environment for better isolation
  const venvOk = setupVirtualEnv();
  
  // Install dependencies if virtual environment was created successfully
  if (venvOk) {
    await installDependencies();
  } else {
    console.log('⚠️ Virtual environment setup failed, skipping dependency installation');
  }
  
  // Make download scripts executable if possible, but continue regardless
  if (fs.existsSync(downloadScriptPath)) {
    safeChmod(downloadScriptPath);
  }
  
  // Make curl download script executable if it exists
  const curlScriptPath = path.join(__dirname, 'curl_download_model.sh');
  if (fs.existsSync(curlScriptPath)) {
    safeChmod(curlScriptPath);
  }
  
  console.log('✅ Model dependency setup completed');
  console.log('📝 The application will continue even if some dependencies are missing');
  return true;
}

// Run the check and export the function
(async () => {
  try {
    await checkHuggingFaceDependencies();
  } catch (error) {
    console.error('Error during dependency setup:', error.message);
    console.log('⚠️ Application will continue with limited functionality');
  }
})();

module.exports = { checkHuggingFaceDependencies };
