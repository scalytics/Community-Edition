const { db } = require('./db');
const eventBus = require('../utils/eventBus'); // Import eventBus

class Chat {
  static async findById(id) {
    try {
      // Ensure we only fetch non-archived chats unless specifically requested otherwise (e.g., by an admin function)
      const chat = await db.getAsync('SELECT * FROM chats WHERE id = ? AND is_archived = FALSE', [id]);
      return chat;
    } catch (error) {
      console.error('Error finding chat by ID:', error);
      return null;
    }
  }

  static async findByUser(userId, limit = 100, offset = 0) {
    try {
      // Join with models table and check is_active status
      const chats = await db.allAsync(
        `SELECT c.*, m.name as model_name, m.is_active as model_is_active,
        (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
        FROM chats c
        LEFT JOIN models m ON c.model_id = m.id -- Left join to include chats with NULL model_id
        WHERE c.user_id = ? AND c.is_archived = FALSE
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
      return chats;
    } catch (error) {
      console.error('Error finding chats by user:', error);
      throw error;
    }
  }

  static async create(chatData) {
    try {
      const { userId, modelId, title } = chatData;
      
      const result = await db.runAsync(
        'INSERT INTO chats (user_id, model_id, title, is_archived) VALUES (?, ?, ?, FALSE)', // Ensure new chats are not archived
        [userId, modelId, title]
      );

      return result.lastID;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  static async update(id, chatData) {
    try {
      const { title, is_archived, archived_at } = chatData;
      
      let query = 'UPDATE chats SET updated_at = CURRENT_TIMESTAMP';
      const params = [];
      
      if (title !== undefined) {
        query += ', title = ?';
        params.push(title);
      }
      if (is_archived !== undefined) {
        query += ', is_archived = ?';
        params.push(is_archived);
      }
      if (archived_at !== undefined) {
        query += ', archived_at = ?';
        params.push(archived_at);
      }
      
      query += ' WHERE id = ?';
      params.push(id);
      
      const result = await db.runAsync(query, params);

      if (result.changes > 0 && title !== undefined) {
        eventBus.publish('chat:title_updated', { chatId: id, newTitle: title });
      }
      // Add event for archival status change if needed in future
      // if (result.changes > 0 && is_archived !== undefined) {
      //   eventBus.publish('chat:archival_status_updated', { chatId: id, is_archived });
      // }

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating chat:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await db.runAsync('DELETE FROM chats WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }

  static async count(userId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM chats WHERE is_archived = FALSE';
      const params = [];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      const result = await db.getAsync(query, params);
      return result.count;
    } catch (error) {
      console.error('Error counting chats:', error);
      throw error;
    }
  }

  /**
   * Checks if a given user ID is the owner of a specific chat.
   * @param {number} chatId - The ID of the chat.
   * @param {number} userId - The ID of the user to check.
   * @returns {Promise<boolean>} True if the user owns the chat, false otherwise.
   */
  static async isOwner(chatId, userId) {
    try {
      // Check ownership even if archived, as admin might need to know
      const chat = await db.getAsync('SELECT user_id FROM chats WHERE id = ?', [chatId]);
      return chat ? chat.user_id === userId : false;
    } catch (error) {
      console.error('Error checking chat ownership:', error);
      return false; // Default to false on error for safety
    }
  }
}

module.exports = Chat;
