const { db } = require('../models/db');

class UsageStatsService {
  /**
   * Records token usage statistics.
   * @param {object} usageData - The usage data.
   * @param {number} usageData.userId - The ID of the user.
   * @param {number} usageData.modelId - The ID of the model used.
   * @param {number|null} usageData.chatId - The ID of the chat session (can be null).
   * @param {number} usageData.promptTokens - Number of tokens in the prompt.
   * @param {number} usageData.completionTokens - Number of tokens in the completion.
   * @param {number} [usageData.latencyMs] - Optional latency in milliseconds for the operation.
   * @param {string} [usageData.source] - Optional source of the usage log (e.g., 'chat', 'live_search_tool'). Not stored in DB currently.
   */
  static async recordTokens({ userId, modelId, chatId, promptTokens, completionTokens, latencyMs, source }) {
    if (userId === undefined || modelId === undefined || promptTokens === undefined || completionTokens === undefined) {
      console.error('[UsageStatsService] Missing required fields for recordTokens:', { userId, modelId, promptTokens, completionTokens });
      return; 
    }

    const columns = ['user_id', 'model_id', 'chat_id', 'tokens_input', 'tokens_output'];
    const params = [userId, modelId, (chatId === undefined || chatId === null) ? null : chatId, promptTokens, completionTokens];
    const placeholders = ['?', '?', '?', '?', '?'];

    if (latencyMs !== undefined && latencyMs !== null) {
      columns.push('latency_ms');
      params.push(latencyMs);
      placeholders.push('?');
    }

    const sql = `
      INSERT INTO usage_statistics (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
    `;
    
    try {
      await db.runAsync(sql, params);
    } catch (error) {
      console.error('[UsageStatsService] Error recording token usage:', error);
    }
  }

  /**
   * Retrieves the total token usage for a specific user for the current month.
   * @param {number} userId - The ID of the user.
   * @returns {Promise<object|null>} An object with totalInputTokens and totalOutputTokens, or null if an error occurs or no usage.
   */
  static async getMonthlyTokenUsage(userId) {
    if (userId === undefined) {
      console.error('[UsageStatsService] Missing userId for getMonthlyTokenUsage');
      return null;
    }

    const sql = `
      SELECT
        SUM(tokens_input) AS totalInputTokens,
        SUM(tokens_output) AS totalOutputTokens
      FROM usage_statistics
      WHERE user_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime');
    `;
    // Using 'localtime' with strftime to ensure month boundary is correct based on server's local time.
    // SQLite stores TIMESTAMPS usually as UTC, so 'now' is UTC.
    // If created_at is stored as UTC and we want to compare with current month in server's timezone,
    // it's often better to calculate date boundaries in JS and pass them as parameters.
    // However, for simplicity and common SQLite behavior, 'localtime' with 'now' in strftime is a frequent approach.
    // A more robust way would be to calculate start and end of month in JS:
    // const startDate = new Date();
    // startDate.setDate(1);
    // startDate.setHours(0, 0, 0, 0);
    // const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    // endDate.setHours(23, 59, 59, 999);
    // AND created_at >= ? AND created_at <= ?
    // For now, sticking with strftime for brevity as per typical SQLite usage.

    try {
      const row = await db.getAsync(sql, [userId]);
      // SUM will return NULL for a column if there are no rows, or if all values are NULL.
      // If no rows match, row itself will be { totalInputTokens: null, totalOutputTokens: null }
      // So, we ensure we return 0 if they are null.
      return {
        totalInputTokens: row?.totalInputTokens || 0,
        totalOutputTokens: row?.totalOutputTokens || 0,
        totalTokens: (row?.totalInputTokens || 0) + (row?.totalOutputTokens || 0)
      };
    } catch (error) {
      console.error('[UsageStatsService] Error retrieving monthly token usage:', error);
      return null;
    }
  }
}

module.exports = UsageStatsService;
