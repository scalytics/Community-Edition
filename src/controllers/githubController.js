const axios = require('axios');
const { db } = require('../models/db');

/**
 * GitHub OAuth controller
 * Handles GitHub OAuth flow and API interactions
 */
const githubController = {
  /**
   * Exchange OAuth code for access token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async connectAccount(req, res) {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Authorization code is required'
        });
      }
      
      // Exchange code for access token
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code
        },
        {
          headers: {
            Accept: 'application/json'
          }
        }
      );
      
      if (!tokenResponse.data.access_token) {
        return res.status(400).json({
          success: false,
          message: 'Failed to obtain access token',
          error: tokenResponse.data.error_description || 'Unknown error'
        });
      }
      
      const accessToken = tokenResponse.data.access_token;
      
      // Get user info to verify the token
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${accessToken}`
        }
      });
      
      // Store token in database
      await db.runAsync(
        'INSERT OR REPLACE INTO user_github_tokens (user_id, access_token, github_username) VALUES (?, ?, ?)',
        [req.user.id, accessToken, userResponse.data.login]
      );
      
      return res.status(200).json({
        success: true,
        message: 'GitHub account connected successfully',
        username: userResponse.data.login
      });
    } catch (error) {
      console.error('GitHub connection error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to connect GitHub account',
        error: error.message
      });
    }
  },
  
  /**
   * Disconnect GitHub account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async disconnectAccount(req, res) {
    try {
      // Remove token from database
      await db.runAsync(
        'DELETE FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      return res.status(200).json({
        success: true,
        message: 'GitHub account disconnected successfully'
      });
    } catch (error) {
      console.error('GitHub disconnection error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to disconnect GitHub account',
        error: error.message
      });
    }
  },
  
  /**
   * Get GitHub connection status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getConnectionStatus(req, res) {
    try {
      const result = await db.getAsync(
        'SELECT github_username FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      return res.status(200).json({
        connected: !!result,
        username: result ? result.github_username : null
      });
    } catch (error) {
      console.error('GitHub status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get GitHub connection status',
        error: error.message
      });
    }
  },
  
  /**
   * Get user repositories
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getRepositories(req, res) {
    try {
      // Get access token from database
      const tokenResult = await db.getAsync(
        'SELECT access_token FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      if (!tokenResult) {
        return res.status(401).json({
          success: false,
          message: 'GitHub account not connected'
        });
      }
      
      // Get repositories from GitHub API
      const reposResponse = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `token ${tokenResult.access_token}`
        },
        params: {
          sort: 'updated',
          per_page: 100
        }
      });
      
      return res.status(200).json({
        success: true,
        data: reposResponse.data
      });
    } catch (error) {
      console.error('GitHub repositories error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get repositories',
        error: error.message
      });
    }
  },
  
  /**
   * Get repository content
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getRepositoryContent(req, res) {
    try {
      const { owner, repo, path = '' } = req.query;
      
      if (!owner || !repo) {
        return res.status(400).json({
          success: false,
          message: 'Owner and repo parameters are required'
        });
      }
      
      // Get access token from database
      const tokenResult = await db.getAsync(
        'SELECT access_token FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      if (!tokenResult) {
        return res.status(401).json({
          success: false,
          message: 'GitHub account not connected'
        });
      }
      
      // Get content from GitHub API
      const contentResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `token ${tokenResult.access_token}`
          }
        }
      );
      
      return res.status(200).json({
        success: true,
        data: contentResponse.data
      });
    } catch (error) {
      console.error('GitHub content error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get repository content',
        error: error.message
      });
    }
  },
  
  /**
   * Get file content
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getFileContent(req, res) {
    try {
      const { owner, repo, path } = req.query;
      
      if (!owner || !repo || !path) {
        return res.status(400).json({
          success: false,
          message: 'Owner, repo, and path parameters are required'
        });
      }
      
      // Get access token from database
      const tokenResult = await db.getAsync(
        'SELECT access_token FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      if (!tokenResult) {
        return res.status(401).json({
          success: false,
          message: 'GitHub account not connected'
        });
      }
      
      // Get file content from GitHub API
      const fileResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `token ${tokenResult.access_token}`
          }
        }
      );
      
      // GitHub API returns content as base64 encoded
      const content = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
      
      return res.status(200).json({
        success: true,
        data: {
          content,
          name: fileResponse.data.name,
          path: fileResponse.data.path,
          sha: fileResponse.data.sha,
          size: fileResponse.data.size,
          url: fileResponse.data.html_url
        }
      });
    } catch (error) {
      console.error('GitHub file content error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get file content',
        error: error.message
      });
    }
  },
  
  /**
   * Add a GitHub file to chat context
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async addFileToChatContext(req, res) {
    try {
      const { chatId } = req.params;
      const { owner, repo, path, fileName } = req.body;
      
      if (!chatId || !owner || !repo || !path) {
        return res.status(400).json({
          success: false,
          message: 'Chat ID, owner, repo, and path are required'
        });
      }
      
      // Get access token from database
      const tokenResult = await db.getAsync(
        'SELECT access_token FROM user_github_tokens WHERE user_id = ?',
        [req.user.id]
      );
      
      if (!tokenResult) {
        return res.status(401).json({
          success: false,
          message: 'GitHub account not connected'
        });
      }
      
      // Get file content from GitHub API
      const fileResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `token ${tokenResult.access_token}`
          }
        }
      );
      
      // GitHub API returns content as base64 encoded
      const content = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
      
      // Insert file into database
      const result = await db.runAsync(
        `INSERT INTO chat_github_files 
         (chat_id, user_id, repo_owner, repo_name, file_path, file_name, file_content, file_sha) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chatId,
          req.user.id,
          owner,
          repo,
          path,
          fileName || fileResponse.data.name,
          content,
          fileResponse.data.sha
        ]
      );
      
      return res.status(200).json({
        success: true,
        message: 'File added to chat context',
        fileId: result.lastID
      });
    } catch (error) {
      console.error('Add GitHub file error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to add file to chat context',
        error: error.message
      });
    }
  },
  
  /**
   * Get GitHub files added to a chat
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getChatGithubFiles(req, res) {
    try {
      const { chatId } = req.params;
      
      if (!chatId) {
        return res.status(400).json({
          success: false,
          message: 'Chat ID is required'
        });
      }
      
      // Get files from database
      const files = await db.allAsync(
        `SELECT id, repo_owner, repo_name, file_path, file_name, file_sha
         FROM chat_github_files
         WHERE chat_id = ? AND user_id = ?
         ORDER BY id DESC`,
        [chatId, req.user.id]
      );
      
      return res.status(200).json({
        success: true,
        data: files
      });
    } catch (error) {
      console.error('Get chat GitHub files error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get chat GitHub files',
        error: error.message
      });
    }
  },
  
  /**
   * Remove a GitHub file from chat context
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async removeFileFromChatContext(req, res) {
    try {
      const { chatId, fileId } = req.params;
      
      if (!chatId || !fileId) {
        return res.status(400).json({
          success: false,
          message: 'Chat ID and file ID are required'
        });
      }
      
      // Delete file from database
      await db.runAsync(
        'DELETE FROM chat_github_files WHERE id = ? AND chat_id = ? AND user_id = ?',
        [fileId, chatId, req.user.id]
      );
      
      return res.status(200).json({
        success: true,
        message: 'File removed from chat context'
      });
    } catch (error) {
      console.error('Remove GitHub file error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to remove file from chat context',
        error: error.message
      });
    }
  }
};

module.exports = githubController;
