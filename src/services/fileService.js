const { db } = require('../models/db');

/**
 * Fetches metadata for specified file IDs belonging to a user.
 * @param {number[]} fileIds - An array of file IDs.
 * @param {number} userId - The ID of the user who owns the files.
 * @returns {Promise<Array<{id: number, original_name: string, file_path: string, file_type: string, file_size: number, user_id: number}>>} 
 *          An array of file detail objects. Returns an empty array if no files are found or on error.
 */
async function getFileDetailsByIds(fileIds, userId) {
  if (!fileIds || fileIds.length === 0 || !userId) {
    return [];
  }

  try {
    // Ensure fileIds are numbers
    const numericFileIds = fileIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (numericFileIds.length === 0) {
      return [];
    }

    const placeholders = numericFileIds.map(() => '?').join(',');
    const query = `
      SELECT id, user_id, original_name, file_path, file_type, file_size 
      FROM user_files 
      WHERE id IN (${placeholders}) AND user_id = ?
    `;
    
    const files = await db.allAsync(query, [...numericFileIds, userId]);
    return files || [];
  } catch (error) {
    console.error('Error fetching file details by IDs:', error);
    return [];
  }
}

module.exports = {
  getFileDetailsByIds,
};
