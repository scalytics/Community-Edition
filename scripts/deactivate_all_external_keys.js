/**
 * Script to deactivate all external API keys (both user and global)
 * To be run when troubleshooting privacy mode issues or as part of privacy mode setup
 * 
 * Usage:
 *   node deactivate_all_external_keys.js [--force]
 *   
 *   Options:
 *     --force   Deactivate keys even if privacy mode is not enabled
 */

const { db } = require('../src/models/db');

// Get command line arguments
const forceDeactivation = process.argv.includes('--force');

async function deactivateAllExternalKeys() {
  try {
    console.log('=================================================');
    console.log('Starting deactivation of all external API keys...');
    console.log('=================================================');
    
    // First, check if the system is in privacy mode
    const privacyMode = await db.getAsync(
      'SELECT value FROM system_settings WHERE key = ?',
      ['global_privacy_mode']
    );
    console.log('Privacy mode setting:', privacyMode ? privacyMode.value : 'not set');
    
    const isPrivacyModeEnabled = privacyMode && privacyMode.value === 'true';
    
    if (!isPrivacyModeEnabled && !forceDeactivation) {
      console.log('\nPrivacy mode is not enabled. No action taken.');
      console.log('To enable privacy mode, use the admin interface or run:');
      console.log('UPDATE system_settings SET value = "true" WHERE key = "global_privacy_mode";');
      console.log('\nIf you want to deactivate keys anyway, run with the --force flag:');
      console.log('node deactivate_all_external_keys.js --force');
      return;
    }
    
    if (!isPrivacyModeEnabled && forceDeactivation) {
      console.log('\nForce flag detected. Proceeding with key deactivation even though privacy mode is not enabled.');
    } else {
      console.log('\nPrivacy mode is enabled. Proceeding with key deactivation...');
    }
    
    // Show all active keys before deactivation
    console.log('\n1. Listing all currently active API keys:');
    console.log('---------------------------------------');
    const activeKeys = await db.allAsync(`
      SELECT 
        k.id, 
        p.name as provider_name, 
        p.id as provider_id,
        k.key_name, 
        k.is_global, 
        k.user_id,
        CASE WHEN k.user_id IS NULL OR k.is_global = 1 THEN 'Global' ELSE 'User' END as key_type
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE k.is_active = 1
      ORDER BY p.name, k.key_name
    `);
    
    if (activeKeys.length === 0) {
      console.log('No active API keys found.');
    } else {
      console.log(`Found ${activeKeys.length} active API keys:`);
      activeKeys.forEach(key => {
        console.log(`- ID: ${key.id.toString().padEnd(3)}, Provider: ${key.provider_name.padEnd(20)}, Name: ${key.key_name.padEnd(30)}, Type: ${key.key_type}`);
      });
    }
    
    // Get count of active external keys before deactivation
    console.log('\n2. Identifying external API keys...');
    console.log('----------------------------------');
    
    // Check if api_providers has an is_external column
    const providersTableInfo = await db.allAsync(`PRAGMA table_info(api_providers)`);
    const hasIsExternalColumn = providersTableInfo.some(column => column.name === 'is_external');
    
    console.log(`Provider table has is_external column: ${hasIsExternalColumn ? 'Yes' : 'No'}`);
    
    let externalKeyQuery;
    if (hasIsExternalColumn) {
      // Use is_external column if it exists
      externalKeyQuery = `
        SELECT k.id, p.name as provider_name, k.key_name, k.is_global, k.user_id
        FROM api_keys k
        JOIN api_providers p ON k.provider_id = p.id
        WHERE k.is_active = 1 AND p.is_external = 1
      `;
    } else {
      // Fall back to identifying external providers by name
      // Using specific patterns for known external AI/LLM providers
      externalKeyQuery = `
        SELECT k.id, p.name as provider_name, k.key_name, k.is_global, k.user_id
        FROM api_keys k
        JOIN api_providers p ON k.provider_id = p.id
        WHERE k.is_active = 1 AND 
        (p.name LIKE '%OpenAI%' OR 
         p.name LIKE '%Anthropic%' OR 
         p.name LIKE '%Claude%' OR
         p.name LIKE '%GPT%' OR
         p.name LIKE '%Google AI%' OR 
         p.name LIKE '%Azure OpenAI%' OR
         p.name LIKE '%Cohere%' OR
         p.name LIKE '%Mistral%' OR
         p.name LIKE '%Hugging Face%' OR
         (p.name LIKE '%External%' AND p.name NOT LIKE '%Internal%'))
        -- Explicitly exclude critical internal services
        AND NOT (
          p.name LIKE '%Internal Auth%' OR
          p.name LIKE '%User Service%' OR
          p.name LIKE '%Core%'
        )
      `;
    }
    
    const externalKeys = await db.allAsync(externalKeyQuery);
    
    console.log(`Found ${externalKeys.length} active external API keys that need deactivation:`);
    if (externalKeys.length > 0) {
      externalKeys.forEach(key => {
        const keyType = key.is_global === 1 || key.user_id === null ? 'Global' : 'User';
        console.log(`- ID: ${key.id.toString().padEnd(3)}, Provider: ${key.provider_name.padEnd(20)}, Name: ${key.key_name.padEnd(30)}, Type: ${keyType}`);
      });
    } else {
      console.log('No external API keys found that need deactivation.');
      return;
    }
    
    // Confirm before proceeding
    console.log('\n3. Deactivating external API keys...');
    console.log('----------------------------------');
    
    // Extract IDs to deactivate
    const idsToDeactivate = externalKeys.map(key => key.id);
    
    // Deactivate all external API keys
    if (idsToDeactivate.length > 0) {
      const placeholders = idsToDeactivate.map(() => '?').join(',');
      const result = await db.runAsync(
        `UPDATE api_keys 
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
         WHERE id IN (${placeholders})`,
        idsToDeactivate
      );
      
      console.log(`Deactivated ${result.changes} external API keys`);
    } else {
      console.log('No keys to deactivate.');
    }
    
    // Verify all external keys are now deactivated
    console.log('\n4. Verifying deactivation...');
    console.log('---------------------------');
    
    const remainingActive = await db.allAsync(externalKeyQuery);
    
    if (remainingActive && remainingActive.length > 0) {
      console.log('WARNING: Some external API keys are still active:');
      remainingActive.forEach(key => {
        const keyType = key.is_global === 1 || key.user_id === null ? 'Global' : 'User';
        console.log(`- ID: ${key.id.toString().padEnd(3)}, Provider: ${key.provider_name.padEnd(20)}, Name: ${key.key_name.padEnd(30)}, Type: ${keyType}`);
      });
      
      console.log('\nYou may need to manually deactivate these keys through the database:');
      console.log(`UPDATE api_keys SET is_active = 0 WHERE id IN (${remainingActive.map(k => k.id).join(',')})`);
    } else {
      console.log('Success: All external API keys have been deactivated');
    }
    
    console.log('\nDeactivation complete.');
  } catch (error) {
    console.error('Error deactivating external API keys:', error);
  } finally {
    db.close();
  }
}

// Run the function
deactivateAllExternalKeys();
