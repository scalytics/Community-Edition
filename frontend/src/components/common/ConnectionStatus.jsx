import React, { useState, useEffect } from 'react';
import { websocketManager } from '../../services/websocketManager';

/**
 * Connection status component that displays the current WebSocket connection status
 * and attempts to reconnect when disconnected
 */
const ConnectionStatus = () => {
  const [connected, setConnected] = useState(websocketManager.isConnected);
  const [reconnecting, setReconnecting] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [hideTimeout, setHideTimeout] = useState(null);

  // Listen for WebSocket connection events
  useEffect(() => {
    const handleConnected = () => {
      setConnected(true);
      setReconnecting(false);
      
      // Show success message briefly
      setShowStatus(true);
      
      // Hide after 3 seconds
      if (hideTimeout) clearTimeout(hideTimeout);
      const timeout = setTimeout(() => {
        setShowStatus(false);
      }, 3000);
      setHideTimeout(timeout);
    };
    
    const handleDisconnected = () => {
      setConnected(false);
      setReconnecting(true);
      setShowStatus(true);
      
      // Don't auto-hide disconnected state
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        setHideTimeout(null);
      }
    };
    
    // Register event listeners
    window.addEventListener('socket:connected', handleConnected);
    window.addEventListener('socket:disconnected', handleDisconnected);
    
    // Set initial state
    setConnected(websocketManager.isConnected);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('socket:connected', handleConnected);
      window.removeEventListener('socket:disconnected', handleDisconnected);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);
  
  // Handle manual reconnect
  const handleReconnect = () => {
    if (!connected) {
      setReconnecting(true);
      websocketManager.connect()
        .catch(error => {
          console.error('Failed to reconnect:', error);
        });
    }
  };
  
  // If there's no connection issue, don't show anything
  if (!showStatus) {
    return null;
  }
  
  return (
    <div 
      className={`fixed bottom-4 left-4 z-50 rounded-lg shadow-lg p-3 flex items-center space-x-2 transition-all duration-300 ${
        connected ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
      }`}
    >
      {/* Status indicator circle */}
      <div 
        className={`h-3 w-3 rounded-full ${
          connected ? 'bg-green-500' : (reconnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500')
        }`}
      ></div>
      
      {/* Status text */}
      <span className="font-medium text-sm">
        {connected 
          ? 'Connected' 
          : (reconnecting 
              ? 'Reconnecting...' 
              : 'Connection lost'
            )
        }
      </span>
      
      {/* Reconnect button (only shown when disconnected and not reconnecting) */}
      {!connected && !reconnecting && (
        <button
          onClick={handleReconnect}
          className="ml-2 px-2 py-1 bg-red-200 hover:bg-red-300 text-red-800 text-xs rounded-md transition-colors"
        >
          Reconnect
        </button>
      )}
      
      {/* Close button */}
      <button 
        onClick={() => setShowStatus(false)}
        className="ml-2 text-gray-500 hover:text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

export default ConnectionStatus;
