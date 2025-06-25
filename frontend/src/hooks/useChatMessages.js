import { useState, useCallback, useRef, useEffect } from 'react';
import chatService from '../services/chatService';
import { websocketManager } from '../services/websocketManager';
import tokenProcessor from '../utils/tokenProcessor';
import eventBus from '../utils/eventBus';
import streamingManager from '../services/streamingManager';
import { applyFilters } from '../services/frontendFilteringService'; 

/**
 * Custom hook to manage chat message sending, error handling, and WebSocket streaming logic
 * @param {string|number} chatId The ID of the current chat
 * @param {Object} chat The current chat object (passed as prop, might be slightly stale in callbacks)
 * @param {Function} setChat Function to update chat state (provides access to latest state)
 * @param {Function} onChatUpdated Optional callback when chat is updated
 * @returns {Object} Message sending state, handlers and utilities
 */
const useChatMessages = (chatId, chat, setChat, onChatUpdated) => {
  const [sending, setSending] = useState(false);
  const [inlineError, setInlineError] = useState(null);
  const [apiKeyError, setApiKeyError] = useState(null);
  const chatContainerRef = useRef(null); 
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState({});
  const processedCompletionIds = useRef(new Set());
  const currentNumericIdRef = useRef(null);
  const [isToolStreamingThisChat, setIsToolStreamingThisChat] = useState(false);
  const [currentToolExecutionId, setCurrentToolExecutionId] = useState(null);
  const isToolStreamingThisChatRef = useRef(isToolStreamingThisChat); 
  const handleChatTokenRef = useRef(null);
  const handleStreamingCompleteRef = useRef(null);
  const handleChatErrorRef = useRef(null); 
  const handleNewMessageRef = useRef(null); 

  // Define Callbacks first
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, []);

  const handleFeedbackUpdate = useCallback((messageId, newRating) => {
    setChat(prevChat => {
      if (!prevChat || !prevChat.messages) {
        return prevChat;
      }
      const messageIndex = prevChat.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        console.warn(`[useChatMessages] handleFeedbackUpdate: Could not find message with ID ${messageId}`);
        return prevChat; 
      }

      const updatedMessages = [...prevChat.messages];
      const updatedRating = newRating === 0 ? null : newRating; 

      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        user_feedback_rating: updatedRating
      };
      const newState = {
        ...prevChat,
        messages: updatedMessages
      };
      return newState;
    });
  }, [setChat]);

  const handleScroll = useCallback(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 200;
      setShowScrollButton(isScrolledUp);
    }
  }, []);

  // useEffect for streamingManager
  useEffect(() => {
    if (!chatId) return;

    const handleStreamUpdate = (event) => {
      const { type, streamId, streams } = event;

      if (!streams || streams.length === 0) {
        return;
      }

      streams.forEach((stream, index) => {
        if (String(stream.chatId) !== String(chatId)) { 
          return;
        }

        if (type === 'stream_started' && stream.toolExecutionId === streamId) {
          setTimeout(() => {
            setChat(prev => ({
              ...prev,
              messages: [...(prev?.messages || []), {
                id: stream.tempMessageId,
                role: 'assistant',
                content: '', 
                tool_id: stream.toolName,
                isLoading: true, 
                created_at: new Date().toISOString(),
              }],
            }));
            setIsToolStreamingThisChat(true);
            setCurrentToolExecutionId(stream.toolExecutionId);
            scrollToBottom();
          }, 0);
        } else if (type === 'chunk_received' && stream.toolExecutionId === streamId) {
          // Log received keySummaries from stream object
          if (stream.keySummaries && stream.keySummaries.length > 0) {
            console.log('[useChatMessages] chunk_received - stream.keySummaries:', JSON.stringify(stream.keySummaries));
          }
          if (stream.progressUpdates && stream.progressUpdates.length > 0) {
            const latestProgress = stream.progressUpdates[stream.progressUpdates.length - 1];
            setTimeout(() => {
              setChat(prev => {
                if (!prev || !prev.messages) return prev;
                const msgIndex = prev.messages.findIndex(m => m.id === stream.tempMessageId);
              if (msgIndex !== -1) {
                if (prev.messages[msgIndex].content !== latestProgress || prev.messages[msgIndex].keySummaries !== stream.keySummaries) {
                  const updatedMessages = [...prev.messages];
                  updatedMessages[msgIndex] = {
                    ...updatedMessages[msgIndex],
                    content: latestProgress,
                    keySummaries: stream.keySummaries, // Add keySummaries here
                  };
                  return { ...prev, messages: updatedMessages };
                }
              }
              return prev;
            });
            }, 0);
          }

          if (stream.accumulatedContent && stream.accumulatedContent !== (streamingMessages[stream.tempMessageId] || '')) {
            setStreamingMessages(prev => ({
              ...prev,
              [stream.tempMessageId]: stream.accumulatedContent,
            }));
          }
          scrollToBottom();
        } else if (type === 'stream_completed' && stream.toolExecutionId === streamId) {
          setStreamingMessages(prev => {
            const newState = { ...prev };
            delete newState[stream.tempMessageId];
            return newState;
          });
          setChat(prev => {
            if (!prev || !prev.messages) return prev;
            let updatedMessages = [...prev.messages]; 
            const finalMsgIdToUse = stream.finalMessageId || stream.tempMessageId; 
            const finalContentToUse = streamingMessages[stream.tempMessageId] || stream.accumulatedContent || ''; 

            const existingFinalMsgIndex = updatedMessages.findIndex(m => m.id === finalMsgIdToUse);

            if (existingFinalMsgIndex !== -1) { 
              updatedMessages[existingFinalMsgIndex] = { 
                ...updatedMessages[existingFinalMsgIndex], 
                content: finalContentToUse, 
                isLoading: false,
                keySummaries: stream.keySummaries, // Add keySummaries here
              };
              if (stream.tempMessageId && stream.tempMessageId !== finalMsgIdToUse) {
                 updatedMessages = updatedMessages.filter(m => m.id !== stream.tempMessageId);
              }
            } else { 
              const tempMsgIndex = updatedMessages.findIndex(m => m.id === stream.tempMessageId);
              if (tempMsgIndex !== -1) { 
                updatedMessages[tempMsgIndex] = { 
                  ...updatedMessages[tempMsgIndex], 
                  id: finalMsgIdToUse, 
                  content: finalContentToUse,
                  isLoading: false,
                  keySummaries: stream.keySummaries, // Add keySummaries here
                };
              } else { 
                console.warn(`[stream_completed] Neither finalMessageId (${finalMsgIdToUse}) nor tempMessageId (${stream.tempMessageId}) found for update. Adding as new.`);
                updatedMessages.push({
                    id: finalMsgIdToUse,
                    role: 'assistant',
                    content: finalContentToUse,
                    tool_id: stream.toolName,
                    isLoading: false,
                    created_at: new Date().toISOString(),
                    keySummaries: stream.keySummaries, // Add keySummaries here
                });
              }
            }
            return { ...prev, messages: updatedMessages };
          });
          if (stream.toolExecutionId === currentToolExecutionId) {
            setIsToolStreamingThisChat(false);
            setCurrentToolExecutionId(null);
          }
          setSending(false);
        } else if (type === 'stream_error' && stream.toolExecutionId === streamId) {
          setChat(prev => {
            if (!prev || !prev.messages) return prev;
            const msgIndex = prev.messages.findIndex(m => m.id === stream.tempMessageId);
            if (msgIndex !== -1) {
              const updatedMessages = [...prev.messages];
              const detailedError = stream.errorDetails?.message || 'Unknown error';
              console.error(`[StreamingManager Error] Tool: ${stream.toolName}, ExecutionID: ${stream.toolExecutionId}, Details:`, detailedError);

              let userFriendlyMessage = `An error occurred while running ${stream.toolName}. Please try again later.`;
              if (typeof detailedError === 'string') {
                if (detailedError.includes('RateLimitError') || detailedError.includes('RESOURCE_EXHAUSTED') || detailedError.includes('quota')) {
                  userFriendlyMessage = `The ${stream.toolName} tool could not complete because an API rate limit or quota was exceeded. Please check your API plan or try again later.`;
                } else if (detailedError.includes('ServiceUnavailableError') || detailedError.includes('service is currently unavailable')) {
                  userFriendlyMessage = `The ${stream.toolName} tool could not complete because an external service is temporarily unavailable. Please try again later.`;
                } else if (detailedError.includes('API key not valid')) {
                  userFriendlyMessage = `The ${stream.toolName} tool could not complete due to an invalid API key. Please check your API key configuration.`;
                } else if (detailedError.includes('InternalServerError') || detailedError.toLowerCase().includes('internal error has occurred')) {
                  userFriendlyMessage = `The ${stream.toolName} tool encountered an internal server error with the AI model provider. This is usually a temporary issue. Please try again in a few moments.`;
                }
              }
              
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: userFriendlyMessage,
                isLoading: false,
                isError: true,
              };
              return { ...prev, messages: updatedMessages };
            }
            return prev;
          });
          setStreamingMessages(prev => {
            const newState = { ...prev };
            delete newState[stream.tempMessageId];
            return newState;
          });
          if (stream.toolExecutionId === currentToolExecutionId) {
            setIsToolStreamingThisChat(false);
            setCurrentToolExecutionId(null);
          }
          setSending(false);
        }
      });
    };

    const unsubscribe = streamingManager.subscribe(chatId, handleStreamUpdate);

    return () => {
      unsubscribe();
    };
  }, [chatId, setChat, scrollToBottom, currentToolExecutionId, streamingMessages]);

  useEffect(() => {
    isToolStreamingThisChatRef.current = isToolStreamingThisChat;
  }, [isToolStreamingThisChat]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (isToolStreamingThisChatRef.current) {
        event.preventDefault();
        event.returnValue = ''; 
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []); 

  useEffect(() => {
    if (!chatId) return;
    tokenProcessor.reset();
    processedCompletionIds.current = new Set();

    const tokenHandlerWrapper = (payload) => handleChatTokenRef.current && handleChatTokenRef.current(payload);
    const completeHandlerWrapper = (payload) => handleStreamingCompleteRef.current && handleStreamingCompleteRef.current(payload);
    const errorHandlerWrapper = (payload) => handleChatErrorRef.current && handleChatErrorRef.current(payload);
    const newMessageHandlerWrapper = (payload) => handleNewMessageRef.current && handleNewMessageRef.current(payload);

    const streamStartedHandler = (payload) => {
      if (payload && payload.tempId && payload.numericId) {
        currentNumericIdRef.current = payload.numericId;
      }
    };

    const tokenUnsubscribe = websocketManager.on(`chat:${chatId}:token`, tokenHandlerWrapper);
    const completeUnsubscribe = websocketManager.on(`chat:${chatId}:complete`, completeHandlerWrapper);
    const errorUnsubscribe = websocketManager.on(`chat:${chatId}:error`, errorHandlerWrapper);
    const startedUnsubscribe = websocketManager.on(`chat:${chatId}:stream_started`, streamStartedHandler);
    const newMessageUnsubscribe = websocketManager.on(`chat:${chatId}:new_message`, newMessageHandlerWrapper);

    if (websocketManager.isConnected) {
      websocketManager.subscribeToChat(chatId);
    }
    const handleConnect = () => {
      if (websocketManager.isConnected) {
        websocketManager.subscribeToChat(chatId);
      }
    };
    window.addEventListener('socket:connected', handleConnect);

    return () => {
      window.removeEventListener('socket:connected', handleConnect);
      tokenUnsubscribe();
      completeUnsubscribe();
      errorUnsubscribe();
      startedUnsubscribe();
      newMessageUnsubscribe();
    };
  }, [chatId, setChat, scrollToBottom]); 

  handleChatTokenRef.current = (payload) => {
    if (!payload.token) return;
    const rawToken = payload.token;

    setChat(prevChat => {
      const currentMessages = prevChat?.messages || [];
      const loadingMessage = currentMessages.findLast(m => m.role === 'assistant' && m.isLoading === true);

      if (!loadingMessage) {
        console.warn(`Could not find loading message for token processing. Payload ID: ${payload.messageId}`);
      } else {
        const targetId = loadingMessage.id;
        setStreamingMessages(prevStreaming => {
          const currentContent = prevStreaming[targetId] || '';
          const newContent = currentContent + rawToken;
          if (!rawToken || rawToken.trim() === '') return prevStreaming;
          if (currentContent === newContent) return prevStreaming; 
          return { ...prevStreaming, [targetId]: newContent };
        });
      }
      return prevChat;
    });

    requestAnimationFrame(scrollToBottom); 
  };

  handleStreamingCompleteRef.current = (payload) => {
    const finalMessageId = payload.finalMessageId || payload.messageId;
    if (!finalMessageId) {
      console.error("[useChatMessages] Ref Handler: Received completion event without a final message ID.", payload);
      setSending(false);
      return;
    }
    if (processedCompletionIds.current.has(finalMessageId)) {
      setSending(false);
      return;
    }

    const finalMessageContent = tokenProcessor.processCompleteMessage(payload.message || '');

    setChat((prevChat) => {
      if (!prevChat || !prevChat.messages) return prevChat;

      const chatUpdates = {};
      const newTitleFromPayload = payload.chatTitle || payload.updatedChat?.title;

      if (newTitleFromPayload) {
        chatUpdates.title = newTitleFromPayload;
        eventBus.publish('chat:titleChanging', { chatId: chatId, newTitle: newTitleFromPayload });
      }
      if (payload.updated_at) { 
        chatUpdates.updated_at = payload.updated_at;
      }
      if (payload.updatedChat) {
        const { title, ...otherUpdates } = payload.updatedChat; 
        Object.assign(chatUpdates, otherUpdates);
        if (title && !newTitleFromPayload) { 
          chatUpdates.title = title;
          eventBus.publish('chat:titleChanging', { chatId: chatId, newTitle: title });
        }
      }

      let updatedMessages = [...prevChat.messages];
      const tempLoadingMessageIndex = updatedMessages.findLastIndex(m => m.role === 'assistant' && m.isLoading === true);
      const tempLoadingMessage = tempLoadingMessageIndex !== -1 ? updatedMessages[tempLoadingMessageIndex] : null;
      
      const existingFinalMessageIndex = updatedMessages.findIndex(m => m.id === finalMessageId);

      if (existingFinalMessageIndex !== -1) {
        updatedMessages[existingFinalMessageIndex] = {
          ...updatedMessages[existingFinalMessageIndex],
          content: finalMessageContent,
          isLoading: false,
          created_at: payload.timestamp || updatedMessages[existingFinalMessageIndex].created_at || new Date().toISOString(),
        };
        if (tempLoadingMessage && tempLoadingMessage.id !== finalMessageId) { 
          updatedMessages = updatedMessages.filter((msg, index) => index !== tempLoadingMessageIndex);
        }
      } else if (tempLoadingMessageIndex !== -1) {
        updatedMessages[tempLoadingMessageIndex] = {
          ...updatedMessages[tempLoadingMessageIndex], 
          id: finalMessageId,
          content: finalMessageContent,
          isLoading: false,
          created_at: payload.timestamp || new Date().toISOString(),
        };
      } else {
        console.warn(`[useChatMessages] handleStreamingComplete: No temp loading message and no existing final message (ID: ${finalMessageId}). Adding as new.`);
        updatedMessages.push({
          id: finalMessageId,
          role: 'assistant',
          content: finalMessageContent,
          created_at: payload.timestamp || new Date().toISOString(),
          isLoading: false,
        });
      }
      
      if (tempLoadingMessage) {
        setStreamingMessages(prevStreaming => {
          const newState = { ...prevStreaming };
          if (newState.hasOwnProperty(tempLoadingMessage.id)) {
            delete newState[tempLoadingMessage.id];
          }
          return newState;
        });
      }

      return { ...prevChat, ...chatUpdates, messages: updatedMessages };
    });

    processedCompletionIds.current.add(finalMessageId);
    setSending(false);
    currentNumericIdRef.current = null;
    if (typeof onChatUpdated === 'function') {
      onChatUpdated(); 
    }
    requestAnimationFrame(scrollToBottom); 
  };

  handleChatErrorRef.current = (payload) => {
    console.error(`[useChatMessages] Received chat:error event for message ${payload.messageId}:`, payload.error);
    setChat((prevChat) => {
      if (!prevChat || !prevChat.messages) return prevChat;
      const tempMessageIndex = prevChat.messages.findLastIndex(m => m.role === 'assistant' && m.isLoading === true && m.id === payload.messageId);
      if (tempMessageIndex !== -1) {
        const updatedMessages = [...prevChat.messages];
        updatedMessages[tempMessageIndex] = {
          ...updatedMessages[tempMessageIndex],
          content: `Error: ${payload.error || 'An unknown error occurred.'}`,
          isLoading: false,
          isError: true
        };
        setStreamingMessages(prevStreaming => {
          const newState = { ...prevStreaming };
          if (newState.hasOwnProperty(payload.messageId)) {
            delete newState[payload.messageId];
          }
          return newState;
        });
        return { ...prevChat, messages: updatedMessages };
      }
      return prevChat;
    });
    setSending(false);
    currentNumericIdRef.current = null;
  };

  handleNewMessageRef.current = async (newMessage) => {
    if (!newMessage || !newMessage.id) {
      console.warn('[useChatMessages] Received invalid new_message payload:', newMessage);
      return;
    }

    let finalMessageData = { ...newMessage }; 

    if (finalMessageData.role === 'assistant' && finalMessageData.content) {
      try {
        finalMessageData.content = await applyFilters(finalMessageData.content, chat?.user_id || null);
      } catch (filterError) {
        console.error('[useChatMessages] Error applying filters to new message:', filterError);
      }
    }

    setChat(prevChat => {
      const chatUpdates = {};
      const newTitleFromNewMessage = finalMessageData.chatTitle || finalMessageData.updatedChat?.title;

      if (newTitleFromNewMessage) {
        chatUpdates.title = newTitleFromNewMessage;
        eventBus.publish('chat:titleChanging', { chatId: chatId, newTitle: newTitleFromNewMessage });
      }
      if (finalMessageData.chat_updated_at) { 
        chatUpdates.updated_at = finalMessageData.chat_updated_at;
      }
      if (finalMessageData.updatedChat) {
        const { title, ...otherUpdates } = finalMessageData.updatedChat; 
        Object.assign(chatUpdates, otherUpdates);
        if (title && !newTitleFromNewMessage) { 
          chatUpdates.title = title;
          eventBus.publish('chat:titleChanging', { chatId: chatId, newTitle: title });
        }
      }

      let updatedMessages = [...(prevChat?.messages || [])];
      const existingMsgIndex = updatedMessages.findIndex(msg => msg.id === finalMessageData.id);

      if (existingMsgIndex !== -1) {
        updatedMessages[existingMsgIndex] = { ...updatedMessages[existingMsgIndex], ...finalMessageData, isLoading: false };
      } else {
        if (finalMessageData.role === 'user') {
          const tempUserMsgIndex = updatedMessages.findLastIndex(
            m => m.role === 'user' && 
                 typeof m.id === 'string' && 
                 m.id.startsWith('temp-user-') && 
                 m.content === finalMessageData.content 
          );
          if (tempUserMsgIndex !== -1) {
            updatedMessages[tempUserMsgIndex] = { ...finalMessageData, files: updatedMessages[tempUserMsgIndex].files }; 
          } else {
            updatedMessages.push(finalMessageData);
          }
        } else {
          const optimisticAssistantMsgIndex = updatedMessages.findLastIndex(
            m => m.role === 'assistant' && typeof m.id === 'string' && m.id.startsWith('temp-assistant-') && m.isLoading === true
          );
          if (optimisticAssistantMsgIndex !== -1) {
            updatedMessages[optimisticAssistantMsgIndex] = {
              ...updatedMessages[optimisticAssistantMsgIndex], 
              ...finalMessageData, 
              isLoading: true, 
            };
            currentNumericIdRef.current = finalMessageData.id; 
          } else {
            updatedMessages.push(finalMessageData);
            if (finalMessageData.role === 'assistant' && finalMessageData.isLoading) {
              currentNumericIdRef.current = finalMessageData.id;
            }
          }
        }
      }
      return { ...prevChat, ...chatUpdates, messages: updatedMessages };
    });
    if (typeof onChatUpdated === 'function') {
      onChatUpdated(); 
    }
    requestAnimationFrame(scrollToBottom);
  };

  // Corrected handleSendMessage to accept isImagePrompt
  const handleSendMessage = useCallback(async (message, files = [], isImagePrompt = false) => {
    if ((!message.trim() && (!files || files.length === 0)) || sending) return;
    setSending(true);
    setInlineError(null);
    setApiKeyError(null);
    scrollToBottom();
    const tempUserMessage = { id: `temp-user-${Date.now()}`, role: 'user', content: message, created_at: new Date().toISOString(), files };
    const tempAssistantMessage = { id: `temp-assistant-${Date.now()}`, role: 'assistant', content: '', created_at: new Date().toISOString(), isLoading: true };
    setChat(prev => ({ ...prev, messages: [...(prev?.messages || []), tempUserMessage, tempAssistantMessage] }));
    try {
      // Pass isImagePrompt to the frontend chatService
      chatService.sendMessage(chatId, message, files, isImagePrompt);

      setTimeout(() => {
        if (typeof onChatUpdated === 'function') {
          onChatUpdated();
        }
        eventBus.publish('chat:messageSent', { chatId });
      }, 0);

    } catch (err) {
      console.error('Error initiating message send:', err);
      setInlineError({ message: 'Failed to initiate message send', detail: err.message || 'Please check connection.', type: 'send_error', timestamp: Date.now() });
      setTimeout(() => setInlineError(null), 8000);
      setChat(prev => ({ ...prev, messages: prev.messages.filter(msg => msg.id !== tempUserMessage.id && msg.id !== tempAssistantMessage.id) }));
      setSending(false);
    }
  }, [chatId, scrollToBottom, sending, setChat, onChatUpdated]);

  const handleRunToolInChat = useCallback(async (toolName, toolArgs) => {
    if (sending) return; 
    setSending(true);
    setInlineError(null);
    setApiKeyError(null);
    scrollToBottom();

    const userTriggerContent = toolArgs.query || `Running tool: ${toolName}`;
    const tempUserTriggerMessage = {
      id: `temp-user-tool-trigger-${Date.now()}`,
      role: 'user',
      content: userTriggerContent,
      created_at: new Date().toISOString(),
    };

    setChat(prev => ({
      ...prev,
      messages: [...(prev?.messages || []), tempUserTriggerMessage],
    }));

    try {
      await chatService.runToolInChat(chatId, toolName, toolArgs); 
      
      setTimeout(() => {
        if (typeof onChatUpdated === 'function') {
          onChatUpdated();
        }
      }, 0);

    } catch (err) {
      console.error(`Error initiating tool ${toolName}:`, err);
      const errorResponseMessage = {
        id: `temp-tool-error-${Date.now()}`,
        role: 'assistant', 
        content: `Error starting tool ${toolName}: ${err.message}`,
        isLoading: false,
        isError: true,
        created_at: new Date().toISOString(),
      };
      setChat(prev => ({
        ...prev,
        messages: [...(prev?.messages || []), errorResponseMessage],
      }));
      setSending(false); 
    }
  }, [chatId, scrollToBottom, sending, setChat, onChatUpdated]);


  return {
    sending,
    streamingMessages,
    inlineError,
    setInlineError,
    apiKeyError,
    setApiKeyError,
    chatContainerRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    handleSendMessage,
    handleRunToolInChat,
    handleFeedbackUpdate,
    currentNumericIdRef,
    isToolStreamingThisChat,
    currentToolExecutionId,
  };
};

export default useChatMessages;
