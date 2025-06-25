/**
 * Global WebSocket Manager to maintain a persistent connection
 * This ensures we keep a single WebSocket connection throughout the application lifecycle
 * and provides resilience against network issues
 */

import socketService from './socketService';

// Initialize when the application starts
const initializeWebSocket = () => {
  // Ensure the connection is established as soon as possible
  socketService.connect().catch(err => {
    console.error('Failed to establish WebSocket connection');
    
    // Try again in 3 seconds
    setTimeout(() => {
      socketService.connect().catch(() => {
        console.error('Failed second attempt to establish WebSocket connection');
      });
    }, 3000);
  });
  
  // Store active chat subscriptions to restore on reconnection
  const activeSubscriptions = new Set();
  
  // Track active chats and re-subscribe after reconnection
  const originalSubscribe = socketService.subscribeToChat;
  socketService.subscribeToChat = (chatId) => {
    const chatIdStr = typeof chatId === 'object' ? String(chatId.id || chatId) : String(chatId);
    activeSubscriptions.add(chatIdStr);
    return originalSubscribe.call(socketService, chatId);
  };
  
  // Clean up subscriptions when unsubscribing
  const originalUnsubscribe = socketService.unsubscribeFromChat;
  socketService.unsubscribeFromChat = (chatId) => {
    const chatIdStr = typeof chatId === 'object' ? String(chatId.id || chatId) : String(chatId);
    activeSubscriptions.delete(chatIdStr);
    return originalUnsubscribe.call(socketService, chatId);
  };
  
  // Handle reconnection logic to restore subscriptions
  let wasConnected = socketService.isConnected;
  
  // Set up application-level event listeners
  window.addEventListener('beforeunload', () => {
    // Only disconnect when the user is actually leaving the page
    socketService.disconnect();
  });
  
  // Create a visibility change listener to reconnect when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socketService.isConnected) {
      socketService.connect().catch(() => {
        console.error('Failed to reconnect when tab became visible');
      });
    }
  });
  
  // Set up custom events to notify about connection state
  socketService.onConnectionStateChange = (isConnected) => {
    // Dispatch custom events that components can listen to
    const event = new CustomEvent(
      isConnected ? 'socket:connected' : 'socket:disconnected'
    );
    window.dispatchEvent(event);
    
    // If connection is restored, resubscribe to active chats
    if (isConnected && !wasConnected) {
      let index = 0;
      activeSubscriptions.forEach(chatId => {
        // Stagger subscription requests to avoid overwhelming the server
        setTimeout(() => {
          if (socketService.isConnected) {
            // Force reconnection by removing from active subscriptions before resubscribing
            socketService.activeChatSubscriptions.delete(chatId);
            originalSubscribe.call(socketService, chatId);
          }
        }, 100 * index);
        index++;
      });
      
      // Also try to manually reload active subscriptions after a delay
      setTimeout(() => {
        activeSubscriptions.forEach(chatId => {
          if (!socketService.activeChatSubscriptions.has(chatId)) {
            originalSubscribe.call(socketService, chatId);
          }
        });
      }, 2000);
    }
    
    wasConnected = isConnected;
  };
  
  // Monitor the connection state more frequently
  setInterval(() => {
    if (!socketService.isConnected) {
      socketService.connect().catch(() => {
        console.error('Failed reconnection attempt');
      });
    }
  }, 15000); // Check every 15 seconds
  
  return socketService;
};

// Export the initialized service
export const websocketManager = initializeWebSocket();

// Also export a function to ensure the connection is active
export const ensureWebSocketConnection = () => {
  if (!socketService.isConnected) {
    return socketService.connect();
  }
  return Promise.resolve(socketService.socket);
};

export default websocketManager;
