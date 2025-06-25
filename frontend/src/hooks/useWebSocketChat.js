import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketManager } from '../services/websocketManager';
// Removed unused tokenProcessor import
import eventBus from '../utils/eventBus';

/**
 * Custom hook to manage WebSocket connection for chat streaming
 * Uses the existing websocketManager singleton rather than creating a new WebSocket connection
 * @param {string|number} chatId The ID of the current chat
 * @param {Function} setStreamingMessages Function to update streaming messages state
 * @param {React.RefObject} chatContainerRef Reference to chat container for scrolling
 * @returns {Object} WebSocket connection state and methods
 */
const useWebSocketChat = (chatId, setStreamingMessages, chatContainerRef) => {
  const [connected, setConnected] = useState(websocketManager.isConnected);
  const [lastMessage, setLastMessage] = useState(null);
  
  // Removed unused codeBlockStateRef

  // Handle chat tokens
  const handleChatToken = useCallback((payload) => {
    const rawToken = payload.token; // Get the raw token
    
    // Only update UI if token is not null/undefined and messageId exists
    if (rawToken !== null && rawToken !== undefined && payload.messageId) {
      // --- Removed TARGETED WARN LOG ---
      setStreamingMessages((prev) => {
        // Use functional update to ensure we're working with latest state
        const messageId = payload.messageId; // Keep only one declaration
        const currentContent = prev[messageId] || '';
        // --- REMOVED Code block detection logic ---
        // Append the raw token directly
        const newContent = currentContent + rawToken; 
        
        // Check if content actually changed to avoid unnecessary re-renders
        if (currentContent === newContent) return prev;
        
        // Create a new object reference to trigger re-render
        return {
          ...prev,
          [messageId]: newContent
        };
      });
      
      // Auto-scroll when receiving tokens
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    }
  }, [setStreamingMessages, chatContainerRef]);
  
  // Handle chat completion
  const handleChatComplete = useCallback((payload) => {
    // Store the completion message for parent handling
    setLastMessage({
      type: 'complete',
      payload
    });
    
    console.log('Chat completion received for message:', payload.messageId);
  }, []);
  
  // Reset token processor and ensure connection when the hook mounts
  useEffect(() => {
    // Removed tokenProcessor.reset() call
    
    // We don't need to manually connect, as websocketManager handles this now
    setConnected(websocketManager.isConnected);
    
    // Update connected state when socket connects/disconnects
    const connectionHandler = () => setConnected(true);
    const disconnectionHandler = () => setConnected(false);
    
    // Listen for socket connection events
    window.addEventListener('socket:connected', connectionHandler);
    window.addEventListener('socket:disconnected', disconnectionHandler);
    
    return () => {
      // Clean up event listeners
      window.removeEventListener('socket:connected', connectionHandler);
      window.removeEventListener('socket:disconnected', disconnectionHandler);
    };
  }, []);
  
  // Store the actual chat ID for use in useEffect cleanup
  const chatIdRef = useRef(chatId);
  
  // Update the ref when chatId changes
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);
  
  // Listen for message sent event to resubscribe
  useEffect(() => {
    if (!chatId) return;
    
    // Set up event listener for message sent events to resubscribe
    const unsubscribe = eventBus.subscribe('chat:messageSent', (data) => {
      if (data.chatId === chatId) {
        console.log(`Message sent in chat ${chatId}, ensuring WebSocket subscription`);
        // Force resubscribe to chat to ensure we receive streaming tokens
        if (websocketManager.isConnected) {
          websocketManager.subscribeToChat(chatId);
        }
      }
    });
    
    // Clean up the subscription when component unmounts or chat ID changes
    return () => {
      unsubscribe();
    };
  }, [chatId]);
  
  // Single useEffect for managing chat subscriptions
  useEffect(() => {
    if (!chatId) return;
    
    console.log(`Setting up subscription for chat: ${chatId}`);
    
    // Register event handlers for this specific chat
    const tokenUnsubscribe = websocketManager.on(`chat:${chatId}:token`, handleChatToken);
    const completeUnsubscribe = websocketManager.on(`chat:${chatId}:complete`, handleChatComplete);
    
    // Also register for generic events as fallback
    const genericTokenUnsubscribe = websocketManager.on('chat:token', (payload) => {
      // Check if this message belongs to our chat
      if (payload.chatId && String(payload.chatId) === String(chatId)) {
        handleChatToken(payload);
      }
    });
    
    const genericCompleteUnsubscribe = websocketManager.on('chat:complete', (payload) => {
      // Check if this message belongs to our chat
      if (payload.chatId && String(payload.chatId) === String(chatId)) {
        handleChatComplete(payload);
      }
    });
    
    // Subscribe to chat if we have a connection
    if (connected) {
      websocketManager.subscribeToChat(chatId);
    }
    
    // Handle connection changes within this effect
    const handleConnect = () => {
      if (websocketManager.isConnected) {
        websocketManager.subscribeToChat(chatId);
      }
    };
    
    // Add event listener for reconnections
    window.addEventListener('socket:connected', handleConnect);
    
    // Return cleanup function that removes event handlers but does NOT unsubscribe from chat
    // This fixes the issue where messages disappear until page reload
    return () => {
      console.log(`Cleaning up event handlers for chat: ${chatId}`);
      
      // Remove event handlers
      tokenUnsubscribe();
      completeUnsubscribe();
      genericTokenUnsubscribe();
      genericCompleteUnsubscribe();
      
      // Remove connection listener
      window.removeEventListener('socket:connected', handleConnect);
      
      // IMPORTANT: Do NOT unsubscribe from the WebSocket room
      // The server will handle this with the delayed cleanup mechanism
      // This prevents messages from disappearing when input component changes
    };
  }, [chatId, connected, handleChatToken, handleChatComplete]);
  
  // Return relevant values and methods
  return {
    connected,
    lastMessage,
    sendJsonMessage: (message) => websocketManager.send(message.type, message.payload),
    readyState: connected ? WebSocket.OPEN : WebSocket.CLOSED
  };
};

export default useWebSocketChat;
