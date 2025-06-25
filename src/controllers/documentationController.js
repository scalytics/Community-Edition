const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const Permission = require('../models/Permission'); 

// Helper function to recursively get all markdown files from a directory and its subdirectories
const getMarkdownFiles = async (dir, baseDir = '') => {
  try {
    try {
      await fsPromises.access(dir, fs.constants.R_OK);
    } catch (err) {
      return [];
    }
    
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    
    const files = await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(dir, entry.name);
        const relativePath = baseDir ? `${baseDir}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          try {
            await fsPromises.access(fullPath, fs.constants.R_OK);
            return getMarkdownFiles(fullPath, relativePath);
          } catch (err) {
            return null;
          }
        } else if (entry.name.endsWith('.md')) {
          try {
            // Read the file to extract the title from the first header
            const content = await fsPromises.readFile(fullPath, 'utf8');
            const titleMatch = content.match(/^# (.+)$/m);
            const title = titleMatch ? titleMatch[1] : entry.name.replace('.md', '');
            
            const id = relativePath.replace('.md', '');
            const docInfo = {
              id,
              title,
              path: relativePath.replace('.md', ''),
              apiPath: `/api/docs/${id}`
            };
            
            return docInfo;
          } catch (err) {
            return null;
          }
        }
        return null;
      })
    );
    
    // Flatten the array and filter out null values
    const result = files.flat().filter(Boolean);
    return result;
  } catch (err) {
    return [];
  }
};

// Helper to find docs directory - tries multiple possible locations
const findDocsDirectory = async () => {
  const possibleLocations = [
    path.join(process.cwd(), 'docs'),                           
    path.join(process.cwd(), '..', 'docs'),                    
    path.resolve(__dirname, '..', '..', '..', 'docs'),       
  ];
  
  for (const location of possibleLocations) {
    try {
      await fsPromises.access(location, fs.constants.R_OK);
      return location;
    } catch (err) {
    }
  }
  
  return path.join(process.cwd(), 'docs'); 
};

// Get list of available documentation files
exports.getDocumentationList = async (req, res) => {
  try {
    const docsDir = await findDocsDirectory();
    let docs = await getMarkdownFiles(docsDir);

    // --- START ACCESS CONTROL FILTERING (Aligned with Frontend/Permissions) ---
    let userHasFullAccess = false;
    if (req.user) {
      // Check if user is full admin OR if they are marked as a power user (has any permission)
      userHasFullAccess = req.user.is_admin == 1 || req.user.is_power_user == 1;
    }

    if (!userHasFullAccess) {
      // Filter out admin docs if user doesn't have full access
      docs = docs.filter(doc => !doc.id.startsWith('admin/'));
    }
    // --- END ACCESS CONTROL FILTERING (Corrected) ---

    res.status(200).json({
      success: true,
      docs 
    });
  } catch (error) {
    console.error('Error fetching documentation list:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documentation list'
    });
  }
};

// Get a specific documentation file
exports.getDocumentation = async (req, res) => {
  try {
    const docId = req.params.id;
    
    // Strip any leading slashes and normalize dashes
    let normalizedDocId = docId.replace(/^\/+/, '');
    // Replace any kind of dash/hyphen character with standard hyphen
    normalizedDocId = normalizedDocId.replace(/[\u2010-\u2015\u2212\u23AF\uFE58\uFE63\uFF0D]/g, '-');
    
    const docsDir = await findDocsDirectory();
    
    // Get possible subdirectory and filename parts
    let subdirectory = '';
    let filename = normalizedDocId;
    
    if (normalizedDocId.includes('/')) {
      const parts = normalizedDocId.split('/');
      subdirectory = parts[0];
      filename = parts[parts.length-1];
    }
    
    // Generate all possible paths to check, prioritizing the most likely
    const possiblePaths = [
      // First try direct paths based on ID structure
      path.join(docsDir, normalizedDocId.replace(/\//g, path.sep) + '.md'),
      
      // Try with exact structure
      path.join(docsDir, 'admin', `${filename}.md`),
      path.join(docsDir, 'user', `${filename}.md`),
      path.join(docsDir, 'developer', `${filename}.md`),
      
      // Try standard variations
      path.join(docsDir, ...normalizedDocId.split('/')).concat('.md'),
      
      // Case variations for GPU acceleration doc
      path.join(docsDir, 'admin', 'gpu-acceleration-complete-guide.md'),
      path.join(docsDir, 'admin', `GPU-acceleration-complete-guide.md`),
      
      // Special hardcoded cases
      path.join(docsDir, 'index.md'),
      path.join(docsDir, 'admin', 'api-key-management.md')
    ].filter(Boolean);
    
    // Try each path
    let fileContent = null;
    let foundPath = null;
    
    for (const testPath of possiblePaths) {
      try {
        // Check if file exists and is readable
        await fsPromises.access(testPath, fs.constants.R_OK);
        fileContent = await fsPromises.readFile(testPath, 'utf8');
        foundPath = testPath;
        break;
      } catch (err) {
        // Continue to next path
      }
    }
    
    if (!fileContent) {
      return res.status(404).json({
        success: false,
        message: `Documentation '${docId}' not found`
      });
    }

    // --- START ACCESS CONTROL (Aligned with Frontend/Permissions) ---
    let userHasFullAccessForDoc = false;
    if (req.user) {
      // Check if user is full admin OR if they are marked as a power user (has any permission)
       userHasFullAccessForDoc = req.user.is_admin == 1 || req.user.is_power_user == 1;
    }
    const requestedCategory = normalizedDocId.split('/')[0]; // e.g., 'admin', 'developer', 'user'

    // Deny access if the user doesn't have full access AND is trying to access the 'admin' category
    if (!userHasFullAccessForDoc && requestedCategory === 'admin') {
      console.warn(`Access Denied: User ID '${req.user?.id || 'undefined'}' (is_admin: ${req.user?.is_admin}, is_power_user: ${req.user?.is_power_user}) attempted to access restricted admin documentation '${normalizedDocId}'`);
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to access this documentation.'
      });
    }
    // --- END ACCESS CONTROL (Corrected) ---

    // Set content type header to ensure proper handling
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Send raw file content
    return res.status(200).send(fileContent);
  } catch (error) {
    console.error(`Error fetching documentation '${req.params.id}':`, error);
    res.status(500).json({
      success: false,
      message: `Error fetching documentation: ${error.message}`
    });
  }
};
