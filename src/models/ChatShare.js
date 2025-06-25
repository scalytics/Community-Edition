/**
 * Model for managing chat shares (invitations and active shares).
 */
const { db } = require('./db');
const Chat = require('./Chat'); // Assuming Chat model exists for ownership checks

class ChatShare {
  /**
   * Creates a pending share invitation.
   * Requires the inviter to be the chat owner.
   * @param {number} chatId - The ID of the chat to share.
   * @param {number} ownerUserId - The ID of the user initiating the share (must be owner).
   * @param {number} targetUserId - The ID of the user to share with.
   * @returns {Promise<{ shareId: number }>} The ID of the newly created share record.
   * @throws {Error} If inviter is not the owner, or if share already exists.
   */
  static async addShare(chatId, ownerUserId, targetUserId) {
    // 1. Verify ownership
    const isOwner = await Chat.isOwner(chatId, ownerUserId);
    if (!isOwner) {
      throw new Error('Forbidden: Only the chat owner can share this chat.');
    }

    // 2. Check if target user is the owner (cannot share with self)
    if (ownerUserId === targetUserId) {
      throw new Error('Cannot share a chat with yourself.');
    }

    // 3. Insert pending share (UNIQUE constraint handles duplicates)
    const sql = `
      INSERT INTO chat_shares (chat_id, user_id, status, permission_level)
      VALUES (?, ?, 'pending', 'read')
    `;
    try {
      const result = await db.runAsync(sql, [chatId, targetUserId]);
      if (result.changes === 0) {
        // This might happen if the UNIQUE constraint was violated but didn't throw an error directly
        // Or if the insert simply failed silently. Let's check if it exists now.
        const existing = await db.getAsync(
          'SELECT id FROM chat_shares WHERE chat_id = ? AND user_id = ?',
          [chatId, targetUserId]
        );
        if (existing) {
          // Consider updating status back to pending if it was declined? Or just inform user?
          throw new Error('Share invitation already exists or was previously declined.');
        } else {
          throw new Error('Failed to create share invitation.');
        }
      }
      return { shareId: result.lastID };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        // More specific error for existing shares
        throw new Error('Share invitation already exists or was previously declined.');
      }
      console.error('Error adding chat share:', error);
      throw new Error('Failed to create share invitation.');
    }
  }

  /**
   * Removes a share (active or pending).
   * Requires the remover to be the chat owner.
   * @param {number} chatId - The ID of the chat.
   * @param {number} ownerUserId - The ID of the user initiating removal (must be owner).
   * @param {number} targetUserId - The ID of the user whose share is being removed.
   * @returns {Promise<{ changes: number }>} Number of rows affected (should be 1 or 0).
   * @throws {Error} If remover is not the owner.
   */
  static async removeShare(chatId, ownerUserId, targetUserId) {
    // 1. Verify ownership
    const isOwner = await Chat.isOwner(chatId, ownerUserId);
    if (!isOwner) {
      throw new Error('Forbidden: Only the chat owner can remove shares.');
    }

    // 2. Delete the share record
    const sql = 'DELETE FROM chat_shares WHERE chat_id = ? AND user_id = ?';
    try {
      const result = await db.runAsync(sql, [chatId, targetUserId]);
      return { changes: result.changes };
    } catch (error) {
      console.error('Error removing chat share:', error);
      throw new Error('Failed to remove chat share.');
    }
  }

  /**
   * Gets users with whom a chat is actively shared.
   * Requires the requester to be the chat owner.
   * @param {number} chatId - The ID of the chat.
   * @param {number} ownerUserId - The ID of the user requesting the list (must be owner).
   * @returns {Promise<Array<{id: number, username: string, email: string, status: string}>>} List of users.
   * @throws {Error} If requester is not the owner.
   */
  static async getSharedUsers(chatId, ownerUserId) {
    // 1. Verify ownership
    const isOwner = await Chat.isOwner(chatId, ownerUserId);
    if (!isOwner) {
      throw new Error('Forbidden: Only the chat owner can view shares.');
    }

    // 2. Fetch users with active or pending shares for this chat
    const sql = `
      SELECT u.id, u.username, u.email, cs.status
      FROM chat_shares cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.chat_id = ? AND cs.status IN ('active', 'pending')
    `;
    try {
      return await db.allAsync(sql, [chatId]);
    } catch (error) {
      console.error('Error getting shared users:', error);
      throw new Error('Failed to retrieve shared users.');
    }
  }

  /**
   * Checks if a specific user has active read access to a chat via sharing.
   * @param {number} chatId - The ID of the chat.
   * @param {number} userId - The ID of the user checking access.
   * @returns {Promise<boolean>} True if the user has active shared access, false otherwise.
   */
  static async isSharedWithUser(chatId, userId) {
    const sql = `
      SELECT 1
      FROM chat_shares
      WHERE chat_id = ? AND user_id = ? AND status = 'active' AND permission_level = 'read'
      LIMIT 1
    `;
    try {
      const row = await db.getAsync(sql, [chatId, userId]);
      return !!row; // Convert row presence to boolean
    } catch (error) {
      console.error('Error checking if chat is shared with user:', error);
      // Default to false on error to be safe
      return false;
    }
  }

  /**
   * Gets chats that are actively shared with a specific user.
   * @param {number} userId - The ID of the user.
   * @returns {Promise<Array<object>>} List of chat objects shared with the user.
   */
  static async getChatsSharedWithUser(userId) {
    // Needs to join chat_shares with chats table
    // Select relevant chat details (id, title, etc.) and model status
    const sql = `
      SELECT c.id, c.title, c.created_at, c.updated_at, c.user_id as owner_id, u_owner.username as owner_username,
             m.is_active as model_is_active -- Include model status
      FROM chat_shares cs
      JOIN chats c ON cs.chat_id = c.id
      LEFT JOIN models m ON c.model_id = m.id -- Left join to include chats with NULL model_id
      JOIN users u_owner ON c.user_id = u_owner.id
      WHERE cs.user_id = ? AND cs.status = 'active'
      ORDER BY c.updated_at DESC
    `;
    try {
      return await db.allAsync(sql, [userId]);
    } catch (error) {
      console.error('Error getting chats shared with user:', error);
      throw new Error('Failed to retrieve shared chats.');
    }
  }

  /**
   * Gets pending share invitations for a specific user.
   * @param {number} userId - The ID of the user.
   * @returns {Promise<Array<object>>} List of pending share objects including chat and owner details.
   */
  static async getPendingSharesForUser(userId) {
    const sql = `
      SELECT cs.id as share_id, cs.chat_id, cs.created_at as shared_at,
             c.title as chat_title, c.user_id as owner_id, -- Use c.title instead of c.name
             u_owner.username as owner_username
      FROM chat_shares cs
      JOIN chats c ON cs.chat_id = c.id
      JOIN users u_owner ON c.user_id = u_owner.id
      WHERE cs.user_id = ? AND cs.status = 'pending'
      ORDER BY cs.created_at DESC
    `;
    try {
      return await db.allAsync(sql, [userId]);
    } catch (error) {
      console.error('Error getting pending shares for user:', error);
      throw new Error('Failed to retrieve pending shares.');
    }
  }

  /**
   * Accepts a pending share invitation.
   * Requires the accepter to be the intended recipient.
   * @param {number} shareId - The ID of the chat_shares record.
   * @param {number} recipientUserId - The ID of the user accepting the share.
   * @returns {Promise<{ changes: number }>} Number of rows affected (should be 1).
   * @throws {Error} If share not found, not pending, or recipient mismatch.
   */
  static async acceptShare(shareId, recipientUserId) {
    const sql = `
      UPDATE chat_shares
      SET status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `;
    try {
      const result = await db.runAsync(sql, [shareId, recipientUserId]);
      if (result.changes === 0) {
        // Check why it failed
        const share = await db.getAsync('SELECT user_id, status FROM chat_shares WHERE id = ?', [shareId]);
        if (!share) throw new Error('Share invitation not found.');
        if (share.user_id !== recipientUserId) throw new Error('Forbidden: You are not the recipient of this invitation.');
        if (share.status !== 'pending') throw new Error(`Cannot accept share with status: ${share.status}`);
        throw new Error('Failed to accept share invitation.'); // Generic fallback
      }
      return { changes: result.changes };
    } catch (error) {
      console.error('Error accepting chat share:', error);
      // Re-throw specific errors or a generic one
      throw error instanceof Error ? error : new Error('Failed to accept share invitation.');
    }
  }

  /**
   * Declines a pending share invitation.
   * Requires the decliner to be the intended recipient.
   * @param {number} shareId - The ID of the chat_shares record.
   * @param {number} recipientUserId - The ID of the user declining the share.
   * @returns {Promise<{ changes: number }>} Number of rows affected (should be 1).
   * @throws {Error} If share not found, not pending, or recipient mismatch.
   */
  static async declineShare(shareId, recipientUserId) {
    // Option 1: Update status to 'declined'
    const sql = `
      UPDATE chat_shares
      SET status = 'declined', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `;
    // Option 2: Delete the record (simpler, less history)
    // const sql = 'DELETE FROM chat_shares WHERE id = ? AND user_id = ? AND status = 'pending'';

    try {
      const result = await db.runAsync(sql, [shareId, recipientUserId]);
       if (result.changes === 0) {
        // Check why it failed
        const share = await db.getAsync('SELECT user_id, status FROM chat_shares WHERE id = ?', [shareId]);
        if (!share) throw new Error('Share invitation not found.');
        if (share.user_id !== recipientUserId) throw new Error('Forbidden: You are not the recipient of this invitation.');
        if (share.status !== 'pending') throw new Error(`Cannot decline share with status: ${share.status}`);
        throw new Error('Failed to decline share invitation.'); // Generic fallback
      }
      return { changes: result.changes };
    } catch (error) {
      console.error('Error declining chat share:', error);
      // Re-throw specific errors or a generic one
      throw error instanceof Error ? error : new Error('Failed to decline share invitation.');
    }
  }
}

module.exports = ChatShare;
