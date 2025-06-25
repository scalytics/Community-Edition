/**
 * mcpWrapper.js - CommonJS wrapper around the ESM-based mcp-client module
 * 
 * This solves the "Error [ERR_REQUIRE_ESM]" issue by providing a compatible
 * interface that uses dynamic import() behind the scenes.
 */

// Track if we've initialized the module
let initialized = false;
let MCPClient = null;
let initializationError = null;

/**
 * Dynamically import the ESM mcp-client module
 * @returns {Promise<Object>} The MCP client class
 */
async function initialize() {
  if (initialized) {
    if (initializationError) {
      throw initializationError;
    }
    return MCPClient;
  }
  
  try {
    // Dynamic import (works in both ESM and CommonJS)
    const module = await import('mcp-client');
    
    // ESM modules typically export the main class as default
    MCPClient = module.default || module;
    initialized = true;
    
    return MCPClient;
  } catch (error) {
    console.error('Failed to import mcp-client:', error);
    initializationError = error;
    throw error;
  }
}

/**
 * Create a new MCP client instance
 * @param {Object} options Client configuration options
 * @returns {Promise<Object>} Initialized client instance
 */
async function createClient(options = {}) {
  const ClientClass = await initialize();
  return new ClientClass(options);
}

// Explicitly wrap the ESM methods into CommonJS compatible exports
module.exports = {
  initialize,
  createClient
};
