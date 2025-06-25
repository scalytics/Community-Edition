import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import ChatList from '../components/chat/ChatList';
import ChatView from '../components/chat/ChatView';
import ModelSelector from '../components/chat/ModelSelector';
import ShareChatModal from '../components/chat/ShareChatModal'; 
import GlobalKeyNotification from '../components/chat/GlobalKeyNotification';
import chatService from '../services/chatService';
import eventBus from '../utils/eventBus';
import authService from '../services/auth'; 

const ChatPage = () => {
  const [userSettings, setUserSettings] = useState(null); 
  const [currentUser, setCurrentUser] = useState(null); 
  const [loadingSettings, setLoadingSettings] = useState(true);
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [showNewChatForm, setShowNewChatForm] = useState(!id);
  const [creatingChat, setCreatingChat] = useState(false);
  const [chatListRefreshTrigger, setChatListRefreshTrigger] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); 
  const [currentChatForModal, setCurrentChatForModal] = useState(null); 

  useEffect(() => {
    setShowNewChatForm(!id);
  }, [id]);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoadingSettings(true);
      setLoadingSettings(true);
      try {
        const profile = await authService.getProfile();
        if (profile && profile.data) {
          setUserSettings(profile.data.settings || {}); 
          setCurrentUser(profile.data); 
        } else {
           console.warn("Could not fetch user profile or settings.");
           setUserSettings({}); 
           setCurrentUser(null);
        }
      } catch (error) {
        console.error("Error fetching user profile/settings:", error);
        setUserSettings({}); 
        setCurrentUser(null);
      } finally {
        setLoadingSettings(false); 
      }
    };
    fetchSettings();
  }, []); 

  const handleModelSelect = (modelId) => {
    setSelectedModelId(modelId);
  };

  const handleCreateChat = async () => {
    if (!selectedModelId) {
      alert('Please select a model');
      return;
    }

    try {
      setCreatingChat(true);
      
      const response = await chatService.createChat({
        modelId: selectedModelId,
        title: 'New Chat'
      });
      
      if (response && response.id) {
        setChatListRefreshTrigger(prev => prev + 1);
        navigate(`/chat/${response.id}`);
      } else {
        throw new Error('Failed to create chat');
      }
    } catch (error) {
      console.error('Error creating chat');
      alert('Model disabled. Contact your Administrator.');
    } finally {
      setCreatingChat(false);
    }
  };

  const handleNewChat = () => {
    setShowNewChatForm(true);
    navigate('/chat');
  };

  const handleChatSelected = (chatId) => {
    navigate(`/chat/${chatId}`);
  };

  const handleChatUpdated = (updatedChat) => {
    setChatListRefreshTrigger(prev => prev + 1);
  };

  // Subscribe to chat deletion events to handle navigation and refresh list
  useEffect(() => {
    const unsubscribeChatDeleted = eventBus.subscribe('chat:deleted', (data) => {
      if (data && data.chatId && String(data.chatId) === id) {
        setShowNewChatForm(true);
        navigate('/chat');
      } else {
        setChatListRefreshTrigger(prev => prev + 1);
      }
    });

    return () => {
       unsubscribeChatDeleted();
     };
   }, [id, navigate]); 

  useEffect(() => {
    const unsubscribeChatShared = eventBus.subscribe('chat:shared', (data) => {
      if (data && data.chatId) {
        console.log(`[ChatPage] Received chat:shared event for chatId: ${data.chatId}. Refreshing list.`);
        setChatListRefreshTrigger(prev => prev + 1);
      }
    });

    return () => {
      unsubscribeChatShared();
    };
  }, []); 

  const openShareModal = (chat) => {
    setCurrentChatForModal(chat);
    setIsShareModalOpen(true);
  };

  const closeShareModal = () => {
    setIsShareModalOpen(false);
    setCurrentChatForModal(null);
  };

  return (
    <Sidebar>
      <div className="h-full grid grid-cols-[0fr,1fr] md:grid-cols-[288px,1fr] overflow-hidden pt-1 bg-white dark:bg-dark-primary">
        {/* Chat list sidebar with fixed positioning - left side */}
        <div className="hidden md:block h-full overflow-hidden">
          <div className="fixed w-72 h-[calc(100vh-4rem)] bg-gray-50 dark:bg-dark-primary border-r border-gray-200 dark:border-dark-border shadow-md overflow-hidden">
            <ChatList 
              selectedChatId={id} 
              onChatSelected={handleChatSelected}
              onNewChat={handleNewChat}
              refreshTrigger={chatListRefreshTrigger}
            />
          </div>
        </div>
        
        {/* Main chat area - center, with isolation from sidebar layout */}
        <div className="flex flex-col w-full overflow-hidden">
          {/* Global Key Notification */}
          {!showNewChatForm && <GlobalKeyNotification />}
          
          {showNewChatForm ? (
            <div className="flex flex-col h-full justify-center items-center px-4 sm:px-6 lg:px-8">
              <div className="w-full max-w-xl mx-auto bg-white dark:bg-dark-primary shadow-md rounded-lg p-6 border border-gray-200 dark:border-dark-border chat-container">
                <div className="text-center">
                  <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Start a new chat</h2>
                  <p className="mt-1 text-xs text-gray-600 dark:text-dark-text-secondary">
                    Select a model to begin your conversation
                  </p>
                </div>
                
                <div className="mt-4 space-y-4">
                  <div className="rounded-md shadow-sm">
                    <ModelSelector 
                      selectedModelId={selectedModelId}
                      onModelSelect={handleModelSelect}
                      onStartChat={() => {
                        if (!creatingChat) {
                          handleCreateChat();
                        }
                      }}
                    />
                    
                    {creatingChat && (
                      <div className="mt-4 text-sm text-blue-600 dark:text-dark-link flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating your chat...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-1 relative justify-center">
                <div className="w-full px-4 pb-4 flex-1">
                  {!loadingSettings && currentUser && (
                    <ChatView
                      chatId={id}
                      userSettings={userSettings}
                      currentUserId={currentUser.id} 
                      openShareModal={openShareModal} 
                      onChatUpdated={handleChatUpdated} 
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <ShareChatModal
        isOpen={isShareModalOpen}
        onClose={closeShareModal}
        chatId={currentChatForModal?.id}
        chatTitle={currentChatForModal?.title || currentChatForModal?.name} 
      />
    </Sidebar>
  );
};

export default ChatPage;
