#!/usr/bin/env node

/**
 * Script to list all groups in the system
 */

const { db } = require('../src/models/db');

async function listGroups() {
  try {
    console.log('Listing all groups in the system...\n');
    
    // Get all groups
    const groups = await db.allAsync(`
      SELECT g.id, g.name, g.description, COUNT(ug.user_id) as user_count
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id
      GROUP BY g.id
      ORDER BY g.id
    `);
    
    if (groups.length === 0) {
      console.log('No groups found in the system.');
      return;
    }
    
    console.log('Current groups in the system:');
    console.log('----------------------------');
    console.log('ID | NAME | DESCRIPTION | USER COUNT');
    console.log('----------------------------');
    
    groups.forEach(group => {
      console.log(`${group.id} | ${group.name} | ${group.description} | ${group.user_count} users`);
    });
    
    console.log('\nTotal groups:', groups.length);
    
  } catch (error) {
    console.error('Error listing groups:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    db.close();
  }
}

// Run the script
listGroups().then(() => {
  console.log('Script execution completed');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
