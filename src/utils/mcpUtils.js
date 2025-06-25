const { db } = require('../models/db');

/**
 * MCP permission constants
 */
const MCP_PERMISSIONS = {
  READ_INPUTS: 'readInputs',
  WRITE_OUTPUTS: 'writeOutputs',
  STORE_CONTEXT: 'storeContext',
  ACCESS_FILES: 'accessFiles',
  FUNCTION_CALL: 'functionCall'
};

/**
 * Generate MCP permission object based on settings
 * @param {Object} settings - Settings object
 * @returns {Object} - MCP permissions object
 */
function generateMCPPermissions(settings) {
  return {
    [MCP_PERMISSIONS.READ_INPUTS]: true,
    [MCP_PERMISSIONS.WRITE_OUTPUTS]: true,
    [MCP_PERMISSIONS.STORE_CONTEXT]: settings?.mcp_allow_context_storage || false,
    [MCP_PERMISSIONS.ACCESS_FILES]: settings?.mcp_allow_file_access || false,
    [MCP_PERMISSIONS.FUNCTION_CALL]: settings?.mcp_allow_function_calls || false
  };
}

/**
 * Create MCP metadata for a chat session
 * @param {Object} chat - Chat object
 * @param {Object} user - User object
 * @param {Object} model - Model object
 * @returns {Object} - MCP metadata object
 */
async function createMCPMetadata(chat, user, model) {
  // Get user settings
  const settings = await db.getAsync(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [user.id]
  );
  
  // Generate permissions
  const permissions = generateMCPPermissions(settings);
  
  return {
    protocol: 'mcp',
    version: '1.0',
    permissions,
    chat_id: chat.id,
    session_id: `${chat.id}-${Date.now()}`,
    model_info: {
      id: model.id,
      name: model.name,
      provider: model.external_provider_id ? 'external' : 'local',
      external_id: model.external_model_id
    },
    application: {
      name: 'Scalytics MCP Server',
      version: process.env.APP_VERSION || '1.0.0'
    }
  };
}

/**
 * Store MCP metadata with a message
 * @param {number} messageId - Message ID
 * @param {Object} metadata - MCP metadata
 * @returns {Promise<boolean>} - Success status
 */
async function storeMCPMetadata(messageId, metadata) {
  try {
    await db.runAsync(
      'UPDATE messages SET mcp_metadata = ? WHERE id = ?',
      [JSON.stringify(metadata), messageId]
    );
    return true;
  } catch (error) {
    console.error('Error storing MCP metadata:', error);
    return false;
  }
}

/**
 * Get MCP metadata for a message
 * @param {number} messageId - Message ID
 * @returns {Promise<Object|null>} - MCP metadata object or null
 */
async function getMCPMetadata(messageId) {
  try {
    const message = await db.getAsync(
      'SELECT mcp_metadata FROM messages WHERE id = ?',
      [messageId]
    );
    
    if (message && message.mcp_metadata) {
      return JSON.parse(message.mcp_metadata);
    }
    
    return null;
  } catch (error) {
    console.error('Error getting MCP metadata:', error);
    return null;
  }
}

/**
 * Check if MCP is enabled for a user
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} - Whether MCP is enabled
 */
async function isMCPEnabled(userId) {
  try {
    const settings = await db.getAsync(
      'SELECT mcp_enabled FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    return settings && settings.mcp_enabled === 1;
  } catch (error) {
    console.error('Error checking if MCP is enabled:', error);
    return false;
  }
}

module.exports = {
  MCP_PERMISSIONS,
  generateMCPPermissions,
  createMCPMetadata,
  storeMCPMetadata,
  getMCPMetadata,
  isMCPEnabled
};