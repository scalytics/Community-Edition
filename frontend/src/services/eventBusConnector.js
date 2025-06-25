/**
 * Event Bus Connector
 * This module connects WebSocket events to browser custom events
 * for communication between the backend and frontend
 */

// Create a globally accessible function to dispatch download events
window.dispatchDownloadEvent = (type, downloadId, data) => {
  if (!downloadId) return;
  
  // Create payload object
  const payload = {
    downloadId,
    ...data
  };
  
  // Create a custom event
  const event = new CustomEvent(`download:${downloadId}:${type}`, {
    detail: payload,
    bubbles: true
  });
  
  // Dispatch the event on the window
  window.dispatchEvent(event);
  
  console.log(`[EventBusConnector] Dispatched event: ${type} for download ${downloadId}`);
};

// Create a WebSocket-based event bridge
class EventBusConnector {
  constructor() {
    this.initialized = false;
  }
  
  initialize() {
    if (this.initialized) return;

    // socketService.js now dispatches CustomEvents directly.

    // Start testing whether events are working by dispatching a test event
    // console.log('[EventBusConnector] Initialized and ready for events'); // Removed log
    
    // Mark as initialized
    this.initialized = true;
  }
}

const connector = new EventBusConnector();
connector.initialize();

// Assign the object to a named constant
const eventBusService = {
  dispatchEvent: window.dispatchDownloadEvent,
  connector
};

// Export the named constant as default
export default eventBusService;
