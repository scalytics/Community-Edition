const { db } = require('../models/db');

/**
 * Fetches all active filter rules and their associated groups.
 * This is intended for the frontend to build its own filtering logic.
 */
async function getRulesAndGroups(req, res, next) {
  try {
    // Fetch all filter groups (enabled or not, frontend can decide based on is_enabled)
    const groups = await db.allAsync('SELECT id, name, is_enabled, exemption_permission_key FROM filter_groups');

    // Fetch all active rules
    const rules = await db.allAsync(`
      SELECT id, filter_group_id, rule_type, pattern, replacement, is_active
      FROM filter_rules
      WHERE is_active = 1 
    `); // Frontend service already filters by is_active, but good to be explicit.

    // It's important that the 'pattern' for regex rules is sent to the frontend
    // in a way that `new RegExp(pattern, 'gi')` works correctly.
    // SQLite stores strings. If they were double-escaped for backend's new RegExp,
    // they might need to be single-escaped before sending, or the frontend needs to handle it.
    // For now, sending as stored. The frontend service has a comment about this.
    // Example: if DB stores '\\\\bword\\\\b', frontend needs '\\bword\\b'.
    // The current backend service does: rule.pattern.replace(/\\\\/g, '\\')
    // Let's apply this transformation here before sending to frontend.
    const processedRules = rules.map(rule => {
      if (rule.rule_type === 'regex' && rule.pattern) {
        return { ...rule, pattern: rule.pattern.replace(/\\\\/g, '\\') };
      }
      return rule;
    });

    res.json({ groups, rules: processedRules });
  } catch (error) {
    console.error('[FilterDataController] Error fetching rules and groups:', error);
    next(error);
  }
}

module.exports = {
  getRulesAndGroups,
};
