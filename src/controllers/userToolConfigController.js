/**
 * Controller for managing user-specific tool configurations.
 */
const { db } = require('../models/db');

/**
 * Get the configuration for a specific tool for the logged-in user.
 * GET /api/users/me/tool-configs/:toolName
 */
exports.getUserToolConfig = async (req, res) => {
  const userId = req.user?.id;
  const { toolName } = req.params;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }
  if (!toolName) {
    return res.status(400).json({ success: false, message: 'Tool name parameter is required.' });
  }

  try {
    const row = await db.getAsync(
      'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
      [userId, toolName]
    );

    if (!row) {
      // It's okay if config doesn't exist yet, return null or empty object
      return res.status(200).json({ success: true, data: null });
    }

    // Attempt to parse the JSON config string
    let configData = null;
    try {
      configData = JSON.parse(row.config);
    } catch (parseError) {
      console.error(`Error parsing tool config JSON for user ${userId}, tool ${toolName}:`, parseError);
      // Return the raw string if parsing fails? Or return error? Let's return null.
      return res.status(200).json({ success: true, data: null, warning: 'Stored config is not valid JSON.' });
    }

    res.status(200).json({ success: true, data: configData });

  } catch (error) {
    console.error(`Error fetching tool config for user ${userId}, tool ${toolName}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching tool configuration.' });
  }
};

/**
 * Save or update the configuration for a specific tool for the logged-in user.
 * POST /api/users/me/tool-configs
 */
exports.saveUserToolConfig = async (req, res) => {
  const userId = req.user?.id;
  const { toolName, config } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }
  if (!toolName) {
    return res.status(400).json({ success: false, message: 'Tool name is required in the request body.' });
  }
  if (config === undefined || config === null) {
    return res.status(400).json({ success: false, message: 'Config object is required in the request body.' });
  }

  let configString;
  try {
    // Ensure the config is stored as a JSON string
    configString = JSON.stringify(config);
  } catch (stringifyError) {
    console.error(`Error stringifying tool config for user ${userId}, tool ${toolName}:`, stringifyError);
    return res.status(400).json({ success: false, message: 'Invalid config object provided.' });
  }

  try {
    // Use INSERT OR REPLACE (SQLite specific) or similar logic for upsert
    // This relies on the UNIQUE(user_id, tool_name) constraint
    const result = await db.runAsync(`
      INSERT INTO user_tool_configs (user_id, tool_name, config)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, tool_name) DO UPDATE SET
        config = excluded.config,
        updated_at = CURRENT_TIMESTAMP;
    `, [userId, toolName, configString]);

    // Fetch the newly saved/updated config to return it
    const updatedRow = await db.getAsync(
        'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
        [userId, toolName]
      );

    let updatedConfigData = null;
    if (updatedRow) {
        try {
            updatedConfigData = JSON.parse(updatedRow.config);
        } catch { /* ignore parse error on return */ }
    }


    res.status(200).json({ success: true, message: 'Configuration saved successfully.', data: updatedConfigData });

  } catch (error) {
    console.error(`Error saving tool config for user ${userId}, tool ${toolName}:`, error);
    res.status(500).json({ success: false, message: 'Error saving tool configuration.' });
  }
};
