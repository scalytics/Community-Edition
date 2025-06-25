#!/usr/bin/env node
const { db } = require('../src/models/db');

async function runTests() {
  // console.log('Testing providers table access...');

  try {
    // Test basic api_providers table query
    // console.log('Testing api_providers select:');
    const providers = await db.allAsync(`
      SELECT
        id,
        name,
        description,
        api_url,
        is_active,
        created_at,
        updated_at
      FROM api_providers
      ORDER BY name
    `);
    // console.log(`Success! Found ${providers.length} providers in api_providers table`);

    // Show the providers
    // console.log('Provider list:');
    // providers.forEach(p => console.log(` - ${p.name} (ID: ${p.id})`));

    // Test model count query
    // console.log('\nTesting model count query:');
    for (let i = 0; i < providers.length; i++) {
      try {
        // This might be the source of the error - test both provider_id and external_provider_id
        const modelCount1 = await db.getAsync(`
          SELECT COUNT(*) as count
          FROM models
          WHERE provider_id = ?
        `, [providers[i].id]);

        const modelCount2 = await db.getAsync(`
          SELECT COUNT(*) as count
          FROM models
          WHERE external_provider_id = ?
        `, [providers[i].id]);

        // console.log(`Provider ${providers[i].name}: Count with provider_id: ${modelCount1 ? modelCount1.count : 'NULL'}, Count with external_provider_id: ${modelCount2 ? modelCount2.count : 'NULL'}`);
      } catch (err) {
        console.error(`Error getting model count for provider ${providers[i].name}:`, err);

        // Try to dump table schema to see column names
        try {
          // console.log('\nDumping models table schema:');
          const pragma = await db.allAsync('PRAGMA table_info(models)');
          // console.log(pragma);
        } catch (schemaErr) {
          console.error('Failed to get schema:', schemaErr);
        }
      }
    }

    // Check if the old 'providers' table exists
    try {
      // console.log('\nChecking if old providers table exists:');
      const oldTable = await db.allAsync('SELECT name FROM sqlite_master WHERE type="table" AND name="providers"');
      if (oldTable.length > 0) {
        console.warn('WARNING: Old providers table still exists!');
      } else {
        // console.log('Good: No old providers table found');
      }
    } catch (err) {
      console.error('Error checking for old table:', err);
    }

    // console.log('\nTests completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    process.exit(0);
  }
}

runTests();
