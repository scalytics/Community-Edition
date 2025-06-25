const { db } = require('../../models/db');

/**
 * Helper function to generate the exemption tag name from a group name.
 * @param {string} groupName - The name of the filter group.
 * @returns {string} The generated tag name (e.g., 'filter_exempt_finance').
 */
function generateExemptionTagName(groupName) {
  if (!groupName) return null;
  return `filter_exempt_${groupName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+$/, '').substring(0, 50)}`;
}

// --- Filter Groups ---

exports.getFilterGroups = async (req, res) => {
  try {
    const groups = await db.allAsync('SELECT * FROM filter_groups ORDER BY name');
    for (const group of groups) {
        group.exemption_tag_name = generateExemptionTagName(group.name);
    }
    res.status(200).json({ success: true, data: groups });
  } catch (error) {
    console.error('Error fetching filter groups:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch filter groups.' });
  }
};

exports.createFilterGroup = async (req, res) => {
  const { name, description, is_enabled } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Filter group name is required.' });
  }

  const exemptionTagName = generateExemptionTagName(name);
  if (!exemptionTagName) {
      return res.status(400).json({ success: false, message: 'Invalid filter group name for generating tag.' });
  }

  try {
    // transaction to ensure tag creation and group creation are atomic
    await db.execAsync('BEGIN TRANSACTION;');

    // Check if the exemption tag exists, create if not
    let tag = await db.getAsync('SELECT id FROM tags WHERE name = ?', [exemptionTagName]);
    if (!tag) {
        const tagDesc = `Allows bypassing the '${name}' content filter group.`;
        const truncatedDesc = tagDesc.length > 255 ? tagDesc.substring(0, 252) + '...' : tagDesc;
        const tagResult = await db.runAsync(
            'INSERT INTO tags (name, description) VALUES (?, ?)',
            [exemptionTagName, truncatedDesc]
        );
        tag = { id: tagResult.lastID }; 
    } else {
    }

    // Create the filter group
    const result = await db.runAsync(
      'INSERT INTO filter_groups (name, description, is_enabled) VALUES (?, ?, ?)',
      [name.trim(), description || null, is_enabled ? 1 : 0]
    );
    const newGroup = await db.getAsync('SELECT * FROM filter_groups WHERE id = ?', [result.lastID]);
    newGroup.exemption_tag_name = exemptionTagName; 

    await db.execAsync('COMMIT;');

    res.status(201).json({ success: true, data: newGroup, message: 'Filter group created successfully.' });

  } catch (error) {
    await db.execAsync('ROLLBACK;').catch(rbErr => console.error('Rollback failed:', rbErr));
    console.error('Error creating filter group:', error);
    if (error.message.includes('UNIQUE constraint failed: filter_groups.name')) {
      return res.status(409).json({ success: false, message: 'Filter group name must be unique.' });
    }
    if (error.message.includes('UNIQUE constraint failed: tags.name')) {
       return res.status(500).json({ success: false, message: 'Failed to create unique exemption tag. Check tag name constraints.' });
     }
    res.status(500).json({ success: false, message: 'Failed to create filter group.' });
  }
};

exports.updateFilterGroup = async (req, res) => {
  const { id } = req.params;
  const { name, description, is_enabled } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Filter group name is required.' });
  }

  try {
    // Note: We don't automatically rename/recreate the exemption tag if the group name changes,
    // as that could break existing group assignments. Admins should manage tags separately if needed.
    // Consider adding a warning in the UI if the name changes.
    const result = await db.runAsync(
      'UPDATE filter_groups SET name = ?, description = ?, is_enabled = ? WHERE id = ?',
      [name.trim(), description || null, is_enabled ? 1 : 0, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Filter group not found.' });
    }

    const updatedGroup = await db.getAsync('SELECT * FROM filter_groups WHERE id = ?', [id]);
    updatedGroup.exemption_tag_name = generateExemptionTagName(updatedGroup.name); 
    res.status(200).json({ success: true, data: updatedGroup, message: 'Filter group updated successfully.' });

  } catch (error) {
    console.error('Error updating filter group:', error);
     if (error.message.includes('UNIQUE constraint failed: filter_groups.name')) {
       return res.status(409).json({ success: false, message: 'Filter group name must be unique.' });
     }
    res.status(500).json({ success: false, message: 'Failed to update filter group.' });
  }
};

exports.deleteFilterGroup = async (req, res) => {
  const { id } = req.params;
  try {
    // Deletion cascades to filter_rules due to FOREIGN KEY constraint
    const result = await db.runAsync('DELETE FROM filter_groups WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Filter group not found.' });
    }
    res.status(200).json({ success: true, message: 'Filter group deleted successfully.' });
  } catch (error) {
    console.error('Error deleting filter group:', error);
    res.status(500).json({ success: false, message: 'Failed to delete filter group.' });
  }
};

// --- Filter Rules ---

exports.getFilterRules = async (req, res) => {
  const { groupId } = req.params;
  try {
    const group = await db.getAsync('SELECT id FROM filter_groups WHERE id = ?', [groupId]);
    if (!group) {
        return res.status(404).json({ success: false, message: 'Filter group not found.' });
    }
    const rules = await db.allAsync('SELECT * FROM filter_rules WHERE filter_group_id = ? ORDER BY id', [groupId]);
    res.status(200).json({ success: true, data: rules });
  } catch (error) {
    console.error(`Error fetching filter rules for group ${groupId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch filter rules.' });
  }
};

exports.createFilterRule = async (req, res) => {
  const { groupId } = req.params;
  const { rule_type, pattern, description, replacement, is_active } = req.body;

  if (!rule_type || !pattern || pattern.trim() === '') {
    return res.status(400).json({ success: false, message: 'Rule type and pattern are required.' });
  }
  if (rule_type === 'regex') {
    try {
      new RegExp(pattern);
    } catch (e) {
      return res.status(400).json({ success: false, message: `Invalid regex pattern: ${e.message}` });
    }
  } else if (rule_type.startsWith('ner_')) {
    // For NER, pattern should be a simple entity type string (e.g., PERSON, GPE, ORG)
    // Add basic validation if needed, e.g., check against allowed spaCy types
    if (!/^[A-Z_]+$/.test(pattern)) {
       return res.status(400).json({ success: false, message: 'Invalid NER entity type format for pattern. Should be uppercase letters and underscores (e.g., PERSON, ORG).' });
    }
  } else if (rule_type.startsWith('presidio_')) {
     if (!/^[A-Z_]+$/.test(pattern)) {
        return res.status(400).json({ success: false, message: 'Invalid Presidio entity type format for pattern. Should be uppercase letters and underscores (e.g., CREDIT_CARD_NUMBER).' });
     }
  } else {
     return res.status(400).json({ success: false, message: `Unsupported rule_type: ${rule_type}` });
  }


  try {
     // Check if group exists first
     const group = await db.getAsync('SELECT id FROM filter_groups WHERE id = ?', [groupId]);
     if (!group) {
         return res.status(404).json({ success: false, message: 'Filter group not found.' });
     }

    const result = await db.runAsync(
      'INSERT INTO filter_rules (filter_group_id, rule_type, pattern, description, replacement, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [groupId, rule_type, pattern.trim(), description || null, replacement, is_active === false ? 0 : 1]
    );
    const newRule = await db.getAsync('SELECT * FROM filter_rules WHERE id = ?', [result.lastID]);
    res.status(201).json({ success: true, data: newRule, message: 'Filter rule created successfully.' });
  } catch (error) {
    console.error('Error creating filter rule:', error);
    res.status(500).json({ success: false, message: 'Failed to create filter rule.' });
  }
};

exports.updateFilterRule = async (req, res) => {
  const { ruleId } = req.params;
  const { rule_type, pattern, description, replacement, is_active } = req.body;

  // --- Check if it's a system default rule ---
  let originalRule;
  try {
    originalRule = await db.getAsync('SELECT is_system_default, is_active FROM filter_rules WHERE id = ?', [ruleId]);
    if (!originalRule) {
      return res.status(404).json({ success: false, message: 'Filter rule not found.' });
    }
  } catch (fetchError) {
    console.error('Error fetching rule before update:', fetchError);
    return res.status(500).json({ success: false, message: 'Failed to check rule status before update.' });
  }

  // --- Validation ---
  // Only allow updating 'is_active' for system default rules
  if (originalRule.is_system_default === 1) {
    if (rule_type !== undefined || pattern !== undefined || description !== undefined || replacement !== undefined) {
       const forbiddenFields = ['rule_type', 'pattern', 'description', 'replacement'].filter(field => req.body.hasOwnProperty(field));
       if (forbiddenFields.length > 0) {
           return res.status(403).json({ success: false, message: 'Cannot modify fields other than "is_active" for system default rules.' });
       }
    }
    if (is_active === undefined || typeof is_active !== 'boolean') {
       if (Object.keys(req.body).length === 1 && req.body.hasOwnProperty('is_active')) {
           return res.status(400).json({ success: false, message: 'Invalid value for is_active. Must be true or false.' });
       }
       // If other fields were *not* provided, and is_active is also not provided or invalid, treat as no-op or error?
       // For simplicity, let's allow the update to proceed if only is_active is changing, otherwise validate below.
    }
  } else {
    if (!rule_type || !pattern || pattern.trim() === '') {
      return res.status(400).json({ success: false, message: 'Rule type and pattern are required.' });
    }
   }

   // Validate rule_type and pattern based on type (only if not a system rule or if these fields are provided)
   if (originalRule.is_system_default !== 1 || (req.body.hasOwnProperty('rule_type') || req.body.hasOwnProperty('pattern'))) {
       if (rule_type === 'regex') {
         try {
           new RegExp(pattern);
         } catch (e) {
           return res.status(400).json({ success: false, message: `Invalid regex pattern: ${e.message}` });
         }
       } else if (rule_type?.startsWith('ner_')) {
         if (!/^[A-Z_]+$/.test(pattern)) {
            return res.status(400).json({ success: false, message: 'Invalid NER entity type format for pattern.' });
         }
       } else if (rule_type?.startsWith('presidio_')) {
          if (!/^[A-Z_]+$/.test(pattern)) {
             return res.status(400).json({ success: false, message: 'Invalid Presidio entity type format for pattern.' });
          }
       } else if (rule_type) { 
          return res.status(400).json({ success: false, message: `Unsupported rule_type: ${rule_type}` });
       }
   }

   // --- Prepare Update ---
   let updateQuery = 'UPDATE filter_rules SET ';
   const updateParams = [];
   const updateFields = [];

   // Only include fields that are allowed to be updated
   if (originalRule.is_system_default !== 1) {
       if (req.body.hasOwnProperty('rule_type')) { updateFields.push('rule_type = ?'); updateParams.push(rule_type); }
       if (req.body.hasOwnProperty('pattern')) { updateFields.push('pattern = ?'); updateParams.push(pattern.trim()); }
       if (req.body.hasOwnProperty('description')) { updateFields.push('description = ?'); updateParams.push(description || null); }
       if (req.body.hasOwnProperty('replacement')) { updateFields.push('replacement = ?'); updateParams.push(replacement); }
   }
   
   if (req.body.hasOwnProperty('is_active')) {
       // Ensure is_active is boolean/integer 0 or 1
       const activeValue = (is_active === true || is_active === 1 || is_active === 'true') ? 1 : 0;
       updateFields.push('is_active = ?');
       updateParams.push(activeValue);
   }

   if (updateFields.length === 0) {
       return res.status(200).json({ success: true, message: 'No changes detected.', data: originalRule });
   }

   updateQuery += updateFields.join(', ') + ', updated_at = CURRENT_TIMESTAMP WHERE id = ?';
   updateParams.push(ruleId);

   // --- Execute Update ---
   try {
     const result = await db.runAsync(updateQuery, updateParams);

     if (result.changes === 0) {
       // This case should be caught by the initial check, but added for safety
       return res.status(404).json({ success: false, message: 'Filter rule not found or no changes made.' });
     }

     const updatedRule = await db.getAsync('SELECT * FROM filter_rules WHERE id = ?', [ruleId]);
     res.status(200).json({ success: true, data: updatedRule, message: 'Filter rule updated successfully.' });
   } catch (error) {
     console.error('Error updating filter rule:', error);
     res.status(500).json({ success: false, message: 'Failed to update filter rule.' });
   }
 };

// --- Update Rule Status Only ---
exports.updateRuleStatus = async (req, res) => {
  const { ruleId } = req.params;
  const { is_active } = req.body;

  // Validate input
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid value for is_active. Must be true or false.' });
  }

  const activeValue = is_active ? 1 : 0;

  try {
    // Check if rule exists first
    const ruleExists = await db.getAsync('SELECT id FROM filter_rules WHERE id = ?', [ruleId]);
    if (!ruleExists) {
      return res.status(404).json({ success: false, message: 'Filter rule not found.' });
    }

    // Update the is_active status and updated_at timestamp
    const result = await db.runAsync(
      'UPDATE filter_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [activeValue, ruleId]
    );

    if (result.changes === 0) {
      // Should be caught by the existence check, but good to have
      return res.status(404).json({ success: false, message: 'Filter rule not found or status was already set to the target value.' });
    }

    // Fetch the updated rule to return it
    const updatedRule = await db.getAsync('SELECT * FROM filter_rules WHERE id = ?', [ruleId]);
    res.status(200).json({ success: true, data: updatedRule, message: 'Filter rule status updated successfully.' });

  } catch (error) {
    console.error(`Error updating status for filter rule ${ruleId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update filter rule status.' });
  }
};


 exports.deleteFilterRule = async (req, res) => {
   const { ruleId } = req.params;
   try {
     // --- Check if it's a system default rule ---
     const rule = await db.getAsync('SELECT is_system_default FROM filter_rules WHERE id = ?', [ruleId]);
     if (!rule) {
       return res.status(404).json({ success: false, message: 'Filter rule not found.' });
     }
     if (rule.is_system_default === 1) {
       return res.status(403).json({ success: false, message: 'Cannot delete system default rules.' });
     }

     // --- Proceed with deletion ---
     const result = await db.runAsync('DELETE FROM filter_rules WHERE id = ?', [ruleId]);
     if (result.changes === 0) {
       return res.status(404).json({ success: false, message: 'Filter rule not found.' });
     }
     res.status(200).json({ success: true, message: 'Filter rule deleted successfully.' });
   } catch (error) {
     console.error('Error deleting filter rule:', error);
     res.status(500).json({ success: false, message: 'Failed to delete filter rule.' });
   }
 };
