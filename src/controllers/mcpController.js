const { db } = require('../models/db');
const { getSystemSetting } = require('../config/systemConfig'); 
const MCPService = require('../services/agents/MCPService');

/**
 * Get the status of all locally defined MCP tools.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getLocalToolStatus = async (req, res) => {
  try {
    const statuses = await db.allAsync(
      'SELECT tool_name, is_active FROM mcp_local_tools_status'
    );

    const statusMap = statuses.reduce((acc, row) => {
      acc[row.tool_name] = !!row.is_active; 
       return acc;
     }, {});
 
     res.status(200).json({ success: true, data: statusMap });
   } catch (error) {
     console.error('Error fetching local MCP tool statuses:', error);
    res.status(500).json({ success: false, message: 'Error fetching local tool statuses.' });
  }
};

/**
 * Get the publicly visible status of enabled local tools.
 * Performs checks like embedding model dependency.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getPublicToolStatus = async (req, res) => {
  try {
    const activeTools = await db.allAsync(
      'SELECT tool_name FROM mcp_local_tools_status WHERE is_active = 1'
    );

    const statusMap = {};
    let isDeepSearchPotentiallyEnabled = false;

     activeTools.forEach(row => {
       statusMap[row.tool_name] = true; 
       if (row.tool_name === 'live-search') {
          isDeepSearchPotentiallyEnabled = true;
      }
    });

    // --- Perform dependency checks ---

    // Check Live Search dependency on embedding model
    if (isDeepSearchPotentiallyEnabled) {
      const preferredEmbeddingModelId = getSystemSetting('preferred_local_embedding_model_id', null);
      let embeddingModelOK = false;
      if (preferredEmbeddingModelId) {
          try {
              embeddingModelOK = true;
          } catch (e) { /* ignore error, embeddingModelOK remains false */ }
      }

       if (!embeddingModelOK) {
         if (statusMap['live-search']) statusMap['live-search'] = false;
       }
     }

    const finalStatusMap = Object.entries(statusMap)
      .filter(([_, isActive]) => isActive)
      .reduce((acc, [toolName, isActive]) => {
        acc[toolName] = isActive;
        return acc;
      }, {});


    res.status(200).json({ success: true, data: finalStatusMap });
  } catch (error) {
    console.error('Error fetching public MCP tool statuses:', error);
    res.status(500).json({ success: false, message: 'Error fetching tool statuses.', data: {} });
  }
};

/**
 * Get definitions of available MCP tools (internal and external).
 * Uses the MCPService which handles discovery and status checks.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAvailableToolDefinitions = async (req, res) => {
  try {
    const allTools = await MCPService.listMCPTools();

    res.status(200).json({ success: true, data: allTools });
  } catch (error) {
    console.error('Get available MCP tool definitions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching available tool definitions' });
  }
};

/**
 * Get the current user's configuration for the 'image_gen' tool.
 * @param {Object} req - Request object (req.user.id is available via `protect` middleware)
 * @param {Object} res - Response object
 */
exports.getUserImageGenConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const toolConfig = await db.getAsync(
      "SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = 'image_gen'",
      [userId]
    );

    if (toolConfig && toolConfig.config) {
      res.status(200).json({ success: true, data: JSON.parse(toolConfig.config) });
    } else {
      res.status(200).json({ success: true, data: {} }); 
    }
  } catch (error) {
    console.error("Error fetching user 'image_gen' tool config:", error);
    res.status(500).json({ success: false, message: "Error fetching Image Generation tool configuration." });
  }
};

/**
 * Save/update the current user's configuration for the 'image_gen' tool.
 * @param {Object} req - Request object (req.user.id, req.body.selected_model_id)
 * @param {Object} res - Response object
 */
exports.setUserImageGenConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const { selected_model_id } = req.body;

    if (!selected_model_id) {
      await db.runAsync(
        "DELETE FROM user_tool_configs WHERE user_id = ? AND tool_name = 'image_gen'",
        [userId]
      );
      return res.status(200).json({ success: true, message: 'Image Generation tool configuration cleared.' });
    }

    const model = await db.getAsync(
      "SELECT id, name, can_generate_images FROM models WHERE id = ? AND can_generate_images = 1 AND is_active = 1",
      [selected_model_id]
    );

    if (!model) {
      return res.status(400).json({ success: false, message: 'Invalid or non-image-capable model selected, or you do not have access.' });
    }

    const config = JSON.stringify({ selected_model_id: parseInt(selected_model_id, 10) });

    await db.runAsync(
      `INSERT OR REPLACE INTO user_tool_configs (user_id, tool_name, config, created_at, updated_at) 
       VALUES (?, 'image_gen', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, config]
    );

    res.status(200).json({ success: true, message: 'Image Generation tool configuration saved.' });
  } catch (error) {
    console.error("Error saving user 'image_gen' tool config:", error);
    res.status(500).json({ success: false, message: 'Error saving Image Generation tool configuration.' });
  }
};
