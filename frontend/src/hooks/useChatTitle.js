import { useState, useRef, useCallback, useEffect } from 'react';
import chatService from '../services/chatService';
import eventBus from '../utils/eventBus';
import { websocketManager } from '../services/websocketManager'; // Import websocketManager

/**
 * Custom hook to manage chat title editing functionality
 * @param {Object} chat The current chat object
 * @param {Function} setChat Function to update chat state
 * @param {Function} setError Function to set error state
 * @param {Function} onChatUpdated Optional callback when chat is updated
 * @returns {Object} Title editing state and handlers
 */
const useChatTitle = (chat, setChat, setError, onChatUpdated) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(''); // Input field state during editing
  const [renamingInProgress, setRenamingInProgress] = useState(false);
  const titleInputRef = useRef(null);

  // Reset title input state (used on cancel)
  const resetTitle = useCallback(() => {
    // Set the input field back to the current chat title
    setNewTitle(chat?.title || 'New Chat');
  }, [chat?.title]); // Explicitly depend on chat.title

  // Start chat title editing
  const handleStartEditing = useCallback(() => {
    // Set the input field value to the current chat title when editing begins
    setNewTitle(chat?.title || 'New Chat');
    setIsEditing(true);
    // Focus input after state update
    setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, 0);
  }, [chat?.title]); // Depend on chat.title

  // Cancel chat title editing
  const handleCancelEditing = useCallback(() => {
    setIsEditing(false);
    resetTitle();
  }, [resetTitle]);

  // Handle title input change
  const handleTitleChange = useCallback((e) => {
    setNewTitle(e.target.value);
  }, []);

  // Save new chat title (defined before handleTitleKeyPress)
  const handleSaveTitle = useCallback(async () => {
    // Validate title - at least prevent empty titles
    if (!newTitle.trim() || !chat?.id) {
      setNewTitle(chat?.title || 'New Chat'); // Reset input if invalid
      setIsEditing(false);
      return;
    }

    try {
      setRenamingInProgress(true);
      const finalTitle = newTitle.trim();

      // Optimistically update the UI in ChatView immediately
      setChat(prev => ({ ...prev, title: finalTitle }));
      setIsEditing(false); // Exit edit mode right away

      // Make the API call to save the title
      const updatedChat = await chatService.updateChat(chat.id, { title: finalTitle });

      // Update the state with the confirmed data from the server
      // BUT preserve messages array from previous state if it's missing in the API response
      setChat(prevChat => {
        // If updatedChat doesn't have messages but previous state did, preserve them
        if (!updatedChat.messages && prevChat.messages) {
          return {
            ...updatedChat,
            messages: prevChat.messages
          };
        }
        return updatedChat;
      });

      // Use setTimeout to ensure state update has likely propagated before event
      setTimeout(() => {
        // Publish the event *after* the API call is successful and state is updated
        // This ensures ChatList gets the confirmed update with the correct data
        eventBus.publish('chat:titleUpdated', {
          chatId: chat.id,
          newTitle: finalTitle,
          chat: updatedChat // Send the confirmed chat data
        });
      }, 0);

      // // Notify parent component (ChatPage) if needed for other updates - REMOVED
      // if (onChatUpdated) {
      //   onChatUpdated(updatedChat);
      // }
    } catch (err) {
      console.error('Error updating chat title:', err);
      // Display error briefly
      setError('Failed to update chat title');
      setTimeout(() => setError(''), 3000);

      // Reset to previous title if API call failed
      resetTitle();
      // Also update the main chat state back if it was optimistically updated
      setChat(prev => ({ ...prev, title: chat?.title || 'New Chat' }));
    } finally {
      setRenamingInProgress(false);
    }
  }, [chat, newTitle, resetTitle, setChat, setError]); // Removed onChatUpdated dependency

  // Define handleTitleKeyPress *after* handleSaveTitle
  const handleTitleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSaveTitle(); // Now defined above
    } else if (e.key === 'Escape') {
      handleCancelEditing();
    }
  }, [handleSaveTitle, handleCancelEditing]); // Correct dependencies

  // Effect to listen for external chat title updates via WebSocket
  useEffect(() => {
    if (chat?.id) {
      const eventName = `chat:${chat.id}:chat_title_updated`;
      
      const handleExternalTitleUpdate = (payload) => {
        if (payload && payload.chatId === chat.id && payload.newTitle) {
          setChat(prevChat => {
            if (prevChat && prevChat.title !== payload.newTitle) {
              // Publish to frontend eventBus so ChatList can pick it up
              eventBus.publish('chat:titleUpdated', { chatId: payload.chatId, newTitle: payload.newTitle, chat: { ...prevChat, title: payload.newTitle } });
              return { ...prevChat, title: payload.newTitle };
            }
            return prevChat;
          });
          // If user is currently editing the title, update the input field as well
          if (isEditing) {
            setNewTitle(payload.newTitle);
          }
        }
      };
      
      const unsubscribe = websocketManager.on(eventName, handleExternalTitleUpdate);
      
      // Also listen to the global event if websocketManager doesn't prefix chat-specific events this way
      // This depends on how websocketManager.on is implemented. Assuming it handles chat-specific.
      // If not, a global listener like below might be needed, filtering by payload.chatId.
      // const globalUnsubscribe = websocketManager.on('chat_title_updated', handleExternalTitleUpdate);

      return () => {
        unsubscribe();
        // globalUnsubscribe(); // if global listener was used
      };
    }
  }, [chat?.id, setChat, isEditing, setNewTitle]); // Added eventBus to dependencies if it were used directly, but it's imported.

  return {
    isEditing,
    newTitle,
    renamingInProgress,
    titleInputRef,
    handleStartEditing,
    handleCancelEditing,
    handleTitleChange,
    handleTitleKeyPress,
    handleSaveTitle
  };
};

export default useChatTitle;
