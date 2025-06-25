/**
 * Create symbolic links for model test directories
 * Ensures model directories are accessible to the server
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Source directories
const SOURCE_DIRS = [
  'models/test-model-123',
  'models/test-model-dir'
];

// Target directory - server models directory
const TARGET_DIR = path.join(process.cwd(), 'models');

console.log(`Checking if target directory exists: ${TARGET_DIR}`);
if (!fs.existsSync(TARGET_DIR)) {
  console.log(`Creating target directory: ${TARGET_DIR}`);
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// Create symbolic links
SOURCE_DIRS.forEach(sourceDir => {
  const sourcePath = path.resolve(sourceDir);
  const dirName = path.basename(sourceDir);
  const targetPath = path.join(TARGET_DIR, dirName);
  
  console.log(`Processing: ${dirName}`);
  console.log(`Source: ${sourcePath}`);
  console.log(`Target: ${targetPath}`);

  try {
    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`Source directory doesn't exist: ${sourcePath}`);
      
      // Create the directory since it doesn't exist
      console.log(`Creating directory: ${sourcePath}`);
      fs.mkdirSync(sourcePath, { recursive: true });
      
      // Create a config.json file in the directory
      const configPath = path.join(sourcePath, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        name: dirName,
        created: new Date().toISOString(),
        version: "1.0"
      }, null, 2));
      
      console.log(`Created config.json in ${sourcePath}`);
    }
    
    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      try {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink()) {
          console.log(`Removing existing symlink: ${targetPath}`);
          fs.unlinkSync(targetPath);
        } else if (stats.isDirectory()) {
          console.log(`Target is a directory, not a symlink. Skipping: ${targetPath}`);
          return;
        }
      } catch (error) {
        console.error(`Error checking target: ${error.message}`);
        return;
      }
    }
    
    // If target directory exists as a real directory, don't create symlink
    // Instead, copy the config.json file to it
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      console.log(`Target exists as a directory. Copying config.json instead of creating symlink.`);
      const sourceConfig = path.join(sourcePath, 'config.json');
      const targetConfig = path.join(targetPath, 'config.json');
      
      if (fs.existsSync(sourceConfig)) {
        fs.copyFileSync(sourceConfig, targetConfig);
        console.log(`Copied config.json to ${targetPath}`);
      } else {
        // Create a config.json in the target directory
        fs.writeFileSync(targetConfig, JSON.stringify({
          name: dirName,
          created: new Date().toISOString(),
          version: "1.0"
        }, null, 2));
        console.log(`Created config.json in ${targetPath}`);
      }
      return;
    }
    
    // Create the symbolic link
    try {
      // On macOS/Linux, use relative paths for symlinks
      const relativePath = path.relative(path.dirname(targetPath), sourcePath);
      console.log(`Creating symlink with relative path: ${relativePath}`);
      fs.symlinkSync(relativePath, targetPath, 'dir');
      console.log(`Created symlink: ${targetPath} -> ${relativePath}`);
    } catch (symlinkError) {
      if (symlinkError.code === 'EPERM') {
        console.log(`Permission denied. Trying with sudo or elevated privileges...`);
        try {
          // Note: This requires sudo access and will prompt for password
          execSync(`ln -sf "${sourcePath}" "${targetPath}"`);
          console.log(`Created symlink using system command`);
        } catch (cmdError) {
          console.error(`System command also failed: ${cmdError.message}`);
          
          // As a last resort, create a real directory instead of a symlink
          try {
            console.log(`Creating a real directory instead: ${targetPath}`);
            fs.mkdirSync(targetPath, { recursive: true });
            
            // Create a config.json in the directory
            const configPath = path.join(targetPath, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify({
              name: dirName,
              created: new Date().toISOString(),
              version: "1.0"
            }, null, 2));
            
            console.log(`Created directory and config.json: ${targetPath}`);
          } catch (mkdirError) {
            console.error(`Failed to create directory: ${mkdirError.message}`);
          }
        }
      } else {
        console.error(`Error creating symlink: ${symlinkError.message}`);
      }
    }
  } catch (error) {
    console.error(`Error processing ${dirName}: ${error.message}`);
  }
});

console.log('\nVerifying model directories:');
try {
  const entries = fs.readdirSync(TARGET_DIR, { withFileTypes: true });
  const dirs = entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink());
  
  console.log(`Found ${dirs.length} directories in ${TARGET_DIR}:`);
  dirs.forEach(dir => {
    const dirPath = path.join(TARGET_DIR, dir.name);
    const isSymlink = fs.lstatSync(dirPath).isSymbolicLink();
    
    let linkPath = '';
    if (isSymlink) {
      try {
        linkPath = fs.readlinkSync(dirPath);
      } catch (err) {
        linkPath = 'Error reading link';
      }
    }
    
    const hasConfig = fs.existsSync(path.join(dirPath, 'config.json'));
    
    console.log(`- ${dir.name} (${isSymlink ? 'Symlink -> ' + linkPath : 'Directory'}, ${hasConfig ? 'has config' : 'no config'})`);
  });
} catch (error) {
  console.error(`Error verifying model directories: ${error.message}`);
}

console.log('\nDone!');
