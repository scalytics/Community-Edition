const axios = require('axios'); 
const { db } = require('../models/db');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Model = require('../models/Model');
const UsageStatsService = require('../services/usageStatsService'); 
const { createChatCompletion } = require('../services/chatService');
const fileProcessingService = require('../services/fileProcessingService');
const { validateContextForModel } = require('../models/prompting');
const { applyFilters } = require('../services/responseFilteringService');
const fs = require('fs').promises;
const path = require('path');
const summarizationService = require('../services/summarizationService'); 
const User = require('../models/User'); 
const eventBus = require('../utils/eventBus'); 

exports.getChats = async (req, res) => {
  try {
    const chats = await db.allAsync(`
      SELECT
        c.*,
        CASE WHEN EXISTS (SELECT 1 FROM chat_shares cs WHERE cs.chat_id = c.id AND cs.status = 'accepted')
             THEN 1
             ELSE 0
        END as is_shared
      FROM chats c
      WHERE c.user_id = ? AND (c.is_archived IS NULL OR c.is_archived = 0) -- Filter out archived chats
      ORDER BY c.updated_at DESC
    `, [req.user.id]);

    res.status(200).json({
      success: true, 
      count: chats.length,
      data: chats
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chats'
    });
  }
};

exports.getMonthlyTokenUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await UsageStatsService.getMonthlyTokenUsage(userId);

    if (usage === null) {
      return res.status(500).json({
        success: false,
        message: 'Error retrieving monthly token usage.'
      });
    }

    res.status(200).json({
      success: true,
      data: usage 
    });

  } catch (error) {
    console.error('[ChatCtrl /usage/monthly] Error retrieving monthly token usage:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving monthly token usage.'
    });
  }
};

exports.summarizeChatHistory = async (req, res) => {
  try {
    const chatId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const chat = await Chat.findById(chatId);
    if (!chat || (chat.is_archived && !req.user.is_admin)) { 
      return res.status(404).json({ success: false, message: 'Chat not found.' });
    }
    if (chat.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to summarize this chat.' });
    }

    const messages = await Message.findByChatId(chatId);
    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Chat has no messages to summarize.' });
    }

    const user = await User.findById(userId); 
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const tempSummarizedHistory = await summarizationService.summarizeHistory(
      messages,
      user.summarization_model_id, 
      chat.model_id,                
      user.summarization_temperature_preset, 
      userId
    );

    let summaryContent = null;
    const summaryMessageObject = tempSummarizedHistory.find(
      msg => msg.role === 'system' && msg.content && msg.content.startsWith('Summary of earlier conversation:')
    );

    if (summaryMessageObject) {
      summaryContent = summaryMessageObject.content.replace('Summary of earlier conversation:\n', '').trim();
    }

    if (!summaryContent) {
      console.error(`[ChatCtrl /sum] Summarization service did not return a usable summary for chat ${chatId}.`);
      return res.status(500).json({ success: false, message: 'Failed to generate summary content.' });
    }

    // Check if summarization actually changed the history
    // (summarizationService returns original messages on failure or if no summary needed)
    if (tempSummarizedHistory === messages || tempSummarizedHistory.length === messages.length) {
      // This simple check might not be robust enough if message objects are different but content is same.
      // A more robust check would compare content or if a summary message is actually present.
      // For now, if the service intended to do nothing, we assume it returned the original array.
      const actualSummaryMessageInNewHistory = tempSummarizedHistory.find(
        msg => msg.role === 'system' && msg.content && msg.content.startsWith('Summary of earlier conversation:')
      );

      if (!actualSummaryMessageInNewHistory) {
        return res.status(200).json({ success: true, message: 'Summarization did not alter chat history (e.g., history too short or summarization failed internally).', no_change: true });
      }
    }
    
    const originalTokenCount = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);

    await Message.deleteByChatId(chatId); 

    let newHistoryTokenCount = 0;
    let currentSortOrder = 0;
    for (const msg of tempSummarizedHistory) {
      const msgTokens = msg.tokens || 0;
      newHistoryTokenCount += msgTokens;
      await Message.create({
        chat_id: chatId,
        user_id: msg.user_id || null, 
        role: msg.role,
        content: msg.content,
        tokens: msgTokens,
        mcp_metadata: msg.mcp_metadata || null, 
        mcp_permissions: msg.mcp_permissions || null, 
        isLoading: false, 
        sort_order: currentSortOrder++,
      });
    }

    const tokensSaved = originalTokenCount - newHistoryTokenCount;
    let notificationMessageContent = 'Chat history has been successfully summarized and replaced.';

    if (tokensSaved > 0) {
      notificationMessageContent += ` Saved approximately ${tokensSaved} tokens.`;
      await Message.create({
        chat_id: chatId,
        user_id: null,
        role: 'system',
        content: notificationMessageContent,
        tokens: 0,
        sort_order: currentSortOrder++, 
        isLoading: false,
      });
    }
    
    await Chat.update(chatId, { updated_at: new Date().toISOString() });

    eventBus.publish('chat:updated', { chatId }); 

    res.status(200).json({
      success: true,
      message: notificationMessageContent 
    });

  } catch (error) {
    console.error(`[ChatCtrl /sum] Error summarizing chat history for chat ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: `Error summarizing chat: ${error.message || 'Internal server error'}`
    });
  }
};

exports.getSharedWithMeChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const sharedChats = await db.allAsync(`
      SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        c.model_id,
        cs.created_at as shared_at,
        u_owner.username as owner_username
      FROM chat_shares cs
      JOIN chats c ON cs.chat_id = c.id
      JOIN users u_owner ON c.user_id = u_owner.id
      WHERE cs.user_id = ? AND cs.status = 'accepted' 
      AND (c.is_archived IS NULL OR c.is_archived = 0) -- Also filter archived chats here
      ORDER BY cs.created_at DESC 
    `, [userId]);

    res.status(200).json({
      success: true,
      count: sharedChats.length,
      data: sharedChats
    });
  } catch (error) {
    console.error('Get shared chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shared chats'
    });
  }
};

exports.getChat = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    if (chat.is_archived && !req.user.is_admin) {
        return res.status(404).json({
            success: false,
            message: 'Chat not found' 
        });
    }

    const isOwner = chat.user_id === req.user.id;
    let isSharedWithUser = false;
    if (!isOwner && !req.user.is_admin) {
      const shareRecord = await db.getAsync(
        'SELECT status FROM chat_shares WHERE chat_id = ? AND user_id = ?',
        [chat.id, req.user.id]
      );
      isSharedWithUser = shareRecord?.status === 'accepted';
    }

    if (!isOwner && !req.user.is_admin && !isSharedWithUser) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this chat'
      });
    }

    let messages = await Message.findByChatId(chat.id);

    for (const message of messages) {
      message.files = await getFilesForMessage(message.id);
    }

    const model = await Model.findById(chat.model_id);
    let effectiveSystemPrompt = ''; 

    let is_shared_by_owner = false;
    if (isOwner) {
      try {
        const shareCount = await db.getAsync(
          "SELECT COUNT(*) as count FROM chat_shares WHERE chat_id = ? AND status = 'accepted'",
          [chat.id]
        );
        is_shared_by_owner = shareCount.count > 0;
      } catch (shareCheckError) {
        console.error(`Error checking share status for chat ${chat.id}:`, shareCheckError);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...chat,
        is_shared_by_owner, 
        is_viewing_shared: !isOwner && isSharedWithUser, 
        model: model ? { id: model.id, name: model.name } : null,
        messages,
        effectiveSystemPrompt
      }
    });

  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat'
    });
  }
};


// --- Chat Sharing Routes (Owner Actions) ---

// Invite a user to share a chat
exports.createShareInvitation = async (req, res) => {
  try {
    const chatId = req.params.id;
    const ownerUserId = req.user.id;
    const { shared_with_user_id } = req.body; 

    if (!shared_with_user_id) {
      return res.status(400).json({ success: false, message: 'User ID to share with is required.' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found.' });
    }
    if (chat.is_archived) { 
        return res.status(400).json({ success: false, message: 'Cannot share an archived chat.' });
    }
    if (chat.user_id !== ownerUserId) {
      return res.status(403).json({ success: false, message: 'Only the chat owner can share it.' });
    }

    const sharedUser = await db.getAsync('SELECT id FROM users WHERE id = ?', [shared_with_user_id]);
    if (!sharedUser) {
      return res.status(404).json({ success: false, message: 'User to share with not found.' });
    }

    if (ownerUserId === shared_with_user_id) {
      return res.status(400).json({ success: false, message: 'Cannot share a chat with yourself.' });
    }

    const existingShare = await db.getAsync(
      'SELECT * FROM chat_shares WHERE chat_id = ? AND user_id = ?', 
      [chatId, shared_with_user_id]
    );

    if (existingShare) {
      const statusMessage = existingShare.status === 'pending' ? 'invitation is already pending' : 'chat is already shared';
      return res.status(409).json({ success: false, message: `Cannot share: ${statusMessage} with this user.` });
    }

    const result = await db.runAsync(
      'INSERT INTO chat_shares (chat_id, owner_user_id, user_id, status) VALUES (?, ?, ?, ?)', 
      [chatId, ownerUserId, shared_with_user_id, 'pending']
    );

    const newShare = await db.getAsync('SELECT * FROM chat_shares WHERE id = ?', [result.lastID]);

    res.status(201).json({ success: true, message: 'Share invitation sent successfully.', data: newShare });

  } catch (error) {
    console.error('Error creating share invitation:', error);
    res.status(500).json({ success: false, message: 'Error creating share invitation.' });
  }
};

// Get list of users a chat is shared with (owner view)
exports.getChatShares = async (req, res) => {
   try {
    const chatId = req.params.id;
    const ownerUserId = req.user.id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found.' });
    }
    if (chat.user_id !== ownerUserId) {
      return res.status(403).json({ success: false, message: 'Only the chat owner can view shares.' });
    }

    const shares = await db.allAsync(`
      SELECT
        cs.id,                          
        cs.user_id as shared_with_user_id, 
        cs.status,
        cs.created_at as shared_at,
        u.username as username,         
        u.email as email                
      FROM chat_shares cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.chat_id = ?
      ORDER BY cs.created_at DESC
    `, [chatId]);

    res.status(200).json({ success: true, data: shares });

  } catch (error) {
    console.error('Error getting chat shares:', error);
    res.status(500).json({ success: false, message: 'Error fetching chat shares.' });
  }
};

// Remove a user's access to a shared chat (owner action)
exports.removeShare = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userIdToRemove = req.params.userId;
    const ownerUserId = req.user.id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found.' });
    }
    if (chat.user_id !== ownerUserId) {
      return res.status(403).json({ success: false, message: 'Only the chat owner can remove shares.' });
    }

    const result = await db.runAsync(
      'DELETE FROM chat_shares WHERE chat_id = ? AND user_id = ?', 
      [chatId, userIdToRemove]
    );

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Share record not found for this user and chat.' });
    }

    res.status(200).json({ success: true, message: 'Share access removed successfully.' });

  } catch (error) {
    console.error('Error removing share access:', error);
    res.status(500).json({ success: false, message: 'Error removing share access.' });
  }
};

// --- Chat Sharing Routes (Recipient Actions) --- ADDED ---

// Get pending share invitations for the logged-in user
exports.getPendingShares = async (req, res) => {
  try {
    const userId = req.user.id;
    const pendingShares = await db.allAsync(`
      SELECT cs.id as share_id, cs.chat_id, cs.created_at as shared_at, c.title as chat_title, u_owner.username as owner_username
      FROM chat_shares cs
      JOIN chats c ON cs.chat_id = c.id
      JOIN users u_owner ON cs.owner_user_id = u_owner.id
      WHERE cs.user_id = ? AND cs.status = 'pending' 
      AND (c.is_archived IS NULL OR c.is_archived = 0) -- Don't show pending for archived chats
      ORDER BY cs.created_at DESC 
    `, [userId]);

    res.status(200).json({ success: true, data: pendingShares });
  } catch (error) {
    console.error('Error fetching pending shares:', error);
    res.status(500).json({ success: false, message: 'Error fetching pending shares.' });
  }
};

// Accept a share invitation
exports.acceptShare = async (req, res) => {
  try {
    const shareId = req.params.shareId;
    const userId = req.user.id;

    const share = await db.getAsync('SELECT * FROM chat_shares WHERE id = ? AND user_id = ?', [shareId, userId]); 
    if (!share) {
      return res.status(404).json({ success: false, message: 'Share invitation not found or not intended for you.' });
    }
    if (share.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This invitation is no longer pending.' });
    }
    
    const chat = await Chat.findById(share.chat_id);
    if (!chat || chat.is_archived) { // Prevent accepting share for archived chats
        return res.status(400).json({ success: false, message: 'Cannot accept invitation for an archived or non-existent chat.' });
    }

    await db.runAsync('UPDATE chat_shares SET status = ? WHERE id = ?', ['accepted', shareId]);

    try {
      const chatDetails = await db.getAsync(`
        SELECT c.id as chatId, c.title as chatTitle, u.username as ownerUsername
        FROM chats c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `, [share.chat_id]);

      if (chatDetails) {
        const eventBus = require('../utils/eventBus'); 
        eventBus.publish('chat:share_accepted', {
          recipientUserId: userId, 
          chatId: chatDetails.chatId,
          chatTitle: chatDetails.chatTitle,
          ownerUsername: chatDetails.ownerUsername
        });
      } else {
         console.warn(`[acceptShare] Could not fetch chat details for chat ID ${share.chat_id} after accepting share ${shareId}. Notification not sent.`);
      }
    } catch (notifyError) {
      console.error(`[acceptShare] Error emitting chat:share_accepted event for user ${userId}, share ${shareId}:`, notifyError);
    }

    res.status(200).json({ success: true, message: 'Share invitation accepted.' });
  } catch (error) {
    console.error('Error accepting share:', error);
    res.status(500).json({ success: false, message: 'Error accepting share invitation.' });
  }
};

// Decline or cancel a share invitation
exports.declineShare = async (req, res) => {
  try {
    const shareId = req.params.shareId;
    const userId = req.user.id;

    const share = await db.getAsync('SELECT * FROM chat_shares WHERE id = ? AND user_id = ?', [shareId, userId]); 
    if (!share) {
      return res.status(404).json({ success: false, message: 'Share invitation not found or not intended for you.' });
    }
    if (share.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This invitation is no longer pending.' });
    }

    await db.runAsync('DELETE FROM chat_shares WHERE id = ?', [shareId]);

    res.status(200).json({ success: true, message: 'Share invitation declined/cancelled.' });
  } catch (error) {
    console.error('Error declining share:', error);
    res.status(500).json({ success: false, message: 'Error declining share invitation.' });
  }
};


// Create new chat
exports.createChat = async (req, res) => {
  try {
    const { modelId, title, initialMessage, files } = req.body;

    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide modelId'
      });
    }

    let accessibleModels = [];

    try {
      if (typeof Model.getActiveForUser === 'function') {
        accessibleModels = await Model.getActiveForUser(req.user.id);
      } else {
        console.error('Error in createChat: Model.getActiveForUser is not a function - using fallback');

        if (req.user.is_admin) {
          accessibleModels = await db.allAsync(`
            SELECT m.*, p.name as provider_name, p.id as provider_id
            FROM models m
            LEFT JOIN api_providers p ON m.external_provider_id = p.id
            WHERE m.is_active = 1
          `);
        } else {
          accessibleModels = await db.allAsync(`
            SELECT DISTINCT m.*, p.name as provider_name, p.id as provider_id
            FROM models m
            LEFT JOIN api_providers p ON m.external_provider_id = p.id
            JOIN group_model_access gma ON m.id = gma.model_id
            JOIN user_groups ug ON gma.group_id = ug.group_id
            WHERE ug.user_id = ?
            AND gma.can_access = 1
            AND m.is_active = 1
          `, [req.user.id]);
        }

        accessibleModels.forEach(model => {
          model.can_use = true;
        });
      }
    } catch (error) {
      console.error('Error checking model access:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking model access: ' + (error.message || 'Unknown error')
      });
    }

    const userModel = accessibleModels.find(m => m.id === Number(modelId));

    if (!userModel) {
      return res.status(404).json({
        success: false,
        message: 'Model not found or not available to you'
      });
    }

    if (!userModel.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This model is currently inactive'
      });
    }

    if (userModel.external_provider_id && userModel.can_use === false) {
      let message = 'You do not have access to this model';

      if (!userModel.has_user_key && !userModel.has_system_key) {
        message = `No valid API key available for ${userModel.provider_name}`;
      } else if (userModel.has_user_key && !userModel.has_system_key) {
        message = `Your ${userModel.provider_name} API key is no longer valid`;
      } else if (!userModel.has_user_key && userModel.has_system_key) {
        message = `System API key for ${userModel.provider_name} is not available`;
      }

      return res.status(403).json({
        success: false,
        message
      });
    }

    let finalChatTitle = title;
    if (!finalChatTitle && initialMessage) {
      finalChatTitle = initialMessage;
    } else if (!finalChatTitle) {
      finalChatTitle = 'New Chat';
    }

    const chatId = await Chat.create({
      userId: req.user.id,
      modelId,
      title: finalChatTitle 
    });

    const newChat = await Chat.findById(chatId);

    if (initialMessage) {
      const userMessageId = await Message.create({
        chatId,
        role: 'user',
        content: initialMessage
      });
      if (files && files.length > 0) {
        for (const fileId of files) {
          await associateFileWithMessage(userMessageId, fileId);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Chat created successfully',
      data: newChat
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating chat'
    });
  }
};

exports.updateChat = async (req, res) => {
  try {
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title'
      });
    }

    const chat = await Chat.findById(req.params.id);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    if (chat.is_archived && !req.user.is_admin) { 
        return res.status(403).json({ success: false, message: 'Cannot update an archived chat.' });
    }

    if (chat.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this chat'
      });
    }

    const updated = await Chat.update(req.params.id, { title });

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'Chat not updated'
      });
    }

    const updatedChat = await Chat.findById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Chat updated successfully',
      data: updatedChat
    });
  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating chat'
    });
  }
};

exports.deleteChat = async (req, res) => {
  const { getSystemSetting } = require('../config/systemConfig'); 
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (chat.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this chat'
      });
    }

    const chatIdToDelete = req.params.id;

    try {
      const pythonServiceBaseUrl = getSystemSetting('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');
      if (pythonServiceBaseUrl && pythonServiceBaseUrl.startsWith('http')) {
        const deleteVectorDocsUrl = `${pythonServiceBaseUrl}/vector/delete_by_group`;
        await axios.post(deleteVectorDocsUrl, { group_id: chatIdToDelete.toString() });
        console.log(`[ChatCtrl Delete] Successfully requested deletion of vector documents for chat group ${chatIdToDelete} from Python service.`);
      } else {
        console.warn(`[ChatCtrl Delete] Python service URL is not configured or invalid. Skipping vector document deletion for chat ${chatIdToDelete}. URL: '${pythonServiceBaseUrl}'`);
      }
    } catch (vectorDeleteError) {
      console.error(`[ChatCtrl Delete] Error requesting vector document deletion for chat group ${chatIdToDelete} from Python service:`, vectorDeleteError.response ? vectorDeleteError.response.data : vectorDeleteError.message);
      }

    const archiveEnabled = getSystemSetting('archive_deleted_chats_for_refinement', '0') === 'true';

    if (archiveEnabled) {
      const archived = await Chat.update(chatIdToDelete, {
        is_archived: true,
        archived_at: new Date().toISOString()
      });

      if (!archived) {
        return res.status(400).json({
          success: false,
          message: 'Chat not archived'
        });
      }
      res.status(200).json({
        success: true,
        message: 'Chat archived successfully'
      });

    } else {
      const deleted = await Chat.delete(chatIdToDelete); 

      if (!deleted) {
        return res.status(400).json({
          success: false,
          message: 'Chat not deleted'
        });
      }
      res.status(200).json({
        success: true,
        message: 'Chat deleted successfully'
      });
    }
  } catch (error) {
    console.error('[ChatCtrl Delete] Delete chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat'
    });
  }
};

// Send message and get response
exports.sendMessage = async (req, res) => {
  const eventBus = require('../utils/eventBus');
  try {
    const { content, files, isImagePrompt = false } = req.body; // Add isImagePrompt
    const chatId = req.params.id;

    if (!content && (!files || files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message content or attach files'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    if (chat.is_archived) { 
        return res.status(403).json({ success: false, message: 'Cannot send messages to an archived chat.' });
    }

    const isOwner = chat.user_id === req.user.id;
    let isSharedWithUser = false;
    if (!isOwner) {
      const shareRecord = await db.getAsync(
        'SELECT status FROM chat_shares WHERE chat_id = ? AND user_id = ?', 
        [chatId, req.user.id]
      );
      isSharedWithUser = shareRecord?.status === 'accepted';
    }

    if (!isOwner && !isSharedWithUser) { 
       return res.status(403).json({ success: false, message: 'Not authorized to send messages to this chat.' });
    }

    let accessibleModels = [];

    try {
      if (typeof Model.getActiveForUser === 'function') {
        accessibleModels = await Model.getActiveForUser(req.user.id);
      } else {
        console.error('Error in sendMessage: Model.getActiveForUser is not a function - using fallback');

        if (req.user.is_admin) {
          accessibleModels = await db.allAsync(`
            SELECT m.*, p.name as provider_name, p.id as provider_id
            FROM models m
            LEFT JOIN api_providers p ON m.external_provider_id = p.id
            WHERE m.is_active = 1
          `);
        } else {
          accessibleModels = await db.allAsync(`
            SELECT DISTINCT m.*, p.name as provider_name, p.id as provider_id
            FROM models m
            LEFT JOIN api_providers p ON m.external_provider_id = p.id
            JOIN group_model_access gma ON m.id = gma.model_id
            JOIN user_groups ug ON gma.group_id = ug.group_id
            WHERE ug.user_id = ?
            AND gma.can_access = 1
            AND m.is_active = 1
          `, [req.user.id]);
        }

        accessibleModels.forEach(model => {
          model.can_use = true;
        });
      }
    } catch (error) {
      console.error('Error checking model access in sendMessage:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking model access: ' + (error.message || 'Unknown error')
      });
    }

    const userModel = accessibleModels.find(m => m.id === Number(chat.model_id));

    if (!userModel) {
      return res.status(404).json({
        success: false,
        message: 'The model associated with this chat is no longer available to you'
      });
    }

    if (!userModel.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This model is currently inactive'
      });
    }

    if (userModel.external_provider_id && userModel.can_use === false) {
      let message = 'You do not have access to this model';

      if (!userModel.has_user_key && !userModel.has_system_key) {
        message = `No valid API key available for ${userModel.provider_name}`;
      } else if (userModel.has_user_key && !userModel.has_system_key) {
        message = `Your ${userModel.provider_name} API key is no longer valid`;
      } else if (!userModel.has_user_key && userModel.has_system_key) {
        message = `System API key for ${userModel.provider_name} is not available`;
      }

      return res.status(403).json({
        success: false,
        message
      });
    }

    let previousMessages = await Message.findByChatId(chatId, true); 

    const userMessageId = await Message.create({
      chat_id: chatId, // Corrected key
      role: 'user',
      content: content || 'Attached files:' 
    });

    let fileContents = ''; 

    const fileIdsToAssociate = files && Array.isArray(files) ? files : [];

    if (fileIdsToAssociate.length > 0) {
      for (const fileId of fileIdsToAssociate) { 
        if (typeof fileId === 'number' || (typeof fileId === 'string' && fileId.trim() !== '')) {
           await associateFileWithMessage(userMessageId, fileId);
        } else {
           console.warn(`[ChatController] Skipping invalid file ID during association: ${fileId}`);
        }
      }
    }

    const userTokens = Math.ceil((content?.length || 0) / 4) + Math.ceil(fileContents.length / 4);
      await Message.updateTokens(userMessageId, userTokens);

      const placeholderAssistantMessageId = await Message.create({
        chat_id: chatId, // Corrected key
        role: 'assistant',
        content: '', 
        isLoading: true 
      });

      const handleToken = (token) => {
        eventBus.publish('chat:token', { 
          chatId: chatId, 
          messageId: placeholderAssistantMessageId, 
          token: token
        });
      };

      const asyncTaskData = {
        userModel,
        previousMessages,
        content: content || '',
        isImagePrompt, // Pass the flag
        privateMode: req.privateMode,
        userId: req.user.id,
        files: fileIdsToAssociate,
        streamingContext: { chatId, messageId: placeholderAssistantMessageId }, 
        onToken: handleToken 
      };

      asyncTaskData.streamingContext.startTime = new Date().toISOString();

      createChatCompletion(asyncTaskData)
        .then(async (completion) => {
          if (completion && completion.internalToolExecuted === true) {
            await Chat.update(chatId, {}); 
            return; 
          }

          const endTime = Date.now();
          const startTime = Date.parse(asyncTaskData.streamingContext.startTime);
          const latency = endTime - startTime;

          const originalMessage = completion.message;

          await Message.update(placeholderAssistantMessageId, {
            content: originalMessage, 
            isLoading: false
          });

          const finalMessageId = completion.messageId || placeholderAssistantMessageId;
          const assistantTokens = Math.ceil((originalMessage || '').length / 4); 
          await Message.updateTokens(finalMessageId, assistantTokens);

          await UsageStatsService.recordTokens({
            userId: req.user.id,
            modelId: userModel.id,
            chatId: chatId,
            promptTokens: userTokens,
            completionTokens: assistantTokens,
            latencyMs: completion.latency || null,
            source: 'chatController'
          });

          await Chat.update(chatId, {});

          eventBus.publish('chat:complete', {
            chatId: chatId,
            messageId: finalMessageId,
            message: originalMessage, 
            usage: completion.usage,
            status: completion.status || 'completed',
            timestamp: new Date().toISOString()
          });

          try {
            const allMessages = await Message.findByChatId(chatId);
            if (allMessages.length === 2 || (allMessages.length === 3 && allMessages[0].role === 'system')) {
              const currentChat = await Chat.findById(chatId);
              if (currentChat && currentChat.title === 'New Chat') {
                const firstUserMessageContent = allMessages.find(m => m.role === 'user')?.content || '';
                if (firstUserMessageContent) {
                  await Chat.update(chatId, { title: firstUserMessageContent });
                  eventBus.publish('chat:title_updated', { chatId: chatId, newTitle: firstUserMessageContent });
                }
              }
            }
          } catch (renameError) {
            console.error(`[Chat Ctrl] Error during auto-rename for chat ${chatId}:`, renameError);
          }

        })
        .catch(async (error) => {
          const errorMessage = error.message || 'Failed to get response.';
          console.error(`[Async Task] Error processing stream for placeholder message ${placeholderAssistantMessageId}:`, errorMessage);

          try {
            await Message.update(placeholderAssistantMessageId, {
              content: `Sorry, I encountered an error trying to reach the provider: ${errorMessage}`,
              isLoading: false,
            });
            
            eventBus.publish('chat:complete', { 
               chatId: chatId,
               messageId: placeholderAssistantMessageId,
               message: `Sorry, I encountered an error trying to reach the provider: ${errorMessage}`,
               status: 'error', 
               error: errorMessage, 
               timestamp: new Date().toISOString()
            });
          } catch (updateError) {
             console.error(`[Async Task] CRITICAL: Failed to update placeholder message ${placeholderAssistantMessageId} with error state:`, updateError);
          }

          await db.runAsync(
            `INSERT INTO access_logs (user_id, action, details) VALUES (?, ?, ?)`,
            [req.user.id, 'chat_error_async', `MsgID ${placeholderAssistantMessageId}: ${error.message || 'Unknown async error'}`]
          );
        }); 

      res.status(202).json({
        success: true,
        message: "Processing started",
        placeholderMessageId: placeholderAssistantMessageId,
        userMessage: { id: userMessageId, role: 'user', content: content || 'Attached files:', files: files || [] }
      });

    } catch (error) {
      console.error('Error initiating chat message processing:', error.message);
      res.status(500).json({
        success: false,
        message: `Error initiating message processing: ${error.message}`,
        error: error.message,
        apiKeyError: error.apiKeyError || false,
        providerName: error.providerName || null
      });
    }
}; 

async function associateFileWithMessage(messageId, fileId) {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS message_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES user_files (id) ON DELETE CASCADE,
        UNIQUE(message_id, file_id)
      )
    `);

    await db.runAsync(
      'INSERT INTO message_files (message_id, file_id) VALUES (?, ?)',
      [messageId, fileId]
    );

    return true;
  } catch (error) {
    console.error('Error associating file with message:', error);
    return false;
  }
}

async function getFilesForMessage(messageId) {
  try {
    const tableExists = await db.getAsync(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='message_files'
    `);

    if (!tableExists) return [];

    const files = await db.allAsync(`
      SELECT f.id, f.original_name, f.file_type, f.file_size, f.created_at
      FROM user_files f
      JOIN message_files mf ON f.id = mf.file_id
      WHERE mf.message_id = ?
    `, [messageId]);

    return files || [];
  } catch (error) {
    console.error('Error getting files for message:', error);
    return [];
  }
}

async function processFilesForContext(fileIds, userId) {
  try {
    if (!fileIds || fileIds.length === 0) return '';

    const fileResults = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const fileData = await fileProcessingService.processFileForModel(fileId, userId);

          return `--- File: ${fileData.filename} (${fileData.type}) ---\n${fileData.contents}\n`;
        } catch (error) {
          console.error(`Error processing file ${fileId}:`, error);
          return `[Error processing file]`;
        }
      })
    );

    return fileResults.join('\n');
  } catch (error) {
    console.error('Error processing files for context:', error);
    return '[Error processing attached files]';
  }
}

// Submit feedback for a message
exports.submitMessageFeedback = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { rating } = req.body; 
    const userId = req.user.id;

    if (!messageId || rating === undefined || ![0, -1, 1].includes(Number(rating))) {
      return res.status(400).json({
        success: false,
        message: 'Valid messageId and rating (-1, 0, or 1) are required.'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    const chat = await Chat.findById(message.chat_id);
    if (!chat || (chat.user_id !== userId && !req.user.is_admin)) {
       return res.status(403).json({ success: false, message: 'Not authorized to provide feedback for this message.' });
    }

    const currentFeedback = await db.getAsync(
      `SELECT rating FROM message_feedback
       WHERE message_id = ? AND user_id = ?`,
      [messageId, userId]
    );

    if (rating === 0 || (currentFeedback && Number(rating) === currentFeedback.rating)) {
      await db.runAsync(
        `DELETE FROM message_feedback
         WHERE message_id = ? AND user_id = ?`,
        [messageId, userId]
      );

      return res.status(200).json({ success: true, message: 'Feedback removed successfully.' });
    }

    await db.runAsync(
      `INSERT INTO message_feedback (message_id, user_id, rating)
       VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET rating = excluded.rating`,
      [messageId, userId, Number(rating)]
    );

    res.status(200).json({ success: true, message: 'Feedback submitted successfully.' });

  } catch (error) {
    console.error('Error submitting message feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting feedback.'
    });
  }
};

// Get feedback for a message
exports.getMessageFeedback = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Valid messageId is required.'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found.'
      });
    }

    const chat = await Chat.findById(message.chat_id);
    if (!chat || (chat.user_id !== userId && !req.user.is_admin)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view feedback for this message.'
      });
    }

    const feedback = await db.getAsync(
      `SELECT rating FROM message_feedback
       WHERE message_id = ? AND user_id = ?`,
      [messageId, userId]
    );

    if (!feedback) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    res.status(200).json({
      success: true,
      data: feedback
    });

  } catch (error) { 
    console.error('Error getting message feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving feedback.'
    });
  }
};
