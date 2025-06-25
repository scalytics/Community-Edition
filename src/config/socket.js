/**
 * WebSocket configuration and instance export
 */
const WebSocket = require('ws');
const url = require('url');
const { db } = require('../models/db');
const bcrypt = require('bcrypt'); 
const { handleWebSocketMessage, setupSocketHandlers } = require('./socketHandlers'); 
const eventBus = require('../utils/eventBus');

let wsServer = null;

/**
 * Broadcasts a message to all clients in a specific "room" (chatId).
 * Note: This assumes ws clients have a 'chatId' property when they are in a chat.
 * @param {string} roomName - The name of the room (e.g., "chat:123").
 * @param {object} messagePayload - The message object to send.
 */
function broadcastToRoom(roomName, messagePayload) {
  if (!wsServer || !wsServer.clients) {
    console.error('[broadcastToRoom] wsServer or clients not available.');
    return;
  }
  const targetChatId = roomName.startsWith('chat:') ? roomName.split(':')[1] : null;
  if (!targetChatId) {
    console.error(`[broadcastToRoom] Invalid roomName format: ${roomName}`);
    return;
  }

  wsServer.clients.forEach(client => {
    // Assuming client.chatId is set when a user is viewing/interacting with a specific chat
    if (client.readyState === WebSocket.OPEN && client.chatId === targetChatId) {
      try {
        client.send(JSON.stringify(messagePayload));
      } catch (e) {
        console.error(`[broadcastToRoom] Error sending message to client in room ${roomName}:`, e);
      }
    }
  });
}

/**
 * Authenticates an incoming MCP server connection request.
 */
async function authenticateMcpServer(request) {
    const parsedUrl = url.parse(request.url, true);
    const serverId = parsedUrl.query.serverId;
    const authHeader = request.headers['authorization'];

    if (!serverId || !authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('[WebSocket Auth] MCP connection rejected: Missing serverId query param or Authorization header.');
        return false;
    }
    const receivedKey = authHeader.split(' ')[1];
    if (!receivedKey) {
        console.warn('[WebSocket Auth] MCP connection rejected: Malformed Authorization header.');
        return false;
    }
    try {
        const server = await db.getAsync('SELECT api_key_hash, is_active, name FROM mcp_servers WHERE id = ?', [serverId]);
        if (!server) { console.warn(`[WebSocket Auth] MCP connection rejected: Server ID ${serverId} not found.`); return false; }
        if (!server.is_active) { console.warn(`[WebSocket Auth] MCP connection rejected: Server ${server.name} (ID: ${serverId}) is not active.`); return false; }
        if (!server.api_key_hash) { console.warn(`[WebSocket Auth] MCP connection rejected: Server ${server.name} (ID: ${serverId}) has no API key configured.`); return false; }
        const match = await bcrypt.compare(receivedKey, server.api_key_hash);
         if (!match) { console.warn(`[WebSocket Auth] MCP connection rejected: Invalid API key for server ${server.name} (ID: ${serverId}).`); return false; }
         return true;
     } catch (error) {
        console.error(`[WebSocket Auth] Error during MCP server authentication for ID ${serverId}:`, error);
        return false;
    }
}


/**
 * Initialize WebSocket server with the HTTP server
 */
function initializeSocket(server) {
  if (wsServer) return wsServer;

  wsServer = new WebSocket.Server({ noServer: true });

  // Handle HTTP server upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    const pathname = parsedUrl.pathname;
    try {
        if (pathname === '/socket') { 
            wsServer.handleUpgrade(request, socket, head, (ws) => { wsServer.emit('connection', ws, request); });
        } else if (pathname === '/mcp-socket') { 
            const isAuthenticated = await authenticateMcpServer(request);
            if (isAuthenticated) {
                wsServer.handleUpgrade(request, socket, head, (ws) => {
                    ws.isMcpServer = true; ws.mcpServerId = parsedUrl.query.serverId;
                    wsServer.emit('connection', ws, request);
                });
            } else {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
            }
        } else { socket.destroy(); }
    } catch (err) { console.error('[WebSocket] Error during upgrade handling:', err); socket.destroy(); }
  });

  // Set up connection handler
  wsServer.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
     const clientIdFromUrl = url.parse(req.url, true).query.clientId;

     if (ws.isMcpServer) {
     } else {
          ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
          if (clientIdFromUrl) { ws.clientId = clientIdFromUrl; /* ... handle reconnection ... */ }
         ws.send(JSON.stringify({ type: 'connection:established', payload: { message: 'WebSocket connection established', time: new Date().toISOString() } }));
    }

     // Common handlers
     ws.on('message', (message) => { handleWebSocketMessage(ws, message); }); 
     ws.on('close', () => {
     });
    ws.on('error', (error) => { console.error('[WebSocket] Connection error:', error); });
  });

  setupSocketHandlers(wsServer);

  const heartbeatInterval = setInterval(() => {
    wsServer.clients.forEach((ws) => {
      if (ws.isMcpServer) return;
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false; ws.ping();
    });
  }, 30000);

  wsServer.on('close', () => clearInterval(heartbeatInterval));

  // Removed conflicting eventBus subscriptions - these are now handled by eventBusBridge.js
 
 
   return wsServer;
 }

module.exports = {
  initializeSocket,
  get wsServer() { return wsServer; }
};
