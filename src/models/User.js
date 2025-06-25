const { db } = require('./db');

class User {
  static async findById(id) {
    try {
      const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
      
      if (!user) {
        return null;
      }
      
      if (!user.status) {
        user.status = 'active';
      }
      
      return user;
    } catch (error) {
      console.error('Error finding user by ID:', error); 
      return null;
    }
  }

  static async findByUsername(username) {
    try {
      const user = await db.getAsync('SELECT * FROM users WHERE username = ?', [username]);
      return user;
    } catch (error) {
      console.error('Error finding user by username:', error); 
      return null;
    }
  }

  static async findByEmail(email) {
    try {
      const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
      return user;
    } catch (error) {
      console.error('Error finding user by email:', error); 
      return null;
    }
  }

  /**
   * Find a user by their registration token
   * @param {string} token - Registration token to find
   * @returns {Promise<Object|null>} The user if found, null otherwise
   */
  static async findByRegistrationToken(token) {
    try {
      if (!token) {
        console.error('[User.findByRegistrationToken] No token provided'); 
        return null;
      }
      
      const user = await db.getAsync(
        'SELECT * FROM users WHERE registration_token = ?',
        [token]
      );
      
      if (user) {
        return user;
      }
      
      // Fallback logic (simplified, removed verbose logging)
      const allUsers = await db.allAsync(
        "SELECT * FROM users WHERE registration_token IS NOT NULL"
      );
      const exactMatch = allUsers.find(u => u.registration_token === token);
      if (exactMatch) return exactMatch;
      
      const normalizedToken = token.trim();
      const normalizedMatch = allUsers.find(u => u.registration_token.trim() === normalizedToken);
      if (normalizedMatch) return normalizedMatch;

      console.error('[User.findByRegistrationToken] No user found with token after multiple comparison attempts'); 
      return null;
    } catch (error) {
      console.error('[User Model] Error finding user by registration token:', error); 
      return null;
    }
  }

  static async create(userData) {
    try {
      const { username, email, password, isAdmin = 0 } = userData;
      
      const result = await db.runAsync(
        'INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)',
        [username, email, password, isAdmin]
      );

      return result.lastID;
    } catch (error) {
      console.error('Error creating user:', error); 
      throw error;
    }
  }

  static async update(id, userData) {
    try {
      const { username, email, password, isAdmin } = userData;
      
      let query = 'UPDATE users SET ';
      const params = [];
      
      if (username) {
        query += 'username = ?, ';
        params.push(username);
      }
      
      if (email) {
        query += 'email = ?, ';
        params.push(email);
      }
      
      if (password) {
        query += 'password = ?, ';
        params.push(password);
      }
      
      if (isAdmin !== undefined) {
        query += 'is_admin = ?, ';
        params.push(isAdmin);
      }
      
      query += 'updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      params.push(id);
      
      const result = await db.runAsync(query, params);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user:', error); 
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await db.runAsync('DELETE FROM users WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting user:', error); 
      throw error;
    }
  }

  static async getAll(limit = 100, offset = 0, searchTerm = null) {
    try {
      let query = 'SELECT id, username, email, is_admin, status, created_at, updated_at FROM users';
      const params = [];

      if (searchTerm) {
        query += ' WHERE (username LIKE ? OR email LIKE ?)';
        const likeTerm = `%${searchTerm}%`;
        params.push(likeTerm, likeTerm);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'; 
      params.push(limit, offset);

      const users = await db.allAsync(query, params);
      return users;
    } catch (error) {
      console.error('Error getting all users:', error); 
      throw error;
    }
  }

  /**
   * Searches for users by username or email, excluding a specific user ID.
   * @param {string} query - The search term.
   * @param {number} excludeUserId - The ID of the user to exclude from results.
   * @param {number} limit - Maximum number of results to return.
   * @returns {Promise<Array<{id: number, username: string, email: string}>>}
   */
  static async searchUsers(query, excludeUserId, limit = 10) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }
    const searchTerm = `%${query.trim()}%`;
    const sql = `
      SELECT id, username, email
      FROM users
      WHERE (username LIKE ? OR email LIKE ?)
        AND id != ?
        AND status = 'active' -- Optional: Only search active users
      LIMIT ?
    `;
    try {
      const users = await db.allAsync(sql, [searchTerm, searchTerm, excludeUserId, limit]);
      return users;
    } catch (error) {
      console.error('Error searching users:', error); 
      throw new Error('Failed to search users.');
    }
  }

  /**
   * Updates the avatar path for a specific user.
   * @param {number} userId - The ID of the user to update.
   * @param {string} avatarPath - The new path to the avatar file.
   * @returns {Promise<Object|null>} The updated user object or null if update failed.
   */
  static async updateAvatar(userId, avatarPath) {
    try {
      const result = await db.runAsync(
        'UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [avatarPath, userId]
      );

      if (result.changes > 0) {
        return await User.findById(userId);
      } else {
        return null;
      }
    } catch (error) {
      console.error(`[User.updateAvatar] Error updating avatar for user ${userId}:`, error); 
      throw new Error('Failed to update user avatar.');
    }
  }


  static async count(searchTerm = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM users';
      const params = [];

      if (searchTerm) {
        query += ' WHERE (username LIKE ? OR email LIKE ?)';
        const likeTerm = `%${searchTerm}%`;
        params.push(likeTerm, likeTerm);
      }

      const result = await db.getAsync(query, params);
      return result.count;
    } catch (error) {
      console.error('Error counting users:', error); 
      throw error;
    }
  }
}

module.exports = User;
