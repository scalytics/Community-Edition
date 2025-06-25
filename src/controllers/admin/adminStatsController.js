const { db } = require('../../models/db');
const User = require('../../models/User');
const Model = require('../../models/Model');
const Chat = require('../../models/Chat');
const Papa = require('papaparse');

// Get system overview statistics
exports.getSystemStats = async (req, res) => {
  try {
    // Get user count
    const userCount = await User.count();

    // Get model count
    const modelCount = await Model.count();
    const activeModelCount = await Model.count(true);

    // Get chat count
    const chatCount = await Chat.count();

    // Get message count
    const messageCount = await db.getAsync('SELECT COUNT(*) as count FROM messages');

    // Get usage statistics
    const usageStats = await db.getAsync(`
      SELECT
        SUM(tokens_input) as total_tokens_input,
        SUM(tokens_output) as total_tokens_output,
        AVG(latency_ms) as avg_latency
      FROM usage_statistics
    `);

    res.status(200).json({
      success: true,
      data: {
        users: userCount,
        models: {
          total: modelCount,
          active: activeModelCount
        },
        chats: chatCount,
        messages: messageCount ? messageCount.count : 0,
        usage: {
          totalTokensInput: usageStats ? usageStats.total_tokens_input || 0 : 0,
          totalTokensOutput: usageStats ? usageStats.total_tokens_output || 0 : 0,
          avgLatency: usageStats ? usageStats.avg_latency || 0 : 0
        }
      }
    });
  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system statistics'
    });
  }
};

// Get model usage statistics
exports.getModelStats = async (req, res) => {
  try {
    // Get model usage by user
    const userUsage = await db.allAsync(`
      SELECT
        u.id as user_id,
        u.username,
        COUNT(DISTINCT us.chat_id) as chat_count,
        SUM(us.tokens_input) as tokens_input,
        SUM(us.tokens_output) as tokens_output
      FROM usage_statistics us
      JOIN users u ON us.user_id = u.id
      WHERE us.model_id = ?
      GROUP BY u.id
      ORDER BY tokens_output DESC
      LIMIT 10
    `, [req.params.id]);

    // Get daily usage over time
    const dailyUsage = await db.allAsync(`
      SELECT
        DATE(created_at) as date,
        SUM(tokens_input) as tokens_input,
        SUM(tokens_output) as tokens_output,
        COUNT(DISTINCT chat_id) as chat_count,
        AVG(latency_ms) as avg_latency
      FROM usage_statistics
      WHERE model_id = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [req.params.id]);

    res.status(200).json({
      success: true,
      data: {
        userUsage,
        dailyUsage
      }
    });
  } catch (error) {
    console.error('Get model stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching model statistics'
    });
  }
};

 // Get usage statistics over time
 exports.getUsageOverTime = async (req, res) => {
   try {
     // Access parameters potentially nested under 'params' or directly on 'query'
     const queryParams = req.query.params || req.query; 
     const period = queryParams.period || 'daily';
     const limit = parseInt(queryParams.limit) || 100; 
 
     let periodGroupExpression;
     let periodSelectExpression;
    switch (period) {
      case 'hourly': 
        periodGroupExpression = "strftime('%Y-%m-%d %H:00:00', created_at)";
        periodSelectExpression = periodGroupExpression;
        break;
      case 'weekly':
        // Group by and Select the actual date of the Monday of the week.
        // Ensures grouping and selection keys match exactly.
        periodGroupExpression = "DATE(created_at, 'weekday 1', '-6 days')"; 
        periodSelectExpression = periodGroupExpression; 
        break;
      case 'monthly':
        // Group by Year-Month string
        periodGroupExpression = "strftime('%Y-%m', created_at)";
        // Select the first day of the month for display consistency
        periodSelectExpression = "DATE(created_at, 'start of month')";
        break;
      default: // daily
        periodGroupExpression = "DATE(created_at)";
        periodSelectExpression = periodGroupExpression;
    }

    const query = `
      SELECT
        ${periodSelectExpression} as time_period, 
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT chat_id) as chat_count,
        SUM(tokens_input) as tokens_input,
        SUM(tokens_output) as tokens_output,
        AVG(latency_ms) as avg_latency
      FROM usage_statistics
      GROUP BY ${periodGroupExpression} 
      ORDER BY time_period DESC
      LIMIT ?
     `;
 
     const usageStats = await db.allAsync(query, [limit]);
 
     res.status(200).json({
      success: true,
      period,
      data: usageStats
    });
  } catch (error) {
    console.error('Get usage over time error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching usage statistics'
    });
  }
};

// Get system logs (filtered for important actions)
exports.getSystemLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    // Define important actions to show in the main activity feed
    const importantActions = [
      'reset_password', 'register_user', 'resend_invitation',
      'grant_permission', 'revoke_permission', 'grant_group_permission', 'revoke_group_permission',
      'create_group', 'delete_group', 'assign_user_to_group', 'remove_user_from_group',
      'set_api_key', 'delete_api_key', 'activate_api_key', 'deactivate_api_key',
      'add_provider', 'update_provider', 'delete_provider',
      'download_model', 'delete_model', 'optimize_model',
      'update_global_privacy_mode', 'user_login' // Add/remove based on actual logged actions
    ];
    const placeholders = importantActions.map(() => '?').join(',');

    const logs = await db.allAsync(`
      SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.details,
        al.ip_address,
        al.created_at
      FROM access_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.action IN (${placeholders})
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `, [...importantActions, limit, offset]);

    const total = await db.getAsync('SELECT COUNT(*) as count FROM access_logs');

    res.status(200).json({
      success: true,
      count: logs.length,
      total: total ? total.count : 0,
      data: logs
    });
  } catch (error) {
    console.error('Get system logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system logs'
    });
  }
};

/**
 * Download all system logs as CSV
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
exports.downloadSystemLogs = async (req, res) => {
  try {
    // Fetch all logs without limit/offset or action filtering
    const logs = await db.allAsync(`
      SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.details,
        al.ip_address,
        al.created_at
      FROM access_logs al
      JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
    `);

    if (!logs || logs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No logs found to download.'
      });
    } // Correctly close the if block here

    // Pre-process logs to stringify details if it's an object/array
    const processedLogs = logs.map(log => ({
      ...log,
      details: (typeof log.details === 'object' && log.details !== null) ? JSON.stringify(log.details) : log.details
    }));


    // Convert JSON to CSV using PapaParse
    const csv = Papa.unparse(processedLogs);

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="scalytics_connect_activity_log.csv"'); // Restored original filename
    res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8')); // Explicitly set Content-Length

    // Send the CSV data
    res.status(200).send(csv);


  } catch (error) {
    console.error('Download system logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading system logs'
    });
  }
};
