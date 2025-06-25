// src/utils/securityUtils.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Function to generate a secure random string
const generateSecureKey = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

// Function to ensure env file contains secure keys
const ensureSecureKeys = () => {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  let envVars = {};
  
  // Read existing .env file if it exists
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      envVars = dotenv.parse(envContent);
    }
  } catch (error) {
    console.error('Error reading .env file:', error);
  }

  let updated = false;

  // Check and generate JWT_SECRET if needed
  if (!envVars.JWT_SECRET || 
      envVars.JWT_SECRET === 'change_this_to_a_secure_random_string' ||
      envVars.JWT_SECRET === '${JWT_SECRET_PLACEHOLDER}' ||
      envVars.JWT_SECRET.includes('$(openssl') ||
      envVars.JWT_SECRET.length < 32) {
    const jwtSecret = generateSecureKey();
    process.env.JWT_SECRET = jwtSecret;
    envVars.JWT_SECRET = jwtSecret;
    updated = true;
    console.log('=== SECURITY: Generated new JWT_SECRET ===');
  }

  // Check and generate ENCRYPTION_SECRET if needed
  if (!envVars.ENCRYPTION_SECRET || 
      envVars.ENCRYPTION_SECRET === 'change_this_to_a_secure_32_char_string' ||
      envVars.ENCRYPTION_SECRET === '${ENCRYPTION_SECRET_PLACEHOLDER}' ||
      envVars.ENCRYPTION_SECRET.includes('$(openssl') ||
      envVars.ENCRYPTION_SECRET.length < 32) {
    const encryptionKey = generateSecureKey();
    process.env.ENCRYPTION_SECRET = encryptionKey;
    envVars.ENCRYPTION_SECRET = encryptionKey;
    updated = true;
    console.log('=== SECURITY: Generated new ENCRYPTION_SECRET ===');
  }
  
  // Ensure JWT_EXPIRE is set to 24h for consistency
  if (!envVars.JWT_EXPIRE || envVars.JWT_EXPIRE !== '24h') {
    envVars.JWT_EXPIRE = '24h';
    process.env.JWT_EXPIRE = '24h';
    updated = true;
    console.log('=== SECURITY: Updated JWT_EXPIRE to 24h ===');
  }

  // Update .env file if changes were made
  if (updated) {
    const newEnvContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    try {
      fs.writeFileSync(envPath, newEnvContent);
      console.log('=== SECURITY: Updated .env file with secure keys ===');
    } catch (error) {
      console.error('Error writing to .env file:', error);
      console.log('=== SECURITY: Generated keys are available for this session only ===');
    }
  }
};

module.exports = {
  generateSecureKey,
  ensureSecureKeys
};
