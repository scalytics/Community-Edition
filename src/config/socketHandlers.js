/**
 * WebSocket handlers and configuration
 */
const WebSocket = require('ws');
const { downloadManager } = require('../utils/streamDownloader');
const eventBus = require('../utils/eventBus');
const { requestCancellation } = require('../utils/cancellationManager'); 
const { cancelInferenceRequest } = require('../services/inferenceRouter');

let localWsServer = null;

const rooms = new Map();
const clientIdMap = new Map();
const roomTimeouts = new Map();

function joinRoom(roomName, ws) { if (!rooms.has(roomName)) { rooms.set(roomName, new Set()); } rooms.get(roomName).add(ws); }
function leaveRoom(roomName, ws) { if (rooms.has(roomName)) { rooms.get(roomName).delete(ws); if (rooms.get(roomName).size === 0) { rooms.delete(roomName); } } }
function leaveAllRooms(ws, immediate = false) { rooms.forEach((clients, roomName) => { if (clients.has(ws)) { if (immediate) { leaveRoom(roomName, ws); } else { delayedRoomCleanup(roomName, ws); } } }); }
function delayedRoomCleanup(roomName, ws) { const clientId = ws.clientId; const isChatRoom = roomName.startsWith('chat:'); if (!clientId && !isChatRoom) { leaveRoom(roomName, ws); return; } const trackingId = clientId || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`; if (!clientIdMap.has(trackingId)) { clientIdMap.set(trackingId, new Set()); } clientIdMap.get(trackingId).add(roomName); const timeoutKey = `${roomName}:${trackingId}`; if (roomTimeouts.has(timeoutKey)) { clearTimeout(roomTimeouts.get(timeoutKey)); } const timeout = setTimeout(() => { if (rooms.has(roomName) && clientIdMap.has(trackingId)) { let clientWs = null; rooms.get(roomName).forEach(existingWs => { if (existingWs.clientId === trackingId) { clientWs = existingWs; } }); if (clientWs) { leaveRoom(roomName, clientWs); } clientIdMap.get(trackingId).delete(roomName); if (clientIdMap.get(trackingId).size === 0) { clientIdMap.delete(trackingId); } } roomTimeouts.delete(timeoutKey); }, 180000); roomTimeouts.set(timeoutKey, timeout); }
function cleanupClosedConnectionsInRoom(roomName) { if (!rooms.has(roomName)) return 0; const clients = rooms.get(roomName); const closedClients = []; clients.forEach(client => { if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) { closedClients.push(client); } }); closedClients.forEach(client => { clients.delete(client); }); if (clients.size === 0) { rooms.delete(roomName); } return closedClients.length; }


// Token processor 
const tokenProcessor = {
  inThinkingSection: false, buffer: '',
  thinkingStartPatterns: [ '<think>', '<thinking>', '<|thinking|>', 'Alright, ', 'I need to ', 'I should ', 'Let me ', 'The user asked about ', 'First, I\'ll', 'I\'ll start by' ],
  thinkingEndPatterns: [ '</think>', '</thinking>', '</|thinking|>', 'Answer:', 'Response:' ],
  specialTags: [ '<|assistant|>' ],
  processToken: function(token) { /* ... existing logic ... */ },
  reset: function() { this.inThinkingSection = false; this.buffer = ''; },
  processCompleteMessage: function(message) { /* ... existing logic ... */ }
};
// --- Token Processor Logic  ---
tokenProcessor.processToken = function(token) { if (!token || token.trim() === '') { return null; } this.buffer += token; if (this.buffer.length > 200) { this.buffer = this.buffer.substring(this.buffer.length - 200); } for (const tag of this.specialTags) { if (this.buffer.includes(tag)) { token = token.replace(tag, ''); if (!token || token.trim() === '') { return null; } } } for (const pattern of this.thinkingStartPatterns) { if (this.buffer.includes(pattern) && !this.inThinkingSection) { this.inThinkingSection = true; return null; } } for (const pattern of this.thinkingEndPatterns) { if (this.buffer.includes(pattern) && this.inThinkingSection) { this.inThinkingSection = false; if (pattern === 'Answer:' || pattern === 'Response:') { const answerPos = token.indexOf(pattern); if (answerPos !== -1) { const processedToken = token.substring(answerPos + pattern.length); return processedToken.trim() ? processedToken : null; } } return null; } } if (this.inThinkingSection) { return null; } return token; };
tokenProcessor.processCompleteMessage = function(message) { if (!message) return ''; this.reset(); let bestAnswer = ''; let processedMessage = message; for (const tag of this.specialTags) { processedMessage = processedMessage.replace(new RegExp(tag, 'g'), ''); } processedMessage = processedMessage.replace(/<think>[\s\S]*?<\/think>/g, ''); processedMessage = processedMessage.replace(/<thinking>[\s\S]*?<\/thinking>/g, ''); processedMessage = processedMessage.replace(/<\|thinking\|>[\s\S]*?<\/\|thinking\|>/g, ''); const answerMatch = processedMessage.match(/Answer:([\s\S]*)/); const responseMatch = processedMessage.match(/Response:([\s\S]*)/); if (answerMatch) { bestAnswer = answerMatch[1].trim(); } else if (responseMatch) { bestAnswer = responseMatch[1].trim(); } if (bestAnswer) { return bestAnswer; } const paragraphs = processedMessage.split('\n\n').filter(p => p.trim().length > 0); if (paragraphs.length > 1) { const thinkingIndicators = [ 'I need to', 'I should', 'The user', 'Let me', 'I\'ll', 'user is asking', 'need to explain', 'think about' ]; let foundThinkinginEarlier = false; for (let i = 0; i < paragraphs.length - 1; i++) { const paragraph = paragraphs[i].toLowerCase(); if (thinkingIndicators.some(indicator => paragraph.includes(indicator.toLowerCase()))) { foundThinkinginEarlier = true; break; } } if (foundThinkinginEarlier) { return paragraphs[paragraphs.length - 1].trim(); } } return processedMessage.trim(); };
// --- End Token Processor Logic ---


/**
 * Send download information to client
 */
function sendDownloadInfoToClient(ws, downloadId, downloadInfo) {
  if (!downloadInfo) return;
  let type = 'download:progress';
  let payload = { downloadId, progress: downloadInfo.progress || 0, bytesDownloaded: downloadInfo.bytesDownloaded || 0, totalBytes: downloadInfo.totalBytes || 0, speed: downloadInfo.speed || 0, status: downloadInfo.status || 'downloading', message: downloadInfo.message || 'Downloading...' };
  if (downloadInfo.status === 'completed') { type = 'download:complete'; payload.message = downloadInfo.message || 'Download completed'; payload.outputPath = downloadInfo.outputPath; }
  else if (downloadInfo.status === 'failed') { type = 'download:error'; payload.error = downloadInfo.error || 'Unknown error'; }
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type, payload })); }
  else { broadcastToRoom(`download:${downloadId}`, { type, payload }); }
}

/**
 * Handles stop generation requests for local models by calling the inference router.
 */
function handleStopGeneration(payload) {
    const requestIdToStop = payload?.requestId; 
    if (requestIdToStop) {
        const success = cancelInferenceRequest(requestIdToStop);
        if (!success) {
            console.warn(`[Socket] Failed to send interrupt for request ID: ${requestIdToStop} (maybe already completed)`);
        }
    } else {
        console.error(`[Socket] Received stop_generation with invalid requestId:`, payload?.requestId);
    }
}

/**
 * Handles stop requests for the Live Search workflow.
 */
function handleStopLiveSearch(payload) {
    const requestId = payload?.requestId; 
    if (requestId) {
        requestCancellation(requestId); 
    } else {
        console.error(`[Socket] Received stop_live_search with invalid requestId:`, payload?.requestId);
    }
}


/**
 * Handle incoming WebSocket message (central routing)
 * @param {WebSocket} ws - WebSocket client instance
 * @param {string} message - Raw message received
 */
function handleWebSocketMessage(ws, message) {
  try {
    const data = JSON.parse(message.toString());
    const { type, payload } = data;

    if (payload && payload.clientId && !ws.clientId) {
      ws.clientId = payload.clientId;
    }

    switch (type) {
      case 'chat:subscribe':
        let chatId = String(typeof payload === 'object' ? (payload.chatId || payload.id || JSON.stringify(payload).substring(0, 20)) : payload);
        if (chatId === '[object Object]') { console.error('Invalid chat ID format received. Payload:', payload); chatId = 'invalid-' + Date.now(); }
        joinRoom(`chat:${chatId}`, ws); 
        break;
      case 'chat:unsubscribe':
        let unsubChatId = String(typeof payload === 'object' ? (payload.chatId || payload.id || JSON.stringify(payload).substring(0, 20)) : payload);
        if (unsubChatId === '[object Object]') { console.error('Invalid chat ID format received for unsubscribe. Payload:', payload); unsubChatId = 'invalid-' + Date.now(); }
        leaveRoom(`chat:${unsubChatId}`, ws); 
        break;
      case 'download:subscribe':
        const downloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        joinRoom(`download:${downloadId}`, ws); 
        ws.downloadStatusRequested = true;
        const downloadInfo = downloadManager.getDownloadInfo(downloadId);
        if (downloadInfo) {
             sendDownloadInfoToClient(ws, downloadId, downloadInfo); 
        }
        break;
      case 'download:unsubscribe':
        const unsubDownloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        leaveRoom(`download:${unsubDownloadId}`, ws); 
        break;
      case 'download:status':
        const statusDownloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        const currentInfo = downloadManager.getDownloadInfo(statusDownloadId);
        if (currentInfo) {
            sendDownloadInfoToClient(ws, statusDownloadId, currentInfo); 
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', payload: { time: new Date().toISOString() } }));
        break;
      case 'stop_generation':
        handleStopGeneration(payload);
        break;
      case 'stop_live_search':
        handleStopLiveSearch(payload);
        break;
      default:
    }
  } catch (error) {
    console.error('Error handling WebSocket message:', error);
  }
}

// --- Broadcast Functions (Moved from socket.js) ---
function broadcastToRoom(roomName, message) {
    if (rooms && rooms.has(roomName)) {
        const clients = rooms.get(roomName);
        const messageStr = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try { client.send(messageStr); }
                catch (sendError) { console.error(`[WS Broadcast] Error sending message to client ${client.clientId || 'unknown'} in room ${roomName}:`, sendError.message); }
            }
        });
    }
}

function broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    if (localWsServer) {
        localWsServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) { client.send(messageStr); }
        });
    } else {
        console.error("[WS Broadcast] broadcastToAll called before wsServer was set!");
    }
}
// --- End Broadcast Functions ---


/**
 * Set up listeners on the main WebSocket server instance.
 * @param {WebSocket.Server} wsServerInstance - The WebSocket server instance.
 */
function setupSocketHandlers(wsServerInstance) {
    if (!wsServerInstance) {
        console.error("[Socket Handlers] setupSocketHandlers called without wsServer instance!");
        return;
    }
    localWsServer = wsServerInstance; 

    eventBus.subscribe('chat:stream_started', (data) => {
        if (data && data.chatId && data.tempId && data.numericId) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'stream_started', payload: data });
        } else { console.error('[Socket EventBus Listener] Invalid chat:stream_started event data received:', data); }
    });

     eventBus.subscribe('chat:system_message', (data) => {
        if (data && data.chatId && data.content) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'system_message', payload: { content: data.content } });
         } else { console.error('[Socket EventBus Listener] Invalid chat:system_message event data received:', data); }
    });

    eventBus.subscribe('chat:message_created', (newMessage) => {
        if (newMessage && newMessage.chat_id && newMessage.id) {
            broadcastToRoom(`chat:${newMessage.chat_id}`, { type: 'new_message', payload: newMessage });
        } else {
            console.error('[Socket EventBus Listener] Invalid chat:message_created event data received:', newMessage);
        }
    });

    eventBus.subscribe('chat:title_updated', (data) => {
        if (data && data.chatId && data.newTitle) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'chat_title_updated', payload: { chatId: data.chatId, newTitle: data.newTitle } });
        } else {
            console.error('[Socket EventBus Listener] Invalid chat:title_updated event data received:', data);
        }
    });

    // --- New EventBus Listeners for Tool Streaming ---
    eventBus.subscribe('mcp:tool_stream_started', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_started', 
                payload: {
                    chatId: data.chatId,
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_started event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_chunk_generated', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId && data.chunkType && data.payload) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_chunk', 
                payload: { 
                    chatId: data.chatId, 
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    chunkType: data.chunkType,
                    data: data.payload, 
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_chunk_generated event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_stream_complete', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_complete', 
                payload: { 
                    chatId: data.chatId, 
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    finalMessageId: data.finalMessageId, 
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_complete event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_stream_error', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId && data.error) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_error', 
                payload: { 
                    chatId: data.chatId, 
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    error: data.error,
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_error event data received:', data);
        }
    });
    // --- End New EventBus Listeners ---

}

module.exports = {
    setupSocketHandlers,
    handleWebSocketMessage,
    tokenProcessor,
    sendDownloadInfoToClient,
    broadcastToRoom,
    broadcastToAll,
};
