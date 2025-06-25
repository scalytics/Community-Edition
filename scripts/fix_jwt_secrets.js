#!/usr/bin/env node
/**
 * JWT Secrets Fix Utility
 * 
 * This script fixes the JWT_SECRET and ENCRYPTION_SECRET placeholders in .env files
 * and ensures JWT_EXPIRE is set to 24h for consistent token expiration.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Generate a secure random key
const generateSecureKey = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

// Main function to fix environment variables
const fixJwtSecrets = (envFilePath) => {
  console.log(`Checking JWT secrets in ${envFilePath}...`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(envFilePath)) {
      console.error(`File not found: ${envFilePath}`);
      return false;
    }
    
    // Read and parse the env file
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    const envVars = dotenv.parse(envContent);
    
    let updated = false;
    
    // Check JWT_SECRET
    if (!envVars.JWT_SECRET || 
        envVars.JWT_SECRET === 'change_this_to_a_secure_random_string' ||
        envVars.JWT_SECRET === '${JWT_SECRET_PLACEHOLDER}' ||
        envVars.JWT_SECRET.includes('$(openssl') ||
        envVars.JWT_SECRET.length < 32) {
      console.log('Generating new JWT_SECRET...');
      envVars.JWT_SECRET = generateSecureKey();
      updated = true;
    }
    
    // Check ENCRYPTION_SECRET
    if (!envVars.ENCRYPTION_SECRET || 
        envVars.ENCRYPTION_SECRET === 'change_this_to_a_secure_32_char_string' ||
        envVars.ENCRYPTION_SECRET === '${ENCRYPTION_SECRET_PLACEHOLDER}' ||
        envVars.ENCRYPTION_SECRET.includes('$(openssl') ||
        envVars.ENCRYPTION_SECRET.length < 32) {
      console.log('Generating new ENCRYPTION_SECRET...');
      envVars.ENCRYPTION_SECRET = generateSecureKey();
      updated = true;
    }
    
    // Check JWT_EXPIRE
    if (!envVars.JWT_EXPIRE || envVars.JWT_EXPIRE !== '24h') {
      console.log('Setting JWT_EXPIRE to 24h...');
      envVars.JWT_EXPIRE = '24h';
      updated = true;
    }
    
    // If changes were made, update the file
    if (updated) {
      // Create backup of original file
      const backupPath = `${envFilePath}.backup-${Date.now()}`;
      fs.copyFileSync(envFilePath, backupPath);
      console.log(`Created backup at ${backupPath}`);
      
      // Write updated content
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      fs.writeFileSync(envFilePath, newEnvContent);
      console.log('Successfully updated environment variables');
      return true;
    } else {
      console.log('No changes needed - JWT secrets are already properly configured');
      return true;
    }
  } catch (error) {
    console.error('Error fixing JWT secrets:', error.message);
    return false;
  }
};

// Main execution
const main = () => {
  const cwd = process.cwd();
  console.log(`Running in: ${cwd}`);
  
  // Check multiple possible env file locations
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.production'),
    path.join(cwd, '.env.local')
  ];
  
  let successCount = 0;
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const success = fixJwtSecrets(envFile);
      if (success) successCount++;
    }
  }
  
  if (successCount > 0) {
    console.log(`Successfully processed ${successCount} environment files`);
    console.log('Restart your server to apply the changes');
  } else {
    console.log('No environment files were found or processed');
  }
};

// Run the script
main();
