const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Check for --check flag
const isCheckMode = process.argv.includes('--check');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Get DB_PATH from .env if it exists, otherwise use default
let DB_PATH = path.join(dataDir, 'community.db');
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbPathMatch = envContent.match(/DB_PATH\s*=\s*(.+)/);
    if (dbPathMatch && dbPathMatch[1]) {
      // If it's a relative path, make it absolute
      const dbPathValue = dbPathMatch[1].trim();
      if (!path.isAbsolute(dbPathValue)) {
        DB_PATH = path.join(__dirname, '..', dbPathValue);
      } else {
        DB_PATH = dbPathValue;
      }
    }
  }
} catch (err) {
  console.warn(`Warning: Could not read .env file for DB_PATH: ${err.message}. Using default.`);
}

// Check if database file exists
const dbExists = fs.existsSync(DB_PATH);

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to the MCP SQLite database');
});

// Read the schema SQL
const schemaPath = path.join(__dirname, '../schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

// Function to count total users
async function countUsers() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) resolve(0);
      else resolve(row ? row.count : 0);
    });
  });
}

// Function to check if admin user exists
async function checkAdminExists() {
  return new Promise((resolve, reject) => {
    db.get("SELECT id FROM users WHERE is_admin = 1 LIMIT 1", (err, row) => {
      if (err) resolve(false);
      else resolve(!!row);
    });
  });
}

// --- BEGIN ADDED: Function to apply schema updates ---
async function applySchemaUpdates() {
  console.log('🔧 Applying necessary schema updates...');
  const columnsToAdd = [
    { name: 'n_gpu_layers', type: 'INTEGER DEFAULT NULL' },
    { name: 'n_batch', type: 'INTEGER DEFAULT NULL' },
    { name: 'n_ctx', type: 'INTEGER DEFAULT NULL' }
  ];

  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(models)", (err, columns) => {
      if (err) {
        // If table doesn't exist yet (initial setup), resolve without error
        if (err.message.includes('no such table: models')) {
          console.log('   Models table does not exist yet, skipping updates.');
          return resolve();
        }
        console.error('❌ Error checking models table info:', err.message);
        return reject(err);
      }

      const existingColumns = new Set(columns.map(col => col.name));
      const updates = [];

      columnsToAdd.forEach(col => {
        if (!existingColumns.has(col.name)) {
          const sql = `ALTER TABLE models ADD COLUMN ${col.name} ${col.type};`;
          console.log(`   Adding column: ${col.name}`);
          updates.push(new Promise((res, rej) => {
            db.run(sql, (err) => {
              if (err) {
                console.error(`❌ Error adding column ${col.name}:`, err.message);
                rej(err);
              } else {
                res();
              }
            });
          }));
        } else {
          console.log(`   Column already exists: ${col.name}`);
        }
      });

      Promise.all(updates)
        .then(() => {
          console.log('✅ Schema updates applied successfully.');
          resolve();
        })
        .catch(reject);
    });
  });
}
// --- END ADDED: Function to apply schema updates ---

// Function to check database schema
async function checkSchema() { // Made async
  console.log('🔍 Performing comprehensive database check...');

  // Use promise-based approach for better async control
  // Wrap the entire logic in a promise to handle db.close correctly
  return new Promise(async (resolveOuter, rejectOuter) => { // Added async here
    try {
      // First verify the users table exists
      const userTableRow = await new Promise((resolve, reject) => {
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });

      if (!userTableRow) {
        console.log('⚠️ Database schema needs initialization - users table missing');
        if (isCheckMode) {
          console.log('ℹ️ Running in check mode, not initializing. Run without --check to initialize.');
          resolveOuter(false);
        } else {
          // Only proceed if this is NOT a production environment and the database doesn't exist yet
          if (process.env.NODE_ENV === 'production' && dbExists) {
            console.log('🛑 CRITICAL: Users table missing but we are in production with existing DB!');
            console.log('🛑 This suggests something has gone wrong with the database.');
            console.log('🛑 Will NOT reinitialize database in production - manual fix required.');
            resolveOuter(false);
          } else {
            // Safe to initialize - dev environment or new install
            await initializeSchema(); // Await initialization
            resolveOuter(true);
          }
        }
      } else {
        // Table exists - check for data
        const totalUsers = await countUsers();
        const adminExists = await checkAdminExists();

        console.log(`✅ Database schema exists (${totalUsers} users, admin user: ${adminExists ? 'YES' : 'NO'})`);

        // Apply updates if schema exists
        try {
          await applySchemaUpdates(); // Await updates
        } catch (updateErr) {
          console.error('❌ Failed to apply schema updates during check:', updateErr);
          // Decide if this should be fatal or just a warning
          // For now, log and continue
        }

        // If we're in production mode and have no users, this is suspicious
        if (process.env.NODE_ENV === 'production' && totalUsers === 0 && dbExists) {
          console.log('⚠️ WARNING: Production database exists but has no users!');
          console.log('⚠️ This is unusual and may indicate database corruption.');
          console.log('⚠️ Continuing but not modifying database structure.');
        }

        console.log('✅ Database check complete!');
        resolveOuter(true);
      }
    } catch (err) {
      console.error('❌ Error checking database schema:', err.message);
      rejectOuter(err);
    }
  })
  .then(result => {
    db.close((closeErr) => { // Handle close error
        if (closeErr) console.error('❌ Error closing DB after check:', closeErr.message);
    });
    return result;
  })
  .catch(err => {
    console.error('❌ Database check failed:', err);
    db.close((closeErr) => { // Ensure DB is closed on error too
        if (closeErr) console.error('❌ Error closing DB after check failure:', closeErr.message);
    });
    process.exit(1);
  });
}

// Function to execute SQL statements sequentially within a transaction
async function executeSchema(sqlStatements) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION;", (err) => {
        if (err) {
          console.error('❌ Error beginning transaction:', err.message);
          return reject(err);
        }

        let statementIndex = 0;
        const executeNext = () => {
          if (statementIndex >= sqlStatements.length) {
            db.run("COMMIT;", (commitErr) => {
              if (commitErr) {
                console.error('❌ Error committing transaction:', commitErr.message);
                // Attempt rollback on commit error
                db.run("ROLLBACK;", (rollbackErr) => {
                  if (rollbackErr) console.error('❌ Error rolling back transaction after commit failure:', rollbackErr.message);
                  reject(commitErr);
                });
              } else {
                resolve(); // Transaction successful
              }
            });
            return;
          }

          const statement = sqlStatements[statementIndex].trim();
          statementIndex++;

          if (statement) { // Skip empty statements
            // console.log(`   Executing statement ${statementIndex}/${sqlStatements.length}`); // Optional debug log
            db.run(statement, (runErr) => {
              if (runErr) {
                console.error(`❌ Error executing statement ${statementIndex}/${sqlStatements.length}: ${runErr.message}`);
                console.error(`   Statement: ${statement.substring(0, 100)}...`);
                db.run("ROLLBACK;", (rollbackErr) => {
                  if (rollbackErr) console.error('❌ Error rolling back transaction:', rollbackErr.message);
                  reject(runErr); // Reject on statement error
                });
              } else {
                executeNext(); // Execute next statement
              }
            });
          } else {
            executeNext(); // Skip empty statement
          }
        };

        executeNext(); // Start executing statements
      });
    });
  });
}

// Function to initialize the schema
async function initializeSchema() { // Made async
  // First check if an admin user already exists in the database (additional safeguard)
  let adminExists = false;

  try {
    // Use a temporary connection to check without interfering with the main db object state
    const tempDbPath = DB_PATH; // Use the determined path
    const tempDb = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err && err.code !== 'SQLITE_CANTOPEN') { // Ignore if DB doesn't exist yet
             console.warn(`Warning: Could not open DB for pre-check: ${err.message}`);
        }
    });

    if (tempDb) {
        await new Promise((resolve, reject) => {
             tempDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, tableRow) => {
                 if (err) return resolve(); // Ignore error if table doesn't exist
                 if (tableRow) {
                     tempDb.get("SELECT id FROM users WHERE is_admin = 1 LIMIT 1", (errAdmin, adminRow) => {
                         if (!errAdmin && adminRow) {
                             adminExists = true;
                             console.log('🔒 Existing admin user detected - admin password will be preserved regardless of settings');
                         }
                         resolve();
                     });
                 } else {
                     resolve();
                 }
             });
        });
        tempDb.close();
    }
  } catch (e) {
    console.warn(`Warning: Could not check for existing admin user: ${e.message}`);
  }

  // Check if admin password should be preserved
  const preserveAdminPassword =
      adminExists || // Always preserve if admin exists (additional safeguard)
      process.env.NODE_ENV === 'production' || // Always preserve in production
      process.env.PRESERVE_ADMIN_PASSWORD === 'true' ||
      process.env.NEVER_RESET_ADMIN_PASSWORD === 'true' ||
      process.env.DB_ADMIN_PASSWORD_PROTECTED === 'true' ||
      process.env.CRITICAL_PASSWORD_LOCK === 'true';

  // If preserving admin password, modify schema SQL string to remove/comment out admin user insert
  let finalSchemaSqlString = schemaSql;
  if (preserveAdminPassword) {
    console.log('🔒 Preserving admin password due to:');
    if (adminExists) console.log('   * Existing admin user detected');
    if (process.env.NODE_ENV === 'production') console.log('   * Running in production mode');
    console.log(`   * PRESERVE_ADMIN_PASSWORD=${process.env.PRESERVE_ADMIN_PASSWORD || 'not set'}`);
    console.log(`   * NEVER_RESET_ADMIN_PASSWORD=${process.env.NEVER_RESET_ADMIN_PASSWORD || 'not set'}`);
    console.log(`   * DB_ADMIN_PASSWORD_PROTECTED=${process.env.DB_ADMIN_PASSWORD_PROTECTED || 'not set'}`);
    console.log(`   * CRITICAL_PASSWORD_LOCK=${process.env.CRITICAL_PASSWORD_LOCK || 'not set'}`);

    // Comment out the admin user insert line to prevent overwriting
    finalSchemaSqlString = schemaSql.replace(
      /INSERT OR IGNORE INTO users \(username, email, password, is_admin\)/g,
      '-- ADMIN PASSWORD PROTECTED: INSERT OR IGNORE INTO users (username, email, password, is_admin)'
    );
  }

  // Split schema into individual statements, handling potential issues with comments or empty lines
  // A more robust parser might be needed for complex SQL, but this handles basic cases.
  // Split by semicolon potentially followed by whitespace and newline(s)
  const statements = finalSchemaSqlString.split(/;\s*[\r\n]+/).map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

  try {
      console.log(`🔧 Executing ${statements.length} schema statements...`);
      await executeSchema(statements); // Execute statements sequentially in a transaction
      console.log('✅ Database schema initialized successfully');

      // Apply schema updates after initial creation
      await applySchemaUpdates();

      console.log('✅ Setup complete!');
      console.log('');

        // Only in development mode with a fresh install should we show the default password
        // Additionally check the password preservation flags
        const showCredentials = process.env.NODE_ENV !== 'production' && !preserveAdminPassword;
        if (showCredentials) {
          console.log('📝 Default admin credentials (DEVELOPMENT MODE ONLY):');
          console.log('   Username: admin');
          console.log('   Password: admin123');
          console.log('');
          console.log('⚠️  Important: Change the default admin password after first login!');
        } else if (process.env.NODE_ENV === 'production') {
          if (preserveAdminPassword) {
            console.log('🔒 Admin password preserved as requested. No password reset performed.');
          } else {
            console.log('🔒 Admin credentials protected in production mode.');
          }
        }
        console.log('');
        console.log('🚀 Start the server with: npm start');

        // No explicit resolve needed as await handles completion/errors
    } catch (err) {
        console.error('❌ Error during schema initialization or update:', err);
        // executeSchema handles rollback on error
        db.close((closeErr) => {
            if (closeErr) console.error('❌ Error closing DB after init failure:', closeErr.message);
        });
        process.exit(1);
    }
}

// Check for admin password protection environment variables
const preserveAdminPassword = process.env.PRESERVE_ADMIN_PASSWORD === 'true'
                          || process.env.NEVER_RESET_ADMIN_PASSWORD === 'true';

if (preserveAdminPassword) {
  console.log('🔒 Admin password preservation enabled - password will NOT be reset');
  console.log('🔒 Environment settings: PRESERVE_ADMIN_PASSWORD=' +
              (process.env.PRESERVE_ADMIN_PASSWORD || 'not set') +
              ', NEVER_RESET_ADMIN_PASSWORD=' +
              (process.env.NEVER_RESET_ADMIN_PASSWORD || 'not set'));
}

// Main execution - simplified and using async/await
(async () => {
  try {
    if (process.env.NODE_ENV === 'production' && dbExists) {
      // In production with existing database, ONLY perform a check
      console.log('🔒 PROTECTION ACTIVATED: Database exists in production environment');
      console.log('🔒 Only performing schema check without modifying existing data');
      await checkSchema();
    } else if (dbExists || isCheckMode) {
      // If DB exists or we're in check mode, check schema
      await checkSchema();
    } else {
      // Otherwise initialize schema (only for new installation or development)
      console.log('Initializing new schema (non-production or new installation)');
      await initializeSchema();
      // No need to close DB here, initializeSchema handles it or checkSchema will run next time
    }
  } catch (error) {
     // Errors should be handled within checkSchema/initializeSchema, but catch just in case
     console.error("❌ Unhandled error during DB setup:", error);
     process.exit(1);
  }
})(); // Immediately invoke the async function
