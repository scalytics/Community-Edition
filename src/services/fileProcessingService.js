const fs = require('fs').promises;
const path = require('path');
const { db } = require('../models/db');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse'); 
const mammoth = require('mammoth'); 

/**
 * Process a file for inclusion in a model prompt
 * @param {number|string} fileId - ID of the file to process
 * @param {number|string} userId - ID of the user who owns the file
 * @returns {Promise<Object>} File information including contents, filename, and type
 */
async function processFileForModel(fileId, userId) {
  try {
    const file = await db.getAsync(
      'SELECT * FROM user_files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );

    if (!file) {
      console.error(`[FileProcessing] File metadata not found in DB for ID: ${fileId}, User ID: ${userId}`);
      throw new Error(`File not found: ID ${fileId}, User ${userId}`);
    }
    const fullFilePath = path.join(UPLOAD_DIR, file.file_path);

    try {
      await fs.access(fullFilePath);
    } catch (err) {
      console.error(`[FileProcessing] File does not exist at path: ${fullFilePath} (DB path: ${file.file_path})`, err); 
      throw new Error(`File exists in database but not on disk: ${file.original_name}`);
    }
    const fileContents = await readFileContents(fullFilePath, file.file_type);

    return {
      filename: file.original_name,
      contents: fileContents,
      type: file.file_type,
      size: file.file_size,
      id: file.id
    };
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

/**
 * Read and parse file contents based on file type
 * @param {string} filePath - Path to the file
 * @param {string} fileType - MIME type of the file
 * @returns {Promise<string>} Parsed file contents
 */
async function readFileContents(filePath, fileType) {
  try {
    const normalizedPath = path.normalize(filePath);
    
    // Read file buffer
    const fileBuffer = await fs.readFile(normalizedPath);

    // Parse based on file type
    switch (fileType) {
      case 'text/csv':
        return parseCsvFile(fileBuffer);
        
      case 'application/json':
        try {
          const jsonContent = JSON.parse(fileBuffer.toString('utf8'));
          return JSON.stringify(jsonContent, null, 2); 
        } catch (jsonError) {
          console.error('Error parsing JSON:', jsonError);
          return fileBuffer.toString('utf8'); 
        }
        
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return parseExcelFile(fileBuffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // DOCX
        return parseDocxFile(fileBuffer);
        
      case 'text/plain':
      case 'text/markdown':
      case 'text/html':
      case 'application/javascript':
      case 'text/css':
        return fileBuffer.toString('utf8');
      
      case 'application/pdf':
        return parsePdfFile(fileBuffer); 
        
      default:
        try {
          return fileBuffer.toString('utf8');
        } catch (err) {
          return `[Binary file: ${fileType}]`;
        }
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return `[Error reading file: ${error.message}]`;
  }
}

/**
 * Parse PDF file content
 * @param {Buffer} fileBuffer - File content as buffer
 * @returns {Promise<string>} Extracted text content
 */
async function parsePdfFile(fileBuffer) {
  try {
    const data = await pdfParse(fileBuffer);
    const maxChars = 20000; 
    const truncatedText = data.text.substring(0, maxChars);
    let result = truncatedText;
    if (data.text.length > maxChars) {
      result += `\n\n[Note: PDF content truncated to first ${maxChars} characters]`;
    }
    return result;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return '[Error: Could not parse PDF content]';
  }
}

/**
 * Parse DOCX file content
 * @param {Buffer} fileBuffer - File content as buffer
 * @returns {Promise<string>} Extracted text content
 */
async function parseDocxFile(fileBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const maxChars = 20000;
    const truncatedText = result.value.substring(0, maxChars);
    let output = truncatedText;
    if (result.value.length > maxChars) {
      output += `\n\n[Note: DOCX content truncated to first ${maxChars} characters]`;
    }
    return output;
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    return '[Error: Could not parse DOCX content]';
  }
}


/**
 * Parse CSV file content
 * @param {Buffer} fileBuffer - File content as buffer
 * @returns {string} Formatted CSV content
 */
function parseCsvFile(fileBuffer) {
  try {
    const csvString = fileBuffer.toString('utf8');
    
    const result = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true
    });
    
    if (result.errors && result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors);
    }
    
    if (result.data && result.data.length > 0) {
      const headers = result.meta.fields || Object.keys(result.data[0]);
      
      const rows = result.data.slice(0, 100);
      
      let output = headers.join(',') + '\n';
      
      rows.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value || '';
        });
        output += values.join(',') + '\n';
      });
      
      if (result.data.length > 100) {
        output += `\n[Note: CSV file truncated, showing 100/${result.data.length} rows]`;
      }
      
      return output;
    }
    
    return csvString;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return fileBuffer.toString('utf8'); 
  }
}

/**
 * Parse Excel file content
 * @param {Buffer} fileBuffer - File content as buffer
 * @returns {string} Formatted Excel content
 */
function parseExcelFile(fileBuffer) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    const sheetNames = workbook.SheetNames;
    
    if (sheetNames.length === 0) {
      return '[Empty Excel file]';
    }
    
    const sheetsToProcess = sheetNames.slice(0, 3);
    
    let result = '';
    
    sheetsToProcess.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        result += `\n[Sheet: ${sheetName} - Empty]\n`;
        return;
      }
      
      const headers = Object.keys(jsonData[0]);
      
      const rows = jsonData.slice(0, 50);
      
      result += `\n[Sheet: ${sheetName}]\n`;
      
      result += headers.join(',') + '\n';
      
      rows.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value !== undefined ? value : '';
        });
        result += values.join(',') + '\n';
      });
      
      if (jsonData.length > 50) {
        result += `\n[Note: Excel sheet truncated, showing 50/${jsonData.length} rows]\n`;
      }
    });
    
    if (sheetNames.length > 3) {
      result += `\n[Note: Excel file has ${sheetNames.length} sheets, showing first 3]\n`;
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return '[Error: Could not parse Excel file]';
  }
}

module.exports = {
  processFileForModel
};
