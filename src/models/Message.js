const { db } = require('./db');
const eventBus = require('../utils/eventBus'); 

class Message {
  static async findById(id) {
    try {
      const message = await db.getAsync('SELECT *, isLoading FROM messages WHERE id = ?', [id]);
      return message;
    } catch (error) {
      console.error('Error finding message by ID:', error);
      return null;
    }
  }

  static async findByChatId(chatId, excludeLoading = false) {
    try {
      // Ensure we only fetch messages from non-archived chats
      // This requires joining with the chats table
      let query = `
        SELECT m.*, m.isLoading 
        FROM messages m
        JOIN chats c ON m.chat_id = c.id
        WHERE m.chat_id = ? AND c.is_archived = FALSE
      `;
      const params = [chatId];

      if (excludeLoading) {
        query += ' AND m.isLoading = 0';
      }

      query += ' ORDER BY m.created_at ASC';

      const messages = await db.allAsync(query, params);
      return messages;
    } catch (error) {
      console.error('Error finding messages by chat ID:', error);
      throw error;
    }
  }

  static async create(messageData) {
    try {
      const { 
        chat_id: chatId, 
        // user_id is not in the schema, cannot be inserted directly
        role, 
        content, 
        tokens = 0,
        // sort_order is not in the schema, order by created_at
        // isLoading is not in the schema
        mcp_metadata: mcpMetadata = null,
        mcp_permissions: mcpPermissions = null
      } = messageData;
      
      const query = `
        INSERT INTO messages 
          (chat_id, role, content, tokens, mcp_metadata, mcp_permissions) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = [
        chatId, 
        role, 
        content, 
        tokens, 
        mcpMetadata ? JSON.stringify(mcpMetadata) : null, 
        mcpPermissions ? JSON.stringify(mcpPermissions) : null
      ];
      
      const result = await db.runAsync(query, params);
      const newMessageId = result.lastID;

      // Emit an event after successful creation so frontend can update
      if (newMessageId) {
          const newMessage = await this.findById(newMessageId);
          if (newMessage) {
              eventBus.publish('chat:message_created', newMessage);
          }
      }

      return newMessageId;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  static async updateTokens(id, tokens) {
    try {
      const result = await db.runAsync(
        'UPDATE messages SET tokens = ? WHERE id = ?',
        [tokens, id]
      );
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating message tokens:', error);
      throw error;
    }
  }
  
  /**
   * Update a message's content
   * @param {number|string} id - Message ID
   * @param {Object} data - Data to update (e.g., { content: "new content" })
   * @returns {Promise<boolean>} - Success status
   */
  static async update(id, data) {
    try {
      if (!id) {
        throw new Error('Message ID is required');
      }
      
      // Extract fields to update
      const fields = [];
      const values = [];
      
      // Handle content updates
      if (data.content !== undefined) {
        fields.push('content = ?');
        values.push(data.content);
      }
      
      // Handle isLoading updates
      if (data.isLoading !== undefined) {
        fields.push('isLoading = ?');
        values.push(data.isLoading ? 1 : 0); 
      }
      
      // No fields to update
      if (fields.length === 0) {
        console.warn('No fields to update for message:', id);
        return false;
      }
      
      values.push(id);
      
      const query = `UPDATE messages SET ${fields.join(', ')} WHERE id = ?`;

      const result = await db.runAsync(query, values);
      
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating message:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  static async deleteByChatId(chatId) {
    try {
      const result = await db.runAsync('DELETE FROM messages WHERE chat_id = ?', [chatId]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting messages by chat ID:', error);
      throw error;
    }
  }

  static async count(chatId = null) {
    try {
      let query = `
        SELECT COUNT(m.id) as count 
        FROM messages m
        JOIN chats c ON m.chat_id = c.id
        WHERE c.is_archived = FALSE
      `;
      const params = [];
      
      if (chatId) {
        query += ' AND m.chat_id = ?';
        params.push(chatId);
      }
      
      const result = await db.getAsync(query, params);
      return result.count;
    } catch (error) {
      console.error('Error counting messages:', error);
      throw error;
    }
  }
}

module.exports = Message;
