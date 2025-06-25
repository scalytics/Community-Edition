const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'community.db');
const SCHEMA_PATH = path.join(DB_DIR, 'schema.sql');
const ORIGINAL_SCHEMA_PATH = path.join(__dirname, '../../schema.sql');

/**
 * Ensures the data directory exists
 */
function ensureDataDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

/**
 * Ensures the schema file exists and is up to date
 * Also applies fixes for backwards compatibility
 */
function ensureSchemaFile() {
  
  let schemaContent = fs.readFileSync(ORIGINAL_SCHEMA_PATH, 'utf8');
  
  let websiteValues = [];
  
  if (schemaContent.includes('api_providers') && schemaContent.includes('website')) {
    
    const insertRegex = /INSERT OR IGNORE INTO api_providers.*VALUES\s+\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\)/g;
    let match;
    while ((match = insertRegex.exec(schemaContent)) !== null) {
      if (match.length >= 5) {
        websiteValues.push({
          name: match[1],
          website: match[4]
        });
      }
    }
    
    if (websiteValues.length > 0) {
       schemaContent += "\n\n-- Website values extracted during preprocessing (for reference):\n";
    }
    websiteValues.forEach(item => {
      schemaContent += `-- Provider: ${item.name}, Website: ${item.website}\n`;
    });
    
  }
  
  fs.writeFileSync(SCHEMA_PATH, schemaContent);
  
  return websiteValues;
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('=== DATABASE: Connection error ===', err.message);
  } else {
  }
});

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

db.execAsync = (sql) => {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

/**
 * Initialize the database with the schema and default data
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  try {
    
    const preservePassword = process.env.PRESERVE_ADMIN_PASSWORD === 'true' || 
                             process.env.NEVER_RESET_ADMIN_PASSWORD === 'true';
    const skipGroupCreation = process.env.SKIP_GROUP_CREATION === 'true';
    
    if (preservePassword) {
    } else {
      console.log('⚠️ WARNING: Admin password protection not explicitly enabled');
    }
    
    if (skipGroupCreation) {
    }
    
    ensureDataDirectory();
    const websites = ensureSchemaFile();
    
    // Before applying the schema, check if we need to handle the website column issue
    try {
      const tableExists = await db.getAsync(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='api_providers'
      `);
      
      if (tableExists) {
        const columns = await db.allAsync(`PRAGMA table_info(api_providers)`);
        const websiteColumnExists = columns.some(col => col.name === 'website');
        
        if (!websiteColumnExists) {
          
          await db.runAsync(`
            ALTER TABLE api_providers 
            ADD COLUMN website TEXT;
          `);
          
          if (websites && websites.length > 0) {
            for (const site of websites) {
              try {
                await db.runAsync(`
                  UPDATE api_providers
                  SET website = ?
                  WHERE name = ?
                `, [site.website, site.name]);
              } catch (updateErr) {
                console.warn(`=== DATABASE: Could not update website for ${site.name}: ${updateErr.message} ===`);
              }
            }
          }
        } else {
        }
      }
    } catch (fixError) {
      console.warn('=== DATABASE: Could not check or fix api_providers columns ===', fixError.message);
    }

    const rawSchemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    let schemaSql = rawSchemaSql;
    
    const lastSemicolon = schemaSql.lastIndexOf(';');
    if (lastSemicolon !== -1 && lastSemicolon < schemaSql.length - 1) {
      const remaining = schemaSql.substring(lastSemicolon + 1).trim();
      if (remaining.includes('<') || remaining.includes('IMPORTANT:')) {
        schemaSql = schemaSql.substring(0, lastSemicolon + 1);
      }
    }
    try {
      await db.execAsync(schemaSql);
    } catch (execError) {
       console.error(`=== DATABASE: Error executing schema: ${execError.message} ===`);
       console.warn('=== DATABASE: Continuing initialization despite schema execution error ===');
    }

    try {
        const modelsCols = await db.allAsync('PRAGMA table_info(models)');
        if (!modelsCols.some(c => c.name === 'embedding_dimension')) {
            await db.runAsync('ALTER TABLE models ADD COLUMN embedding_dimension INTEGER');
        }
        const providersCols = await db.allAsync('PRAGMA table_info(api_providers)');
        if (!providersCols.some(c => c.name === 'category')) {
            await db.runAsync('ALTER TABLE api_providers ADD COLUMN category TEXT');
        }
    } catch (alterError) {
        console.error('=== DATABASE: Error altering tables:', alterError);
    }
    
    await ensureAdminUser();
    const { initializeProviderConfigs } = require('../utils/providerConfig');
    await initializeProviderConfigs();
    
    return true;
  } catch (err) {
    console.error('=== DATABASE: Initialization error ===', err);
    return false;
  }
}

/**
 * Ensures the admin user exists with a proper password
 * @returns {Promise<void>}
 */
async function ensureAdminUser() {
  try {
    const preservePassword = process.env.PRESERVE_ADMIN_PASSWORD === 'true' || 
                            process.env.NEVER_RESET_ADMIN_PASSWORD === 'true';
    
    let adminPasswordProtected = false;
    let systemSettingsExist = false;
    
    try {
      const tableExists = await db.getAsync(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='system_settings'
      `);
      
      if (tableExists) {
        systemSettingsExist = true;
        const setting = await db.getAsync(`
          SELECT value FROM system_settings
          WHERE key = 'admin_password_protected'
        `);
        
        adminPasswordProtected = setting && setting.value === 'true';
      }
    } catch (dbErr) {
      console.error('=== DATABASE: Error checking admin password protection flag ===', dbErr);
    }
    
    if (preservePassword) {
    }
    
    if (adminPasswordProtected) {
    }
    
    const adminUser = await db.getAsync('SELECT * FROM users WHERE is_admin = 1 LIMIT 1');
    
    if (!adminUser) {
      console.log('=== DATABASE: No admin user found, creating default admin ===');
      console.log('⚠️ WARNING: Creating new admin user with default password');
      console.log('⚠️ WARNING: Change this password immediately after first login!');
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      const result = await db.runAsync(
        'INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@mcp.local', hashedPassword, 1]
      );
      
      const createdAdmin = await db.getAsync('SELECT * FROM users WHERE username = ?', ['admin']);
      
      if (createdAdmin) {
        await db.runAsync(
          'INSERT INTO user_settings (user_id) VALUES (?)',
          [createdAdmin.id]
        );
        
        await db.runAsync(`
          CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await db.runAsync(`
          INSERT OR REPLACE INTO system_settings (key, value)
          VALUES ('admin_password_protected', 'true')
        `);
        
        console.log('\n📝 Default admin credentials:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('\n⚠️  Important: Change the default admin password after first login!');
      }
    } else {
      
      try {
        const isProduction = process.env.NODE_ENV === 'production';
        const explicitlyPreservePassword = process.env.PRESERVE_ADMIN_PASSWORD === 'true' || 
                                process.env.NEVER_RESET_ADMIN_PASSWORD === 'true';
                                
        let adminPasswordProtected = false;
        
        try {
          const tableExists = await db.getAsync(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='system_settings'
          `);
          
          if (tableExists) {
            const setting = await db.getAsync(`
              SELECT value FROM system_settings
              WHERE key = 'admin_password_protected'
            `);
            
            adminPasswordProtected = setting && setting.value === 'true';
          }
        } catch (dbErr) {
          console.error('=== DATABASE: Error checking admin password protection flag ===', dbErr);
        }
        
        if (isProduction || explicitlyPreservePassword || adminPasswordProtected) {
          if (adminPasswordProtected) {
          }
          if (preservePassword) {
          }
          try {
            await db.runAsync(`
              CREATE TABLE IF NOT EXISTS critical_flags (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
            
            await db.runAsync(`
              INSERT OR REPLACE INTO critical_flags (key, value)
              VALUES ('ADMIN_PASSWORD_LOCKED', 'true')
            `);
          } catch (lockErr) {
            console.error('Error creating password lock:', lockErr);
          }
          
          return;
        } else {
          
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash('admin123', salt);
          
          await db.runAsync(
            'UPDATE users SET password = ? WHERE is_admin = 1',
            [hashedPassword]
          );
          
          console.log('\n📝 Default admin credentials:');
          console.log('   Username: admin');
          console.log('   Password: admin123');
          console.log('\n⚠️  Important: Change the default admin password after first login!');
        }
      } catch (err) {
        console.error('=== DATABASE: Error verifying admin password ===', err);
      }
    }
  } catch (err) {
    console.error('=== DATABASE: Error ensuring admin user ===', err);
    throw err;
  }
}


process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('=== DATABASE: Error closing connection ===', err.message);
    } else {
    }
    process.exit(0);
  });
});

module.exports = {
  db,
  initializeDatabase
};
