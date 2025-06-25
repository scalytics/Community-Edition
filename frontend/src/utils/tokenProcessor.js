/**
 * Enhanced frontend token processor for streaming chat responses
 * 
 * This utility helps:
 * 1. Filter out thinking/reasoning content from LLM responses
 * 2. Sanitize markdown content during streaming
 * 3. Handle various LLM-specific formatting tags
 * 4. Ensure proper code block rendering
 * 5. Manage timezone-aware timestamps
 */
import ModelProcessingService from '../models/ModelProcessingService';

/**
 * Lightweight wrapper around ModelProcessingService for backward compatibility
 * 
 * This maintains the existing API while delegating the actual processing
 * to the centralized model processors. This allows existing components
 * to continue functioning while we transition to the new architecture.
 */
const tokenProcessor = {
  // Maintain minimal state for backward compatibility
  buffer: '',
  lastModelFamily: null,
  
  /**
   * Process an incoming token for display with enhanced sanitization
   * @param {string} token - Raw token from the LLM
   * @param {string} modelFamily - Optional model family hint for optimization
   * @returns {string|null} Processed token or null if should be filtered
   */
  processToken: function(token, modelFamily = null) {
    // Delegate to the centralized service
    this.lastModelFamily = modelFamily || this.lastModelFamily;
    return ModelProcessingService.processToken(token, this.lastModelFamily);
  },
  
  /**
   * Process a complete message all at once with optimized sanitization
   * @param {string} message - Complete message from LLM
   * @param {string} modelFamily - Optional model family hint for optimization
   * @returns {string} Processed user-friendly message
   */
  processCompleteMessage: function(message, modelFamily = null) {
    // Delegate to the centralized service
    return ModelProcessingService.processCompleteMessage(message, modelFamily);
  },
  
  /**
   * Reset the state for a new message/token stream
   */
  reset: function() {
    // Reset our internal state
    this.buffer = '';
    // Don't reset lastModelFamily as it may persist across messages
    
    // Reset the service as well
    ModelProcessingService.reset();
  },
  
  /**
   * Format date for storage in a timezone-aware format
   * @param {Date} date - The date object to format
   * @returns {string} ISO string with timezone offset
   */
  formatDateForStorage: function(date = new Date()) {
    // Use toISOString for consistent UTC format as base
    return date.toISOString();
  },
  
  /**
   * Parse a stored date string and format it according to the user's browser timezone
   * @param {string} dateString - ISO date string
   * @param {Object} options - Intl.DateTimeFormat options
   * @returns {string} Formatted date string in user's timezone
   */
  formatDateForDisplay: function(dateString, options = {}) {
    const date = new Date(dateString);
    const userLocale = navigator.language || 'en-US';
    
    // Default options for date formatting
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    
    // Merge default options with provided options
    const formatOptions = { ...defaultOptions, ...options };
    
    // Format date using browser's timezone and locale
    return new Intl.DateTimeFormat(userLocale, formatOptions).format(date);
  },
  
  /**
   * Get the user's current timezone
   * @returns {string} Timezone name or offset
   */
  getUserTimezone: function() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      // Fallback to offset if timeZone is not available
      const offset = new Date().getTimezoneOffset();
      const hours = Math.abs(Math.floor(offset / 60));
      const minutes = Math.abs(offset % 60);
      const sign = offset > 0 ? '-' : '+';
      return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
};

export default tokenProcessor;
