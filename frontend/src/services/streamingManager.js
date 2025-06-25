class StreamingManager {
  constructor(existingInstance = null) {
    if (existingInstance && existingInstance.activeStreams instanceof Map && existingInstance.subscribers instanceof Map) {
      this.activeStreams = existingInstance.activeStreams;
      this.subscribers = existingInstance.subscribers;
    } else {
      this.activeStreams = new Map(); 
      this.subscribers = new Map();   
    }
  }

  init() {
  }

  handleToolStreamStarted(payload) {
    if (!payload || !payload.chatId || !payload.toolName || !payload.toolExecutionId) {
      console.warn('[StreamingManager] Received invalid tool_stream_started payload (failed validation):', payload);
      return;
    }

    const tempMessageId = `temp-tool-${payload.toolExecutionId}`;
    this.activeStreams.set(payload.toolExecutionId, {
      chatId: payload.chatId,
      toolName: payload.toolName,
      toolExecutionId: payload.toolExecutionId,
      tempMessageId: tempMessageId,
      accumulatedContent: '',
      progressUpdates: [],
      keySummaries: [], // Added for key summaries
      status: 'initializing',
      finalMessageId: null,
      errorDetails: null,
    });

    this.notifySubscribers(payload.chatId, { type: 'stream_started', streamId: payload.toolExecutionId });
  }

  handleToolStreamChunk(payload) {
    if (!payload || !payload.chatId || !payload.toolName || !payload.toolExecutionId || !payload.chunkType) {
      console.warn('[StreamingManager] Received invalid tool_stream_chunk payload:', payload);
      return;
    }

    const stream = this.activeStreams.get(payload.toolExecutionId);
    
    if (!stream) {
      console.warn(`[StreamingManager] Received chunk for unknown stream: ${payload.toolExecutionId}. Stream object not found in activeStreams.`);
      return;
    }

    let newContent = stream.accumulatedContent;
    let newProgressUpdates = stream.progressUpdates;
    let newKeySummaries = stream.keySummaries || []; // Initialize if undefined

    if (payload.chunkType === 'progress_update' && payload.data) {
      if (payload.data.content) { // Existing progress updates
        newProgressUpdates = [...stream.progressUpdates, payload.data.content];
      }
      if (payload.data.is_key_summary && payload.data.message) { // New: Handle key summaries
        console.log('[StreamingManager] Received key summary payload.data:', JSON.stringify(payload.data));
        console.log('[StreamingManager] stream.keySummaries BEFORE update:', JSON.stringify(stream.keySummaries));
        newKeySummaries = [...newKeySummaries, { message: payload.data.message, timestamp: new Date().toISOString() }];
        console.log('[StreamingManager] newKeySummaries AFTER update:', JSON.stringify(newKeySummaries));
      }
    } else if (payload.chunkType === 'partial_data' && payload.data && payload.data.content_chunk) {
      newContent += payload.data.content_chunk;
    }

    stream.accumulatedContent = newContent;
    stream.progressUpdates = newProgressUpdates;
    stream.keySummaries = newKeySummaries; // Store key summaries
    stream.status = 'streaming';

    this.activeStreams.set(payload.toolExecutionId, stream); 

    this.notifySubscribers(payload.chatId, { type: 'chunk_received', streamId: payload.toolExecutionId });
  }

  handleToolStreamComplete(payload) {
    if (!payload || !payload.chatId || !payload.toolName || !payload.toolExecutionId) {
      console.warn('[StreamingManager] Received invalid tool_stream_complete payload:', payload);
      return;
    }

    const stream = this.activeStreams.get(payload.toolExecutionId);
    if (!stream) {
      console.warn(`[StreamingManager] Received complete for unknown stream: ${payload.toolExecutionId}`);
      return;
    }

    stream.status = 'completed';
    stream.finalMessageId = payload.finalMessageId;
    this.activeStreams.set(payload.toolExecutionId, stream); 


    this.notifySubscribers(payload.chatId, { type: 'stream_completed', streamId: payload.toolExecutionId });
  }

  handleToolStreamError(payload) {
    if (!payload || !payload.chatId || !payload.toolName || !payload.toolExecutionId || !payload.error) {
      console.warn('[StreamingManager] Received invalid tool_stream_error payload:', payload);
      return;
    }

    const stream = this.activeStreams.get(payload.toolExecutionId);
    if (!stream) {
      console.warn(`[StreamingManager] Received error for unknown stream: ${payload.toolExecutionId}`);
      return;
    }

    stream.status = 'error';
    stream.errorDetails = { message: payload.error };
    this.activeStreams.set(payload.toolExecutionId, stream);

    this.notifySubscribers(payload.chatId, { type: 'stream_error', streamId: payload.toolExecutionId });
  }

  subscribe(chatId, callback) {
    const strChatId = String(chatId); 
    if (!this.subscribers.has(strChatId)) {
      this.subscribers.set(strChatId, new Set());
    }
    this.subscribers.get(strChatId).add(callback);

    // Send initial state to the new subscriber
    this.notifySubscriber(strChatId, callback, { type: 'initial_state' });
    return () => this.unsubscribe(strChatId, callback); 
  }

  unsubscribe(chatId, callback) {
    const strChatId = String(chatId); 
    if (this.subscribers.has(strChatId)) {
      this.subscribers.get(strChatId).delete(callback);
      if (this.subscribers.get(strChatId).size === 0) {
        this.subscribers.delete(strChatId);
      }
    }
  }

  notifySubscribers(chatId, event) {
    const strChatId = String(chatId); 
    if (!this.subscribers.has(strChatId)) {
      return;
    }
    this.subscribers.get(strChatId).forEach(callback => this.notifySubscriber(strChatId, callback, event));
  }

  notifySubscriber(chatId, callback, event) { 
    const currentChatIdStr = String(chatId);
    const streamsForChat = Array.from(this.activeStreams.values()).filter(stream => String(stream.chatId) === currentChatIdStr);
    
    if (streamsForChat.length === 0 && Array.from(this.activeStreams.values()).some(s => String(s.chatId) === currentChatIdStr)) {
        // Intentionally keeping this specific warn for potential race conditions or state issues.
        console.warn(`[StreamingManager] notifySubscriber: streamsForChat is empty for chatId ${currentChatIdStr}, but activeStreams contains matching entries. This might indicate an issue or a race condition if a stream just ended.`, {
            chatId: currentChatIdStr,
            activeStreamsContent: Array.from(this.activeStreams.values())
        });
    }

    try {
      callback({ ...event, streams: streamsForChat, activeStreams: this.activeStreams }); 
    } catch (error) {
      console.error(`[StreamingManager] Error notifying subscriber for chat ${chatId}:`, error);
    }
  }

  getStream(toolExecutionId) {
    return this.activeStreams.get(toolExecutionId);
  }
}

// Attempt with a global symbol for the singleton instance, trying to preserve maps
const STREAMING_MANAGER_SYMBOL = Symbol.for("app.StreamingManager");

let instance = global[STREAMING_MANAGER_SYMBOL];

if (!instance) {
  instance = new StreamingManager();
  global[STREAMING_MANAGER_SYMBOL] = instance;
} else {
  // If instance exists, but this module is re-evaluated,
  // create a new StreamingManager but pass the existing global instance
  // to its constructor so it can try to salvage the maps.
  // This is unusual but attempts to deal with aggressive HMR.
  if (!(instance instanceof StreamingManager)) { // Check if it's actually our class instance
    console.warn('[StreamingManager] Global symbol had a value, but not an instance of StreamingManager. Re-creating.');
    instance = new StreamingManager();
    global[STREAMING_MANAGER_SYMBOL] = instance;
  } else {
    // It is an instance. If this code runs again (module re-evaluation),
    // we don't want to call `new StreamingManager(instance)` again if `instance` is already the one we want.
    // The constructor log will tell us if `new StreamingManager()` is called.
    // No explicit re-creation here if `instance` is already a `StreamingManager`.
  }
}

export default instance;
