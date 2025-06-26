/**
 * WebSocket service for real-time communication
 * Uses native WebSockets instead of Socket.IO
 */

import eventBus from '../utils/eventBus';
import streamingManager from './streamingManager'; 

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
    this.downloadSubscriptions = new Set();
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.reconnectDelay = 1000;
    this.messageQueue = [];
    this.pingInterval = null;
    this.onConnectionStateChange = null;
    this.activeChatSubscriptions = new Set();
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise} Promise that resolves when connected
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve(this.socket);
        return;
      }

      if (this.socket) {
        this.disconnect();
      }

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${wsProtocol}//localhost:3001/socket?clientId=${this.clientId}`;

      try {
        this.socket = new WebSocket(socketUrl);

        this.socket.onopen = () => {
          const wasConnected = this.isConnected;
          this.isConnected = true;
          this.reconnectAttempts = 0;

          if (!wasConnected && this.onConnectionStateChange) {
            this.onConnectionStateChange(true);
          }

          this.pingInterval = setInterval(() => {
            this.send('ping', { time: new Date().toISOString() });
          }, 25000);
          this.processPendingMessages();
          this.downloadSubscriptions.forEach(downloadId => {
            this.subscribeToDownload(downloadId);
          });
          this.activeChatSubscriptions.forEach(chatId => {
            this.send('chat:subscribe', { chatId: chatId });
          });

          resolve(this.socket);
        };

        this.socket.onclose = (event) => {
          const wasConnected = this.isConnected;
          this.isConnected = false;

          if (wasConnected && this.onConnectionStateChange) {
            this.onConnectionStateChange(false);
          }

          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }

          this.attemptReconnect();
        };

        this.socket.onerror = (error) => {
          console.error('[SocketService] WebSocket error occurred', error);
          if (!this.isConnected) {
            reject(error);
          }
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };
      } catch (error) {
        console.error('[SocketService] Error creating WebSocket connection', error);
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  attemptReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SocketService] Failed to reconnect after maximum attempts');
      return;
    }

    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[SocketService] Reconnection attempt failed:', error);
      });
    }, delay);
  }

  /**
   * Process any messages that were queued while disconnected
   */
  processPendingMessages() {
    if (this.messageQueue.length > 0) {

      const criticalMessages = this.messageQueue.filter(msg =>
        msg.type === 'chat:subscribe' || msg.type === 'download:subscribe'
      );

      const regularMessages = this.messageQueue.filter(msg =>
        msg.type !== 'chat:subscribe' && msg.type !== 'download:subscribe'
      );

      this.messageQueue = [];

      criticalMessages.forEach(msg => {
        this.send(msg.type, msg.payload);
      });

      regularMessages.forEach(msg => {
        this.send(msg.type, msg.payload);
      });
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @param {MessageEvent} event - WebSocket message event
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const { type, payload } = message;


      switch (type) {
        case 'connection:established':
          break;
        case 'ping':
        case 'pong':
          break;

        case 'download:progress':
          this.emitEvent(`download:${payload.downloadId}:progress`, payload);
          if (payload && payload.downloadId) {
            const eventName = `download:${payload.downloadId}:progress`;
            const customEvent = new CustomEvent(eventName, { detail: payload });
            window.dispatchEvent(customEvent);
            const genericEvent = new CustomEvent('download-activity', { detail: { eventType: 'progress', payload } });
            window.dispatchEvent(genericEvent);
          }
          break;

        case 'download:complete':
          this.emitEvent(`download:${payload.downloadId}:complete`, payload);
          if (payload && payload.downloadId) {
            const eventName = `download:${payload.downloadId}:complete`;
            const customEvent = new CustomEvent(eventName, { detail: payload });
            window.dispatchEvent(customEvent);
            const genericEvent = new CustomEvent('download-activity', { detail: { eventType: 'complete', payload } });
            window.dispatchEvent(genericEvent);
          }
          break;

        case 'download:error':
          this.emitEvent(`download:${payload.downloadId}:error`, payload);
          if (payload && payload.downloadId) {
            const eventName = `download:${payload.downloadId}:error`;
            const customEvent = new CustomEvent(eventName, { detail: payload });
            window.dispatchEvent(customEvent);
            const genericEvent = new CustomEvent('download-activity', { detail: { eventType: 'error', payload } });
            window.dispatchEvent(genericEvent);
          }
          break;

        case 'token':
          if (payload.chatId && payload.messageId && payload.token) {
            this.emitEvent(`chat:${payload.chatId}:token`, payload);
            this.emitEvent('chat:token', payload);
          }
          break;

        case 'complete':
          if (payload.chatId && payload.messageId) {
            this.emitEvent(`chat:${payload.chatId}:complete`, payload);
            this.emitEvent('chat:complete', payload);
          }
          break;

        case 'chat:token':
          this.emitEvent(`chat:${payload.chatId}:token`, payload);
          this.emitEvent('chat:token', payload);
          break;

        case 'chat:complete':
          setTimeout(() => {
            this.emitEvent(`chat:${payload.chatId}:complete`, payload);
            this.emitEvent('chat:complete', payload);
          }, 100);
          break;

        case 'model:added':
        case 'model:downloading':
        case 'model:cancelled':
          this.emitEvent(type, payload);
          break;

        case 'download:status:received':
          if (payload && payload.downloadId) {
            this.emitEvent(`download:${payload.downloadId}:received`, payload);
            if (payload && payload.downloadId) {
              const eventName = `download:${payload.downloadId}:received`;
              const customEvent = new CustomEvent(eventName, { detail: payload });
              window.dispatchEvent(customEvent);
              const genericEvent = new CustomEvent('download-activity', { detail: { eventType: 'received', payload } });
              window.dispatchEvent(genericEvent);
            }
          }
          break;

        default:
          if (type.startsWith('download:') && payload && payload.downloadId) {
            const eventType = type.split(':')[1];
            if (payload && payload.downloadId) {
              const eventName = `download:${payload.downloadId}:${eventType}`;
              const customEvent = new CustomEvent(eventName, { detail: payload });
              window.dispatchEvent(customEvent);
              const genericEvent = new CustomEvent('download-activity', { detail: { eventType, payload } });
              window.dispatchEvent(genericEvent);
            }
          } else {
            console.warn(`[SocketService] Received unknown message type: ${type}`, payload);
          }

          this.emitEvent(type, payload);
          break; 

        // --- Share Events ---
        case 'share:accepted':
        case 'share:invited':
        case 'share:declined':
        case 'share:removed':
          if (payload) {
            eventBus.publish(type, payload);
          } else {
            console.warn(`[SocketService] Received ${type} event with invalid payload:`, payload);
          }
          break;
        // --- End Share Events ---

        case 'stream_started': 
          if (payload && payload.chatId && payload.tempId && payload.numericId) {
             this.emitEvent(`chat:${payload.chatId}:stream_started`, payload);
          } else {
             console.warn('[SocketService] Received invalid stream_started payload:', payload);
          }
          break;

        case 'chat:context_warning': 
          if (payload && payload.chatId && payload.messageId) {
            this.emitEvent('chat:context_warning', payload); 
          } else {
            console.warn('[SocketService] Received invalid chat:context_warning payload:', payload);
          }
          break;

        case 'chat:performance_warning': 
          if (payload && payload.chatId && payload.messageId) {
            this.emitEvent('chat:performance_warning', payload); 
          } else {
            console.warn('[SocketService] Received invalid chat:performance_warning payload:', payload);
          }
          break;

        case 'new_message': 
          if (payload && payload.chat_id && payload.id) {
            this.emitEvent(`chat:${payload.chat_id}:new_message`, payload);
          } else {
            console.warn('[SocketService] Received invalid new_message payload:', payload);
          }
          break;
        
        case 'chat_title_updated': 
          if (payload && payload.chatId && payload.newTitle) {
            this.emitEvent(`chat:${payload.chatId}:chat_title_updated`, payload);
          } else {
            console.warn('[SocketService] Received invalid chat_title_updated payload:', payload);
          }
          break;

        // --- New cases for Tool Streaming ---
        case 'tool_stream_started':
          if (payload && payload.chatId && payload.toolName && payload.toolExecutionId) {
            streamingManager.handleToolStreamStarted(payload);
          } else {
            console.warn('[SocketService] Received invalid tool_stream_started payload:', payload);
          }
          break;

        case 'tool_stream_chunk':
          if (payload && payload.chatId && payload.toolName && payload.toolExecutionId && payload.chunkType && payload.data) {
            streamingManager.handleToolStreamChunk(payload);
          } else {
            console.warn('[SocketService] Received invalid tool_stream_chunk payload (or missing chatId/toolExecutionId):', payload);
          }
          break;
        
        case 'tool_stream_complete':
          if (payload && payload.toolName && payload.chatId && payload.toolExecutionId) { 
            streamingManager.handleToolStreamComplete(payload);
          } else {
            console.warn('[SocketService] Received invalid tool_stream_complete payload:', payload);
          }
          break;

        case 'tool_stream_error':
          if (payload && payload.toolName && payload.error && payload.chatId && payload.toolExecutionId) { 
            streamingManager.handleToolStreamError(payload);
          } else {
            console.warn('[SocketService] Received invalid tool_stream_error payload:', payload);
          }
          break;
        // --- End New cases for Tool Streaming ---

        // --- Model Activation Events ---
        case 'activation:start':
          if (payload && payload.activationId) {
            eventBus.publish('activation:start', payload.activationId, payload);
          } else {
            console.warn('[SocketService] Received invalid activation:start payload:', payload);
          }
          break;

        case 'activation:progress':
          if (payload && payload.activationId) {
            eventBus.publish('activation:progress', payload.activationId, payload);
          } else {
            console.warn('[SocketService] Received invalid activation:progress payload:', payload);
          }
          break;

        case 'activation:complete':
          if (payload && payload.activationId) {
            eventBus.publish('activation:complete', payload.activationId, payload);
          } else {
            console.warn('[SocketService] Received invalid activation:complete payload:', payload);
          }
          break;

        case 'activation:error':
          if (payload && payload.activationId) {
            eventBus.publish('activation:error', payload.activationId, payload);
          } else {
            console.warn('[SocketService] Received invalid activation:error payload:', payload);
          }
          break;

        case 'activation:debug':
          if (payload && payload.activationId) {
            eventBus.publish('activation:debug', payload.activationId, payload);
          } else {
            console.warn('[SocketService] Received invalid activation:debug payload:', payload);
          }
          break;
        // --- End Model Activation Events ---

      } 
    } catch (error) {
      console.error('Error handling WebSocket message:', error); 
    }
  }

  /**
   * Send a message to the WebSocket server
   * @param {string} type - Message type
   * @param {*} payload - Message payload
   * @returns {boolean} - Whether the message was sent successfully
   */
  send(type, payload = {}) {
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {

      this.messageQueue.push({ type, payload });
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('[SocketService] Error reconnecting:', error);
        });
      }
      return false;
    }

    try {
      const enhancedPayload = {
        ...payload,
        clientId: this.clientId
      };

      this.socket.send(JSON.stringify({ type, payload: enhancedPayload }));
      return true;
    } catch (error) {
      console.error('[SocketService] Error sending WebSocket message', error);
      this.messageQueue.push({ type, payload });
      return false;
    }
  }

  /**
   * Subscribe to events for a specific download
   * @param {string} downloadId - The download ID to subscribe to
   */
  subscribeToDownload(downloadId) {
    if (!this.isConnected) {
      this.downloadSubscriptions.add(downloadId);
      this.connect().then(() => this.subscribeToDownload(downloadId));
      return;
    }

    this.send('download:subscribe', { downloadId });
    this.downloadSubscriptions.add(downloadId);

    this.requestDownloadStatus(downloadId);
  }

  /**
   * Subscribe to streaming events for a specific chat
   * @param {string|number} chatId - The chat ID to subscribe to
   * @returns {Function} - Unsubscribe function
   */
  subscribeToChat(chatId) {
    let chatIdStr;

    if (typeof chatId === 'object') {
      chatIdStr = chatId?.id ? String(chatId.id) :
                  chatId?.chatId ? String(chatId.chatId) :
                  typeof chatId[0] === 'string' || typeof chatId[0] === 'number' ? String(chatId[0]) :
                  String(Object.values(chatId)[0]);
    } else {
      chatIdStr = String(chatId);
    }

    this.activeChatSubscriptions.add(chatIdStr);

    if (!this.isConnected) {
      this.connect()
        .then(() => {
          if (this.activeChatSubscriptions.has(chatIdStr)) {
            this.send('chat:subscribe', { chatId: chatIdStr });
          }
        })
        .catch(error => {
          console.error(`[SocketService] Failed to connect for chat subscription: ${error.message}`);
        });
    } else {
      this.send('chat:subscribe', { chatId: chatIdStr });
    }

    return () => {
      this.unsubscribeFromChat(chatIdStr);
    };
  }

  /**
   * Unsubscribe from streaming events for a specific chat
   * @param {string|number} chatId - The chat ID to unsubscribe from
   */
  unsubscribeFromChat(chatId) {
    let chatIdStr;

    if (typeof chatId === 'object') {
      chatIdStr = chatId?.id ? String(chatId.id) :
                  chatId?.chatId ? String(chatId.chatId) :
                  typeof chatId[0] === 'string' || typeof chatId[0] === 'number' ? String(chatId[0]) :
                  String(Object.values(chatId)[0]);
    } else {
      chatIdStr = String(chatId);
    }

    if (this.activeChatSubscriptions.has(chatIdStr)) {
      if (!this.isConnected) {
        this.activeChatSubscriptions.delete(chatIdStr);
        return;
      }

      this.send('chat:unsubscribe', { chatId: chatIdStr });
      this.activeChatSubscriptions.delete(chatIdStr);
    }
  }

  /**
   * Unsubscribe from events for a specific download
   * @param {string} downloadId - The download ID to unsubscribe from
   */
  unsubscribeFromDownload(downloadId) {
    if (!this.isConnected) {
      this.downloadSubscriptions.delete(downloadId);
      return;
    }

    this.send('download:unsubscribe', { downloadId });
    this.downloadSubscriptions.delete(downloadId);
  }

  /**
   * Request current status for a specific download
   * @param {string} downloadId - The download ID to get status for
   */
  requestDownloadStatus(downloadId) {
    if (!this.isConnected) {
      this.connect().then(() => this.requestDownloadStatus(downloadId));
      return;
    }
    this.send('download:status', { downloadId });
  }

  /**
   * Register an event handler for a specific event type
   * @param {string} event - Event name to listen for
   * @param {Function} callback - Callback function to execute when event occurs
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    const handlers = this.eventHandlers.get(event);
    handlers.add(callback);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(callback);
      }
    };
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emitEvent(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}`, error);
        }
      });
    }

    if (data && data.downloadId) {
      const downloadId = data.downloadId;
      const wildcardHandlers = this.eventHandlers.get(`download:${downloadId}:*`);

      if (wildcardHandlers) {
        const eventParts = event.split(':');
        const eventType = eventParts.length > 2 ? eventParts[2] : 'unknown';

        wildcardHandlers.forEach(callback => {
          try {
            callback(eventType, data);
          } catch (error) {
            console.error(`Error in wildcard event handler for ${event}`, error);
          }
        });
      }
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      this.isConnected = false;

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Normal closure');
      }
    }
  }
}

const socketService = new WebSocketService();

export default socketService;
