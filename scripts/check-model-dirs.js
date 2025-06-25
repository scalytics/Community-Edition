const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Console colors for better output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// First output the model directory structure directly from fs
// console.log(`${colors.cyan}=== Direct Filesystem Check ====${colors.reset}`);
const modelsPath = path.join(process.cwd(), 'models');
// console.log(`Models directory: ${colors.yellow}${modelsPath}${colors.reset}`);

if (fs.existsSync(modelsPath)) {
  // console.log(`${colors.green}Directory exists${colors.reset}`);
  try {
    const entries = fs.readdirSync(modelsPath, { withFileTypes: true });
    const dirs = entries.filter(entry => entry.isDirectory());

    // console.log(`Found ${colors.green}${dirs.length}${colors.reset} directories:`);
    // dirs.forEach(dir => {
    //   console.log(`- ${dir.name}`);
    //
    //   // Check for config.json
    //   const configPath = path.join(modelsPath, dir.name, 'config.json');
    //   if (fs.existsSync(configPath)) {
    //     console.log(`  ${colors.green}✓${colors.reset} Has config.json`);
    //   } else {
    //     console.log(`  ${colors.red}✗${colors.reset} No config.json`);
    //   }
    // });
  } catch (err) {
    console.error(`${colors.red}Error reading directory:${colors.reset} ${err.message}`);
  }
} else {
  console.error(`${colors.red}Directory does not exist${colors.reset}`);
}

// Then test the API endpoint
// console.log(`\n${colors.cyan}=== API Endpoint Test ====${colors.reset}`);
// console.log('Attempting to call the model directories API endpoint...');

// Get auth token from localStorage
let token = '';
try {
  if (fs.existsSync('.dev-token')) {
    token = fs.readFileSync('.dev-token', 'utf8').trim();
    // console.log(`${colors.green}Found token in .dev-token file${colors.reset}`);
  } else {
    // console.log(`${colors.yellow}No token file found. Create a file named .dev-token with your JWT token to test authenticated endpoints${colors.reset}`);
  }
} catch (err) {
  console.error(`${colors.red}Error reading token:${colors.reset} ${err.message}`);
}

// Call the API endpoint
const apiUrl = 'http://localhost:3000/api/system/model-directories';
// console.log(`Calling: ${colors.yellow}${apiUrl}${colors.reset}`);

axios.get(apiUrl, {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
})
  .then(response => {
    // console.log(`${colors.green}API call successful${colors.reset}`);
    // console.log(`Response status: ${response.status}`);
    // console.log(`Message: ${response.data.message || 'No message'}`);

    if (response.data.data && Array.isArray(response.data.data)) {
      // console.log(`Found ${colors.green}${response.data.data.length}${colors.reset} directories via API`);
      // response.data.data.forEach(dir => {
      //   console.log(`- ${dir.name} (${dir.fileCount} files, ${dir.hasConfig ? 'has config' : 'no config'})`);
      // });
    } else {
      console.error(`${colors.red}No directories returned or invalid response format${colors.reset}`);
      // console.log('Full response:', JSON.stringify(response.data, null, 2));
    }
  })
  .catch(error => {
    console.error(`${colors.red}API call failed${colors.reset}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error message: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }

    if (!token) {
      // console.log(`${colors.yellow}Note: You might need authentication to access this endpoint${colors.reset}`);
    }
  });
