/**
 * Frontend Build Script
 * 
 * This script builds the frontend React application for production.
 * Updated to work with NVM and install modules in the right directories.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get script absolute paths
const scriptDir = __dirname;
const rootDir = path.resolve(scriptDir, '..');
const frontendDir = path.join(rootDir, 'frontend');

// Print basic info
console.log('==== Frontend Build Process ====');
console.log(`Frontend directory: ${frontendDir}`);

// Ensure the frontend directory exists
if (!fs.existsSync(frontendDir)) {
  console.error('❌ Frontend directory not found!');
  process.exit(1);
}

// Check if package.json exists
if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.error('❌ package.json not found in frontend directory!');
  process.exit(1);
}

// Ensure we're using the correct Node version from NVM if available
try {
  console.log('🔍 Checking for NVM environment...');
  
  // Check for NVM_DIR environment variable
  const nvmDir = process.env.NVM_DIR;
  if (nvmDir) {
    console.log('✅ NVM directory found at: ' + nvmDir);
    
    // Try to get the current Node version
    const nodeVersion = process.version;
    console.log(`Current Node.js version: ${nodeVersion}`);
  } else {
    console.log('⚠️ NVM environment not detected. Using system Node.js.');
  }
} catch (error) {
  console.log('⚠️ Error checking NVM environment: ' + error.message);
}

// Always change to frontend directory
process.chdir(frontendDir);
console.log(`Working directory changed to: ${process.cwd()}`);

// Function to run a command and handle errors
function runCommand(command, options = {}) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { 
      stdio: 'inherit',
      ...options
    });
    return true;
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    console.error(error.message);
    return false;
  }
}

// Verify if tailwindcss is actually installed
function verifyTailwindInstallation() {
  console.log('🔍 Verifying Tailwind installation...');
  
  const tailwindPath = path.join(frontendDir, 'node_modules', 'tailwindcss');
  const tailwindExists = fs.existsSync(tailwindPath);
  
  if (tailwindExists) {
    console.log('✅ Tailwind found at: ' + tailwindPath);
    return true;
  } else {
    console.log('⚠️ Tailwind not found in node_modules!');
    return false;
  }
}

// Function to ensure Tailwind dependencies are installed
function installTailwindDependencies() {
  console.log('📦 Installing Tailwind dependencies...');
  
  if (verifyTailwindInstallation()) {
    return true;
  }
  
  // First try: Direct local installation of tailwindcss specifically
  console.log('📦 Installing tailwindcss directly...');
  let success = runCommand(
    `npm install --save-dev tailwindcss@latest @tailwindcss/postcss@latest --prefix="${frontendDir}"`,
    { cwd: frontendDir }
  );
  
  // Check if it worked
  if (success && verifyTailwindInstallation()) {
    console.log('✅ Direct tailwindcss installation successful');
    
    // Now install the plugins
    console.log('📦 Installing tailwindcss plugins...');
    runCommand(
      `npm install --save-dev @tailwindcss/forms@latest @tailwindcss/typography@latest postcss@latest autoprefixer@latest --prefix="${frontendDir}"`,
      { cwd: frontendDir }
    );
    
    return true;
  }
  
  // Second try: With legacy-peer-deps
  console.log('⚠️ Direct install failed, trying with legacy-peer-deps...');
  success = runCommand(
    `npm install --save-dev tailwindcss@latest @tailwindcss/postcss@latest --legacy-peer-deps --prefix="${frontendDir}"`,
    { cwd: frontendDir }
  );
  
  // Check again
  if (success && verifyTailwindInstallation()) {
    console.log('✅ Installation with legacy-peer-deps successful');
    
    runCommand(
      `npm install --save-dev @tailwindcss/forms@latest @tailwindcss/typography@latest postcss@latest autoprefixer@latest --legacy-peer-deps --prefix="${frontendDir}"`,
      { cwd: frontendDir }
    );
    
    return true;
  }
  
  // Last resort: Manual installation
  console.log('⚠️ Normal installation methods failed. Trying manual npm installation...');
  
  // Install tailwindcss directly into the frontend directory's node_modules
  runCommand(
    `cd "${frontendDir}" && mkdir -p node_modules/tailwindcss && npm pack tailwindcss@latest && tar -xzf tailwindcss-*.tgz -C node_modules/tailwindcss --strip-components 1 && rm tailwindcss-*.tgz`,
    { shell: true }
  );
  
  if (verifyTailwindInstallation()) {
    console.log('✅ Manual installation successful');
    return true;
  }
  
  console.log('❌ All installation methods failed for tailwindcss!');
  return false;
}

// Function to install UI components
function installUIComponents() {
  console.log('📦 Installing UI components...');
  
  return runCommand(
    `npm install --save @headlessui/react@latest --prefix="${frontendDir}"`,
    { cwd: frontendDir }
  );
}

// Function to ensure all dependencies are installed
function installAllDependencies() {
  console.log('📦 Installing all dependencies...');
  
  const success = runCommand(
    `npm install --legacy-peer-deps --prefix="${frontendDir}"`,
    { 
      cwd: frontendDir,
      env: {
        ...process.env,
        NODE_PATH: path.join(frontendDir, 'node_modules')
      }
    }
  );
  
  // Check tailwind installation again after npm install
  if (!verifyTailwindInstallation()) {
    console.log('⚠️ Tailwind still not found after npm install. Forcing direct installation...');
    installTailwindDependencies();
  }
  
  return success;
}

// Build the frontend
function buildFrontend() {
  console.log('🔨 Building frontend application...');
  
  // Set production environment
  process.env.NODE_ENV = 'production';
  
  const buildSuccess = runCommand(
    `npm run build --prefix="${frontendDir}"`,
    { 
      cwd: frontendDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_PATH: path.join(frontendDir, 'node_modules')
      }
    }
  );
  
  if (!buildSuccess) {
    console.error('❌ Build failed');
    process.exit(1);
  }
  
  return verifyBuild();
}

// Verify the build output
function verifyBuild() {
  console.log('✅ Verifying build output...');
  
  const buildDir = path.join(frontendDir, 'build');
  
  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory not created!');
    return false;
  }
  
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.error('❌ index.html not found in build directory!');
    return false;
  }
  
  if (!fs.existsSync(path.join(buildDir, 'static'))) {
    console.error('❌ static directory not found in build directory!');
    return false;
  }
  
  console.log(`✅ Build completed successfully in: ${buildDir}`);
  return true;
}

// Fix Tailwind CSS configuration with a simplified, reliable approach
function fixTailwindConfiguration() {
  console.log('🔄 Setting up fixed Tailwind CSS v3.3.3 configuration...');
  
  try {
    // Create a fixed PostCSS configuration for Tailwind CSS v3.3.3
    const postcssConfigPath = path.join(frontendDir, 'postcss.config.js');
    
    const postcssConfig = `// PostCSS Configuration for Tailwind CSS v3.3.3
module.exports = {
  plugins: {
    // The order matters: Tailwind CSS processes CSS before Autoprefixer
    tailwindcss: {},
    autoprefixer: {},
  }
}
`;
    
    fs.writeFileSync(postcssConfigPath, postcssConfig, 'utf8');
    console.log('✅ Created fixed PostCSS configuration for Tailwind CSS v3.3.3');
    
    // Ensure the right versions are installed
    console.log('🔧 Ensuring compatible Tailwind CSS package versions...');
    runCommand(
      `npm install --save-dev @tailwindcss/forms@0.5.3 @tailwindcss/typography@0.5.9 tailwindcss@3.3.3 postcss@8.4.31 autoprefixer@10.4.16 --prefix="${frontendDir}"`,
      { cwd: frontendDir }
    );
    
    console.log('✅ Tailwind configuration fix completed');
  } catch (error) {
    console.error('⚠️ Error fixing Tailwind configuration:', error.message);
    console.log('⚠️ Continuing anyway, but build may fail');
  }
}

// Main build process
async function main() {
  try {
    // Step 1: Install dependencies
    console.log('STEP 1: Installing dependencies');
    installTailwindDependencies();
    installUIComponents();
    installAllDependencies();
    
    // Step 1.5: Fix Tailwind CSS configuration
    fixTailwindConfiguration();
    
    // Step 2: Build frontend
    console.log('STEP 2: Building frontend');
    const buildSuccess = buildFrontend();
    
    if (buildSuccess) {
      console.log('==== Frontend Build Completed Successfully ====');
    } else {
      console.error('==== Frontend Build Failed ====');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unhandled error during build process:');
    console.error(error);
    process.exit(1);
  }
}

// Run the build process
main();
