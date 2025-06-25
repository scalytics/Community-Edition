#!/usr/bin/env node
/**
 * Admin Password Reset Script
 * 
 * This script temporarily bypasses admin password protection mechanisms
 * to reset the admin password in emergency situations, such as when an 
 * admin has forgotten their password.
 * 
 * Usage: node scripts/reset_admin_password.js [--force]
 * 
 * The --force flag skips the confirmation prompt
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const readline = require('readline');

// Parse arguments
const args = process.argv.slice(2);
const forceReset = args.includes('--force'); 
const createIfMissing = args.includes('-f');   // Create admin if not found

// Database file path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/community.db');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Promisify database methods
db.runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

db.getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

db.allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

/**
 * Generates a secure random password
 * @param {number} length - Length of the password
 * @returns {string} - Random password
 */
function generateSecurePassword(length = 16) {
  // Define character sets
  const upperChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  
  const lowerChars = 'abcdefghijkmnpqrstuvwxyz';  
  const numbers = '23456789';  
  const specialChars = '!@#$%^&*()-_=+[]{};:,.<>?';
  
  const allChars = upperChars + lowerChars + numbers + specialChars;
  
  // Generate base password using crypto for better randomness
  let password = '';
  
  // Ensure at least one character from each set
  password += upperChars.charAt(Math.floor(crypto.randomInt(upperChars.length)));
  password += lowerChars.charAt(Math.floor(crypto.randomInt(lowerChars.length)));
  password += numbers.charAt(Math.floor(crypto.randomInt(numbers.length)));
  password += specialChars.charAt(Math.floor(crypto.randomInt(specialChars.length)));
  
  // Fill the rest with random characters
  for (let i = 4; i < length; i++) {
    password += allChars.charAt(Math.floor(crypto.randomInt(allChars.length)));
  }
  
  // Shuffle the password using Fisher-Yates algorithm
  const passwordArray = password.split('');
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = Math.floor(crypto.randomInt(i + 1));
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }
  
  return passwordArray.join('');
}

/**
 * Main function to reset admin password
 */
async function resetAdminPassword() {
  try {
    // Find admin user
    const adminUser = await db.getAsync('SELECT * FROM users WHERE is_admin = 1 LIMIT 1');

    if (!adminUser) {
      // Admin user does not exist
      if (createIfMissing) {
        console.log('ℹ️ Admin user not found. Creating with random password due to -f flag...');
        const defaultUsername = 'admin';
        const defaultEmail = 'admin@localhost'; 
        const newPassword = generateSecurePassword(); 

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Insert the new admin user
        await db.runAsync(`
          INSERT INTO users (username, email, password, is_admin, status, created_at, updated_at) 
          VALUES (?, ?, ?, 1, 'active_protected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [defaultUsername, defaultEmail, hashedPassword]);

        console.log('✅ Default admin user created successfully!');
        console.log('\n==================================================');
        console.log('🔑 NEW ADMIN CREDENTIALS:');
        console.log(`   Username: ${defaultUsername}`);
        console.log(`   Password: ${newPassword}`);
        console.log('==================================================');
        console.log('\n⚠️  IMPORTANT: Save this password immediately! It will not be shown again.\n');
        return true; // Indicate success

      } else {
        // Original behavior: Error if admin not found and -f not specified
        console.error('❌ No admin user found in the database!');
        console.error('ℹ️ Use the -f flag to create a default admin user if needed.');
        return false; 
      }
    }

    // Admin user exists, proceed with reset logic
    console.log(`Found admin user: ${adminUser.username} (ID: ${adminUser.id})`);
    
    // Confirm reset if not forced
    if (!forceReset) {
      await new Promise((resolve) => {
        rl.question('⚠️  WARNING: This will reset the admin password. Are you sure? (y/N): ', (answer) => {
          if (answer.toLowerCase() !== 'y') {
            console.log('Operation cancelled.');
            process.exit(0);
          }
          resolve();
        });
      });
    }
    
    console.log('\n🔓 Temporarily disabling protection mechanisms...');
    
    // Log the emergency reset operation
    await db.runAsync(`
      INSERT INTO protection_log (operation, status, details)
      VALUES (?, ?, ?)
    `, [
      'emergency_password_reset',
      'initiated',
      `Emergency admin password reset initiated at ${new Date().toISOString()}`
    ]);
    
    // STEP 1: Temporarily disable system settings protection
    await db.runAsync(`
      UPDATE system_settings 
      SET value = 'false' 
      WHERE key = 'admin_password_protected'
    `);
    
    // STEP 2: Temporarily disable critical flags
    await db.runAsync(`
      UPDATE critical_flags 
      SET value = 'false' 
      WHERE key = 'ADMIN_PASSWORD_LOCKED'
    `);
    
    // STEP 3: Remove protected status from admin user
    await db.runAsync(`
      UPDATE users 
      SET status = REPLACE(status, '_protected', '') 
      WHERE id = ?
    `, [adminUser.id]);
    
    console.log('✅ Protection mechanisms temporarily disabled');
    
    // Generate a new secure password
    const newPassword = generateSecurePassword();
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update the admin password
    await db.runAsync(`
      UPDATE users 
      SET password = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [hashedPassword, adminUser.id]);
    
    console.log('✅ Admin password updated successfully');
    
    // Re-enable protection mechanisms
    console.log('\n🔒 Re-enabling protection mechanisms...');
    
    // STEP 1: Re-enable system settings protection
    await db.runAsync(`
      UPDATE system_settings 
      SET value = 'true' 
      WHERE key = 'admin_password_protected'
    `);
    
    // STEP 2: Re-enable critical flags
    await db.runAsync(`
      UPDATE critical_flags 
      SET value = 'true' 
      WHERE key = 'ADMIN_PASSWORD_LOCKED'
    `);
    
    // STEP 3: Restore protected status to admin user
    await db.runAsync(`
      UPDATE users 
      SET status = CASE 
        WHEN status = 'active' THEN 'active_protected' 
        ELSE status || '_protected' 
      END
      WHERE id = ?
    `, [adminUser.id]);
    
    // Log the completion of the reset
    await db.runAsync(`
      INSERT INTO protection_log (operation, status, details)
      VALUES (?, ?, ?)
    `, [
      'emergency_password_reset',
      'completed',
      `Emergency admin password reset completed at ${new Date().toISOString()}`
    ]);
    
    console.log('✅ Protection mechanisms re-enabled');
    
    // Output the new password
    console.log('\n==================================================');
    console.log('🔑 NEW ADMIN PASSWORD: ' + newPassword);
    console.log('==================================================');
    console.log('\n⚠️  IMPORTANT: Save this password immediately! It will not be shown again.\n');
    
    return true;
  } catch (error) {
    console.error('❌ Error resetting admin password:', error);
    
    // Attempt to re-enable protection mechanisms
    try {
      await db.runAsync(`
        UPDATE system_settings 
        SET value = 'true' 
        WHERE key = 'admin_password_protected'
      `);
      
      await db.runAsync(`
        UPDATE critical_flags 
        SET value = 'true' 
        WHERE key = 'ADMIN_PASSWORD_LOCKED'
      `);
      
      await db.runAsync(`
        UPDATE users 
        SET status = CASE 
          WHEN status NOT LIKE '%_protected' THEN status || '_protected' 
          ELSE status 
        END
        WHERE is_admin = 1
      `);
      
      await db.runAsync(`
        INSERT INTO protection_log (operation, status, details)
        VALUES (?, ?, ?)
      `, [
        'emergency_password_reset',
        'failed',
        `Emergency reset failed, protection restored at ${new Date().toISOString()}`
      ]);
      
      console.log('✅ Protection mechanisms restored after error');
    } catch (restoreError) {
      console.error('❌ CRITICAL: Failed to restore protection mechanisms:', restoreError);
      console.error('⚠️  Manual intervention required to restore protection!');
    }
    
    return false;
  } finally {
    // Close the database connection
    db.close();
    // Close readline interface
    rl.close();
  }
}

// Display environment status
console.log('\n🔐 ADMIN PASSWORD RESET 🔐');
console.log('==================================================');
console.log('⚠️  This script will reset the admin password and generate a new one');
console.log('⚠️  Use only in emergency situations when admin password is lost\n');

console.log('Environment status:');
console.log(`NODE_ENV = ${process.env.NODE_ENV || 'not set'}`);
console.log(`DB_PATH = ${DB_PATH}`);
console.log(`Force reset (skip confirm): ${forceReset ? 'YES' : 'NO'}`);
console.log(`Create if missing (-f): ${createIfMissing ? 'YES' : 'NO'}`);
console.log('==================================================\n');

// Run the reset/create
resetAdminPassword().then(success => {
  if (success) {
    console.log('\n🔐 ADMIN PASSWORD RESET SUCCESSFULLY COMPLETED 🔐');
    process.exit(0);
  } else {
    console.error('\n❌ ADMIN PASSWORD RESET FAILED');
    process.exit(1);
  }
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
