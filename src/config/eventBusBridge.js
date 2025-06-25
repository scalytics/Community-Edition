/**
 * Event Bus Bridge
 * 
 * This module connects the event bus to WebSockets for real-time updates
 */
const eventBus = require('../utils/eventBus');
const { broadcastToRoom, broadcastToAll } = require('./socketHandlers');

/**
 * Set up event bus to WebSocket bridge
 * @param {Object} wsServer - WebSocket server instance
 */
function setupEventBusBridge(wsServer) {
  if (!wsServer) {
    console.error('Unable to set up event bus bridge: WebSocket server not provided');
    return;
  }

  // Download progress events
  eventBus.subscribe('download:progress', (downloadId, data) => {
    const room = `download:${downloadId}`;
    
    // Send to the specific download room
    broadcastToRoom(room, {
      type: 'download:progress', 
      payload: {
        downloadId,
        ...data
      }
    });
  });

  // Download complete events
  eventBus.subscribe('download:complete', (downloadId, data) => {
    const room = `download:${downloadId}`;
    broadcastToRoom(room, {
      type: 'download:complete',
      payload: {
        downloadId,
        status: 'completed',
        message: 'Download complete. Activating model...',
        ...data
      }
    });
    
    // Also broadcast to all clients so they can refresh lists
    broadcastToAll({
      type: 'model:added',
      payload: { 
        downloadId, 
        message: 'New model added to the system',
        ...data
      }
    });
  });

  // Download error events
  eventBus.subscribe('download:error', (downloadId, data) => {
    const room = `download:${downloadId}`;
    broadcastToRoom(room, {
      type: 'download:error',
      payload: {
        downloadId,
        ...data
      }
    });
  });

  // Download cancel events
  eventBus.subscribe('download:cancel', (downloadId, data) => {
    const room = `download:${downloadId}`;
    broadcastToRoom(room, {
      type: 'download:cancel',
      payload: {
        downloadId,
        ...data
      }
    });
    
    // Also broadcast to the general room so all clients know this download is cancelled
    broadcastToAll({
      type: 'model:cancelled',
      payload: { 
        downloadId,
        message: 'Download cancelled by user'
      }
    });
  });

  // Download start events
  eventBus.subscribe('download:start', (downloadId, data) => {
    const room = `download:${downloadId}`;
    broadcastToRoom(room, {
      type: 'download:progress',
      payload: {
        downloadId,
        progress: 0,
        status: 'downloading',
        message: 'Download started',
        ...data
      }
    });
    
    // Also broadcast to all clients so they can add this to their lists
    broadcastToAll({
      type: 'model:downloading',
      payload: { 
        downloadId,
        modelId: data.modelId || 'unknown',
        message: 'New download started'
      }
    });
  });

  // Download info events (for general updates)
  eventBus.subscribe('download:info', (downloadId, data) => {
    const room = `download:${downloadId}`;
    broadcastToRoom(room, {
      type: 'download:info', 
      payload: {
        downloadId,
        ...data
      }
    });
  });

  // Chat token events with enhanced resilience (Reverted Batching)
  eventBus.subscribe('chat:token', (data) => {
    if (!data || !data.chatId || !data.messageId) {
      console.error(`[EventBus] Invalid chat token data received:`, data);
      return; 
    }
    
    const room = `chat:${data.chatId}`;
    
    try {
      broadcastToRoom(room, {
        type: 'token', 
        payload: {
          chatId: data.chatId,
          messageId: data.messageId,
          token: data.token
        }
      });
    } catch (error) {
      console.error(`[EventBus] Error broadcasting token to room ${room}:`, error.message);
    }
  });

  // Chat complete events with enhanced error handling (Reverted Batching Flush)
  eventBus.subscribe('chat:complete', (data) => {
    if (!data || !data.chatId || !data.messageId) {
      console.error(`[EventBus] Invalid chat complete data received:`, data);
      return; 
    }
    
    const room = `chat:${data.chatId}`;
    try {
      broadcastToRoom(room, {
        type: 'chat:complete',
        payload: {
          chatId: data.chatId,
          messageId: data.messageId,
          message: data.message,
          elapsed: data.elapsed
        }
      });
      setTimeout(() => {
        try {
          broadcastToRoom(room, {
            type: 'chat:complete',
            payload: {
              chatId: data.chatId,
              messageId: data.messageId,
              message: data.message,
              elapsed: data.elapsed
            }
          });
        } catch (retryError) {
          console.error(`[EventBus] Error in retry broadcast of completion to room ${room}:`, retryError.message);
        }
      }, 500);
    } catch (error) {
      console.error(`[EventBus] Error broadcasting completion to room ${room}:`, error.message);
    }
  });

  // Chat error events (Reverted Batching Flush)
  eventBus.subscribe('chat:error', (data) => {
    if (!data || !data.chatId || !data.messageId) {
      console.error(`[EventBus] Invalid chat error data received:`, data);
      return; 
    }
    const room = `chat:${data.chatId}`;
    broadcastToRoom(room, {
      type: 'chat:error',
      payload: {
        chatId: data.chatId,
        messageId: data.messageId,
        error: data.error
      }
    });
  });

  // Chat performance warning events
  eventBus.subscribe('chat:performance_warning', (data) => {
    if (!data || !data.chatId || !data.messageId) {
      console.error(`[EventBus] Invalid chat performance warning data received:`, data);
      return;
    }
    const room = `chat:${data.chatId}`;
    broadcastToRoom(room, {
      type: 'chat:performance_warning', 
      payload: {
        chatId: data.chatId,
        messageId: data.messageId, 
        message: data.message  
      }
    });
  });

  // Model activation events
  eventBus.subscribe('activation:start', (activationId, data) => {
    broadcastToAll({
      type: 'activation:start',
      payload: {
        activationId,
        ...data
      }
    });
  });

  eventBus.subscribe('activation:progress', (activationId, data) => {
    broadcastToAll({
      type: 'activation:progress',
      payload: {
        activationId,
        ...data
      }
    });
  });

  eventBus.subscribe('activation:complete', (activationId, data) => {
    broadcastToAll({
      type: 'activation:complete',
      payload: {
        activationId,
        ...data
      }
    });
  });

  eventBus.subscribe('activation:error', (activationId, data) => {
    broadcastToAll({
      type: 'activation:error',
      payload: {
        activationId,
        ...data
      }
    });
  });

  eventBus.subscribe('activation:debug', (activationId, data) => {
    broadcastToAll({
      type: 'activation:debug',
      payload: {
        activationId,
        ...data
      }
    });
  });

}

module.exports = { setupEventBusBridge };
