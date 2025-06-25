#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('Attempting to add Google provider to the database...');

// --- Database Path Logic (copied from init-db.js for consistency) ---
let DB_PATH;
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbPathMatch = envContent.match(/DB_PATH\s*=\s*(.+)/);
    if (dbPathMatch && dbPathMatch[1]) {
      const dbPathValue = dbPathMatch[1].trim();
      DB_PATH = path.isAbsolute(dbPathValue) ? dbPathValue : path.join(__dirname, '..', dbPathValue);
      console.log(`Using DB_PATH from .env: ${DB_PATH}`);
    }
  }
} catch (err) {
  console.warn(`Warning: Could not read .env file for DB_PATH: ${err.message}. Using default.`);
}

// Default path if not found in .env
if (!DB_PATH) {
  const dataDir = path.join(__dirname, '../data');
  DB_PATH = path.join(dataDir, 'community.db');
  console.log(`Using default DB_PATH: ${DB_PATH}`);
  // Ensure data directory exists if using default path
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`Created data directory: ${dataDir}`);
    } catch (mkdirErr) {
      console.error(`❌ Failed to create data directory: ${mkdirErr.message}`);
      process.exit(1);
    }
  }
}

// Check if database file exists before connecting
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Database file not found at path: ${DB_PATH}`);
  console.error('Please ensure the database is initialized first (e.g., by running setup/init-db.js or starting the server).');
  process.exit(1);
}

// --- Database Connection and Operation ---
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log(`✅ Connected to the database: ${DB_PATH}`);
});

db.serialize(() => {
  // Check if provider already exists
  db.get('SELECT id FROM api_providers WHERE name = ?', ['Google'], (err, row) => {
    if (err) {
      console.error('❌ Error checking for existing Google provider:', err.message);
      db.close();
      process.exit(1);
    }

    if (row) {
      console.log('✅ Google provider already exists in the database (ID: ' + row.id + '). No changes made.');
      db.close();
    } else {
      // Insert the Google provider
      console.log('Inserting Google provider...');
      db.run(
        `INSERT INTO api_providers (name, description, api_url, website, is_active) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          'Google',
          'Google Gemini API',
          'https://generativelanguage.googleapis.com', // Example base URL
          'https://ai.google.dev/',
          1 // Assuming active by default
        ],
        function (insertErr) { // Use function() to access this.lastID
          if (insertErr) {
            console.error('❌ Error inserting Google provider:', insertErr.message);
            db.close();
            process.exit(1);
          }
          console.log(`✅ Google provider added successfully with ID: ${this.lastID}`);
          db.close((closeErr) => {
            if (closeErr) {
              console.error('❌ Error closing database:', closeErr.message);
            }
          });
        }
      );
    }
  });
});

// Handle potential errors during close if serialize didn't run
db.on('error', (err) => {
    console.error('Database operation error:', err.message);
});
