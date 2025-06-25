import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import chatService from '../../services/chatService';
import apiService from '../../services/apiService';
import eventBus from '../../utils/eventBus';

const ChatList = ({
  selectedChatId,
  onChatSelected,
  onNewChat,
  refreshTrigger = 0,
}) => {
  const [ownedChats, setOwnedChats] = useState([]);
  const [sharedWithMeChats, setSharedWithMeChats] = useState([]);
  const [pendingShares, setPendingShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null); 
  const navigate = useNavigate();
  const [isInvitationsOpen, setIsInvitationsOpen] = useState(true); 
  const [isMyChatsOpen, setIsMyChatsOpen] = useState(true); 
  const [isSharedOpen, setIsSharedOpen] = useState(true); 
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const titleInputRef = React.useRef(null);

  // Function to update local chat state (now targets ownedChats)
  const updateChatTitle = useCallback((chatId, newTitle) => {
    setOwnedChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      )
    );
    // Also update shared chats if the title changes there
    setSharedWithMeChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      )
    );
  }, []);

  // Fetch all chat data (owned, shared, pending)
  const fetchAllChatData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ownedResponse, sharedResponse, pendingResponse] = await Promise.allSettled([
        chatService.getChats(), 
        apiService.getSharedWithMeChats(), 
        apiService.getPendingShares() 
      ]);

      if (ownedResponse.status === 'fulfilled') {
        setOwnedChats(Array.isArray(ownedResponse.value) ? ownedResponse.value : []);
      } else {
        console.error('Error fetching owned chats:', ownedResponse.reason);
        setOwnedChats([]);
      }

      if (sharedResponse.status === 'fulfilled') {
        setSharedWithMeChats(Array.isArray(sharedResponse.value?.data) ? sharedResponse.value.data : []);
      } else {
        console.error('Error fetching shared chats:', sharedResponse.reason);
        setSharedWithMeChats([]);
      }

      if (pendingResponse.status === 'fulfilled') {
        setPendingShares(Array.isArray(pendingResponse.value?.data) ? pendingResponse.value.data : []);
      } else {
        console.error('Error fetching pending shares:', pendingResponse.reason);
        setPendingShares([]);
      }

      if (ownedResponse.status === 'rejected' && sharedResponse.status === 'rejected' && pendingResponse.status === 'rejected') {
         setError('Failed to load chat data.');
      }

    } catch (err) {
      console.error('Unexpected error fetching all chat data:', err);
      setError('An unexpected error occurred while loading chats.');
      setOwnedChats([]);
      setSharedWithMeChats([]);
      setPendingShares([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllChatData();
  }, [refreshTrigger, fetchAllChatData]);

  useEffect(() => {
    if (editingChatId && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingChatId]);

  useEffect(() => {
    const unsubscribeTitleUpdated = eventBus.subscribe('chat:titleUpdated', (data) => {
      if (data && data.chatId && data.newTitle) {
        setTimeout(() => {
          updateChatTitle(data.chatId, data.newTitle);
        }, 0);
      }
    });

    const refreshLists = () => {
      setTimeout(() => {
        fetchAllChatData();
      }, 0);
    };
    const unsubscribeAccepted = eventBus.subscribe('share:accepted', refreshLists);
    const unsubscribeDeclined = eventBus.subscribe('share:declined', refreshLists);
    // Handle share removal directly for instant UI update
    const handleShareRemoved = (data) => {
      if (data && data.chatId) {
        setTimeout(() => {
          setOwnedChats(prevChats =>
            prevChats.map(chat =>
              chat.id === data.chatId ? { ...chat, is_shared: false } : chat
            )
          );
        }, 0);
      }
    };
    const unsubscribeRemoved = eventBus.subscribe('share:removed', handleShareRemoved);
    const unsubscribeInvited = eventBus.subscribe('share:invited', refreshLists);

    return () => {
      unsubscribeTitleUpdated();
      unsubscribeAccepted();
      unsubscribeDeclined();
      unsubscribeRemoved();
      unsubscribeInvited();
    };
  }, [updateChatTitle, fetchAllChatData]);

  const handleDeleteChat = async (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this chat?')) return;
    try {
      await chatService.deleteChat(chatId);
      setOwnedChats(prev => prev.filter(chat => chat.id !== chatId));
      eventBus.publish('chat:deleted', { chatId });
      if (String(selectedChatId) === String(chatId)) { 
        navigate('/chat');
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
      alert('Failed to delete chat');
    }
  };

  const handleAcceptShare = async (shareId) => {
    setActionLoading(shareId);
    try {
      await apiService.acceptShare(shareId);
      eventBus.publish('share:accepted', { shareId });
      setPendingShares(prev => prev.filter(s => s.share_id !== shareId));
    } catch (err) {
      console.error('Error accepting share:', err);
      alert(`Failed to accept invitation: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineShare = async (shareId) => {
    if (!window.confirm('Are you sure you want to decline this invitation?')) return;
    setActionLoading(shareId);
    try {
      await apiService.declineShare(shareId);
      eventBus.publish('share:declined', { shareId });
      setPendingShares(prev => prev.filter(s => s.share_id !== shareId));
    } catch (err) {
      console.error('Error declining share:', err);
      alert(`Failed to decline invitation: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChatClick = (chatId) => {
    if (editingChatId === chatId) return; 
    if (onChatSelected) {
      onChatSelected(chatId);
    }
  };

  const handleStartEditing = (e, chat) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title || 'New Chat');
  };

  const handleCancelEditing = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEditingChatId(null);
    setEditingTitle('');
  };

  const handleSaveEditing = async (e, chatId) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingTitle.trim()) {
      alert("Chat title cannot be empty.");
      return;
    }
    try {
      await chatService.updateChatTitle(chatId, editingTitle);
      updateChatTitle(chatId, editingTitle); 
      eventBus.publish('chat:titleUpdated', { chatId, newTitle: editingTitle });
      setEditingChatId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('Error updating chat title:', err);
      alert('Failed to update chat title.');
    }
  };
  
  const handleTitleInputChange = (e) => {
    setEditingTitle(e.target.value);
  };

  const handleTitleInputKeyPress = (e, chatId) => {
    if (e.key === 'Enter') {
      handleSaveEditing(null, chatId);
    } else if (e.key === 'Escape') {
      handleCancelEditing(null);
    }
  };

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 dark:border-blue-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4 text-red-500 dark:text-red-400">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-blue-500 dark:text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* New chat button */}
      <div className="p-4">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
        >
          <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat list sections */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4"> {/* Reduced space-y */}

        {/* Pending Invitations Section */}
        {pendingShares && pendingShares.length > 0 && (
          <div className="py-2"> {/* Added padding */}
            <button
              onClick={() => setIsInvitationsOpen(!isInvitationsOpen)}
              className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <span>Invitations ({pendingShares.length})</span>
              <svg className={`w-4 h-4 transform transition-transform ${isInvitationsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isInvitationsOpen && (
              <div className="mt-1 space-y-1 pl-2 border-l-2 border-yellow-300 dark:border-yellow-600 ml-1"> {/* Indent and border */}
                {pendingShares.map((share) => (
                  <div key={share.share_id} className="p-2 border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 rounded-md">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={share.chat_title}> {/* Use chat_title */}
                      {share.chat_title || 'Chat'} {/* Fallback title */}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      From: {share.owner_username}
                    </p>
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={() => handleAcceptShare(share.share_id)}
                        disabled={actionLoading === share.share_id}
                        className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === share.share_id ? 'Accepting...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleDeclineShare(share.share_id)}
                        disabled={actionLoading === share.share_id}
                        className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === share.share_id ? 'Declining...' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Owned Chats Section */}
        <div className="py-2"> {/* Added padding */}
           <button
             onClick={() => setIsMyChatsOpen(!isMyChatsOpen)}
             className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
           >
             <span>My Chats ({ownedChats.length})</span>
             <svg className={`w-4 h-4 transform transition-transform ${isMyChatsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
           </button>
           {isMyChatsOpen && (
             <div className="mt-1 space-y-1">
              {ownedChats && ownedChats.length > 0 ? (
                ownedChats.map((chat) => {
                  if (editingChatId === chat.id) {
                    return (
                      <div key={`editing-${chat.id}`} className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-md">
                        <input
                          ref={titleInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={handleTitleInputChange}
                          onKeyDown={(e) => handleTitleInputKeyPress(e, editingChatId)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-dark-text-primary"
                        />
                        <div className="mt-2 flex justify-end space-x-2">
                          <button onClick={(e) => handleCancelEditing(e)} className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">Cancel</button>
                          <button onClick={(e) => handleSaveEditing(e, editingChatId)} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded">Save</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={`owned-${chat.id}`}
                      to={`/chat/${chat.id}`}
                      className={`
                        flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors group
                        ${Number(selectedChatId) === chat.id
                          ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-900 dark:text-blue-100 shadow-sm'
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/70'}
                      `}
                      onClick={() => handleChatClick(chat.id)}
                    >
                      <div className="flex-1 flex items-center overflow-hidden">
                        {chat.is_shared ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 h-5 w-5 mr-3 text-green-500 dark:text-green-400" viewBox="0 0 256 256">
                            <path fill="currentColor" d="M234.38 111.08a12 12 0 0 0-10.76 11.3l-.1 1.62H192a12 12 0 0 0 0 24h31.52l.1 1.62a12 12 0 0 0 21.52 7.38l16-28a12 12 0 0 0 0-14.76l-16-28a12 12 0 0 0-21.52 7.38ZM128 108a44 44 0 1 0-44-44a44.05 44.05 0 0 0 44 44Zm0-72a28 28 0 1 1-28 28a28 28 0 0 1 28-28Zm0 108c-41.16 0-76.4 24.21-86.32 59.17a12 12 0 0 0 11.14 14.75h150.36a12 12 0 0 0 11.14-14.75C204.4 168.21 169.16 144 128 144Zm-70.86 60a84.11 84.11 0 0 1 141.72 0Z"/>
                          </svg>
                        ) : (
                          <svg className="flex-shrink-0 h-5 w-5 mr-3 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className={`truncate ${chat.model_is_active === 0 ? 'text-gray-400 dark:text-gray-600 italic' : ''}`}>
                          {chat.title || 'New Chat'}
                          {chat.model_is_active === 0 && ' (Model Unavailable)'}
                        </span>
                      </div>
                      <div className="ml-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleStartEditing(e, chat)}
                          className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 focus:outline-none p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/20 mr-1"
                          title="Rename Chat"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                           </svg>
                        </button>
                        <button
                          onClick={(e) => handleDeleteChat(e, chat.id)}
                          className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 focus:outline-none p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                          title="Delete Chat"
                        >
                          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </Link>
                  );
                })
              ) : (
                isMyChatsOpen && (
                  <div className="text-center px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    No chats yet. Click "New Chat" to start.
                  </div>
                )
              )}
            </div>
           )}
        </div>

        {/* Shared Chats Section */}
        {sharedWithMeChats && sharedWithMeChats.length > 0 && (
          <div className="py-2"> {/* Added padding */}
            <button
              onClick={() => setIsSharedOpen(!isSharedOpen)}
              className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <span>Shared With Me ({sharedWithMeChats.length})</span>
              <svg className={`w-4 h-4 transform transition-transform ${isSharedOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isSharedOpen && (
              <div className="mt-1 space-y-1">
                {sharedWithMeChats.map((chat) => (
                <Link
                  key={`shared-${chat.id}`}
                  to={`/chat/${chat.id}`}
                  className={`
                    flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors group
                    ${Number(selectedChatId) === chat.id // Use === and ensure type consistency
                      ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-900 dark:text-blue-100 shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/70'}
                  `}
                  onClick={() => handleChatClick(chat.id)}
                >
                  <div className="flex-1 flex items-center overflow-hidden">
                    {/* New Shared Chat Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 h-5 w-5 mr-3 text-purple-500 dark:text-purple-400" viewBox="0 0 256 256">
                      <path fill="currentColor" d="M164 128a4 4 0 0 1-4 4H96a4 4 0 0 1 0-8h64a4 4 0 0 1 4 4Zm-4 28H96a4 4 0 0 0 0 8h64a4 4 0 0 0 0-8Zm52-108v152a28 28 0 0 1-28 28H72a28 28 0 0 1-28-28V48a12 12 0 0 1 12-12h20V24a4 4 0 0 1 8 0v12h40V24a4 4 0 0 1 8 0v12h40V24a4 4 0 0 1 8 0v12h20a12 12 0 0 1 12 12Zm-8 0a4 4 0 0 0-4-4h-20v12a4 4 0 0 1-8 0V44h-40v12a4 4 0 0 1-8 0V44H84v12a4 4 0 0 1-8 0V44H56a4 4 0 0 0-4 4v152a20 20 0 0 0 20 20h112a20 20 0 0 0 20-20Z"/>
                    </svg>
                    <div className="flex flex-col overflow-hidden">
                      {/* Add conditional styling/indicator for unavailable model */}
                      <span className={`truncate font-medium ${chat.model_is_active === 0 ? 'text-gray-400 dark:text-gray-600 italic' : ''}`}>
                        {chat.title || 'Shared Chat'}
                        {chat.model_is_active === 0 && ' (Model Unavailable)'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Owner: {chat.owner_username}</span>
                    </div>
                  </div>
                  {/* No delete button for shared chats */}
                </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message if all lists are empty */}
        {ownedChats.length === 0 && sharedWithMeChats.length === 0 && pendingShares.length === 0 && (
           <div className="text-center px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
             No chats or invitations.
           </div>
        )}
      </div>
    </div>
  );
};

ChatList.propTypes = {
  selectedChatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChatSelected: PropTypes.func,
  onNewChat: PropTypes.func,
  refreshTrigger: PropTypes.number
};

export default ChatList;
