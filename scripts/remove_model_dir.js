#!/usr/bin/env node
/**
 * Script to forcefully delete a model directory
 * Usage: node remove_model_dir.js /path/to/model/directory
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Check arguments
if (process.argv.length !== 3) {
  console.error('Usage: node remove_model_dir.js /path/to/model/directory');
  process.exit(1);
}

const targetDir = process.argv[2];
const modelsDir = path.join(process.cwd(), 'models');

// Validate directory is under models directory for safety
if (!path.normalize(targetDir).startsWith(path.normalize(modelsDir))) {
  console.error(`Safety check failed: ${targetDir} is not within models directory`);
  process.exit(2);
}

// Special checks for config.json
async function removeConfigJson() {
  const configPath = path.join(targetDir, 'config.json');
  
  try {
    // Check if file exists first
    const exists = fs.existsSync(configPath);
    if (!exists) {
      console.log('config.json does not exist, skipping');
      return;
    }
    
    console.log(`Found config.json at ${configPath}, attempting to remove it directly`);
    
    // Try several methods to delete the file
    let deleted = false;
    
    // Method 1: Node.js fs.unlinkSync
    try {
      console.log('Method 1: Using fs.unlinkSync');
      fs.unlinkSync(configPath);
      deleted = !fs.existsSync(configPath);
      if (deleted) {
        console.log('  Success: Deleted with unlinkSync');
        return true;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
    
    // Method 2: Change file permissions and try again
    try {
      console.log('Method 2: Changing permissions and trying again');
      fs.chmodSync(configPath, 0o777);
      fs.unlinkSync(configPath);
      deleted = !fs.existsSync(configPath);
      if (deleted) {
        console.log('  Success: Deleted after changing permissions');
        return true;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
    
    // Method 3: Using rm command
    try {
      console.log('Method 3: Using rm -f command');
      await execPromise(`rm -f "${configPath}"`);
      deleted = !fs.existsSync(configPath);
      if (deleted) {
        console.log('  Success: Deleted with rm -f command');
        return true;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
    
    // Method 4: Using rm with sudo
    try {
      console.log('Method 4: Using sudo rm -f command');
      await execPromise(`sudo rm -f "${configPath}"`);
      deleted = !fs.existsSync(configPath);
      if (deleted) {
        console.log('  Success: Deleted with sudo rm -f command');
        return true;
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
    
    // Method 5: Create a new empty file that will replace the config.json
    try {
      console.log('Method 5: Overwriting file with empty content');
      fs.writeFileSync(configPath, '');
      console.log('  File content cleared');
    } catch (e) {
      console.log(`  Failed to clear file content: ${e.message}`);
    }
    
    return deleted;
  } catch (err) {
    console.error(`Error handling config.json: ${err.message}`);
    return false;
  }
}

// Delete the directory and its contents
async function removeDirectory() {
  try {
    // First try to remove config.json which seems problematic
    await removeConfigJson();
    
    console.log(`Attempting to delete directory: ${targetDir}`);
    
    // Try various methods:
    // Method 1: Standard fs.rmSync
    try {
      console.log('Method 1: Using fs.rmSync');
      fs.rmSync(targetDir, { recursive: true, force: true });
      if (!fs.existsSync(targetDir)) {
        console.log('Success: Directory deleted with fs.rmSync');
        return true;
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
    
    // Method 2: Using child_process 
    try {
      console.log('Method 2: Using rm -rf command');
      await execPromise(`rm -rf "${targetDir}"`);
      if (!fs.existsSync(targetDir)) {
        console.log('Success: Directory deleted with rm -rf command');
        return true;
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
    
    // Method 3: Using sudo
    try {
      console.log('Method 3: Using sudo rm -rf command');
      await execPromise(`sudo rm -rf "${targetDir}"`);
      if (!fs.existsSync(targetDir)) {
        console.log('Success: Directory deleted with sudo rm -rf command');
        return true;
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
    
    // Check if directory still exists
    if (fs.existsSync(targetDir)) {
      console.error('Failed to delete directory after all attempts');
      return false;
    } else {
      console.log('Directory successfully deleted');
      return true;
    }
  } catch (err) {
    console.error(`Error removing directory: ${err.message}`);
    return false;
  }
}

// Main execution
(async () => {
  try {
    const result = await removeDirectory();
    process.exit(result ? 0 : 1);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();
