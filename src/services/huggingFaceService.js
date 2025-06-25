/**
 * Hugging Face Service
 * Provides functionality for interacting with Hugging Face model hub
 * 
 * This module imports and re-exports the modular implementation
 * for backward compatibility with existing code.
 */

// Import from modular implementation
const huggingFaceService = require('./huggingFaceService/index');

// Export the combined service
module.exports = huggingFaceService;
