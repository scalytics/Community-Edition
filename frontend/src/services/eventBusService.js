/**
 * Event Bus Service
 * This service provides a bridge between backend EventBus events and the browser's event system
 */

class EventBusService {
  constructor() {
    this.initialized = false;
    this.downloadListeners = new Map();
    this.connected = false;
  }

  /**
   * Initialize the event bus service and set up WebSocket listeners
   */
  initialize() {
    if (this.initialized) return;
    
    // Set up global event handlers for WebSocket messages
    if (typeof window !== 'undefined') {
      // Create a global handler for WebSocket messages that will dispatch browser events
      const originalAddEventListener = window.addEventListener;
      const originalRemoveEventListener = window.removeEventListener;

      // The global handler window._handleDownloadEvent is no longer needed.
      // socketService.js now dispatches CustomEvents directly.

      // Overwrite addEventListener to track download events
      window.addEventListener = (eventName, handler, options) => {
        if (eventName.startsWith('download:')) {
          if (!this.downloadListeners.has(eventName)) {
            this.downloadListeners.set(eventName, new Set());
          }
          this.downloadListeners.get(eventName).add(handler);
        }
        
        return originalAddEventListener.call(window, eventName, handler, options);
      };
      
      // Overwrite removeEventListener to track download events
      window.removeEventListener = (eventName, handler, options) => {
        if (eventName.startsWith('download:')) {
          const listeners = this.downloadListeners.get(eventName);
          if (listeners) {
            listeners.delete(handler);
            if (listeners.size === 0) {
              this.downloadListeners.delete(eventName);
            }
          }
        }
        
        return originalRemoveEventListener.call(window, eventName, handler, options);
      };
      
      this.initialized = true;
      // console.log('[EventBusService] Initialized'); // Removed log
    }
  }

  /**
   * Manually dispatch a download event (can be used from WebSocket handlers)
   * @param {string} downloadId - Download ID
   * @param {string} type - Event type (progress, complete, error)
   * @param {Object} data - Event data
   */
  dispatchDownloadEvent(downloadId, type, data) {
    if (typeof window === 'undefined') return;
    
    const payload = {
      downloadId,
      ...data
    };
    
    // Dispatch as a browser CustomEvent
    const event = new CustomEvent(`download:${downloadId}:${type}`, {
      detail: payload,
      bubbles: true
    });
    
    window.dispatchEvent(event);
    
    console.log(`[EventBusService] Manually dispatched download event: ${type}`, payload);
  }
}

// Create a singleton instance
const eventBusService = new EventBusService();

// Initialize by default
eventBusService.initialize();

export default eventBusService;
