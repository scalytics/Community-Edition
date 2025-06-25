const fs = require('fs');
const path = require('path');
const swaggerSpec = require('../src/config/swaggerConfig'); // Adjust path if needed

const outputDir = path.join(__dirname, '../docs'); // Output to docs directory
const outputPath = path.join(outputDir, 'openapi.json');

try {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write the swagger specification to openapi.json
  fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
  
  console.log(`✅ OpenAPI specification generated successfully at ${outputPath}`);
  process.exit(0);
} catch (error) {
  console.error('❌ Error generating OpenAPI specification:', error);
  process.exit(1);
}
