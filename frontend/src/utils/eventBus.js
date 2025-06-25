/**
 * Simple client-side event bus for cross-component communication
 * Enables decoupled event-driven architecture in the frontend
 */

class EventBus {
  constructor() {
    this.subscribers = {};
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Event to subscribe to
   * @param {Function} callback - Function to call when event occurs
   * @returns {Function} - Unsubscribe function
   */
  subscribe(eventName, callback) {
    if (!this.subscribers[eventName]) {
      this.subscribers[eventName] = [];
    }
    
    this.subscribers[eventName].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers[eventName] = this.subscribers[eventName].filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Publish an event
   * @param {string} eventName - Event name to publish
   * @param {...any} args - Arguments to pass to subscribers
   */
  publish(eventName, ...args) {
    if (!this.subscribers[eventName]) {
      return;
    }
    
    this.subscribers[eventName].forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event subscriber for ${eventName}:`, error);
      }
    });
  }

  /**
   * Remove all subscribers for an event
   * @param {string} eventName - Event to unsubscribe from
   */
  unsubscribeAll(eventName) {
    if (eventName) {
      delete this.subscribers[eventName];
    } else {
      this.subscribers = {};
    }
  }
}

// Export a singleton instance
const eventBus = new EventBus();
export default eventBus;
