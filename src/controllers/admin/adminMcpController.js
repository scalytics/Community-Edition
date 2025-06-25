const { db } = require('../../models/db');
const { getSystemSetting } = require('../../config/systemConfig'); // Import system config
const Model = require('../../models/Model'); // Import Model for check

/**
 * Update the active status of a locally defined MCP tool.
 * Requires admin privileges.
 * @param {Object} req - Request object (params.toolName, body.isActive)
 * @param {Object} res - Response object
 */
exports.updateLocalToolStatus = async (req, res) => {
  const { toolName } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
     return res.status(400).json({ success: false, message: 'isActive must be a boolean value.' });
   }

   // --- Add check for embedding model dependency ---
   if (toolName === 'scalytics_search' && isActive) {
     const preferredEmbeddingModelId = getSystemSetting('preferred_local_embedding_model_id', null);
     if (!preferredEmbeddingModelId) {
       return res.status(400).json({ success: false, message: 'Cannot enable Live Search: No preferred local embedding model is configured.' });
     }
     try {
       const embeddingModel = await Model.findById(parseInt(preferredEmbeddingModelId, 10));
       if (!embeddingModel || !embeddingModel.is_active || !embeddingModel.is_embedding_model) {
         return res.status(400).json({ success: false, message: `Cannot enable Live Search: Configured embedding model (ID: ${preferredEmbeddingModelId}) is inactive, not found, or not an embedding model.` });
       }
     } catch (modelError) {
       console.error(`Error verifying embedding model ${preferredEmbeddingModelId}:`, modelError);
       return res.status(500).json({ success: false, message: 'Error verifying the required embedding model.' });
     }
   }
   // --- End check ---

  try {
    const existingTool = await db.getAsync(
      'SELECT tool_name FROM mcp_local_tools_status WHERE tool_name = ?',
      [toolName]
    );

    if (!existingTool) {
      return res.status(404).json({ success: false, message: `Local tool '${toolName}' not found in status table.` });
    } else {
      await db.runAsync(
        'UPDATE mcp_local_tools_status SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE tool_name = ?',
        [isActive ? 1 : 0, toolName]
      );
    }

    try {
        await db.runAsync(
          `INSERT INTO access_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`,
          [req.user.id, 'update_local_mcp_tool_status', JSON.stringify({ toolName, isActive }), req.ip]
        );
      } catch (logError) { console.error('Failed to log update_local_mcp_tool_status action:', logError); }


    res.status(200).json({ success: true, message: `Status for tool '${toolName}' updated successfully.` });

  } catch (error) {
    console.error(`Error updating status for local tool '${toolName}':`, error);
    res.status(500).json({ success: false, message: 'Error updating local tool status.' });
  }
};
