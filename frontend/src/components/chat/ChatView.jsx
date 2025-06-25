import React, { useState, useEffect, useCallback } from 'react'; 
import PropTypes from 'prop-types';
import ChatContent from './ChatContent';
import ChatErrorToast from './ChatErrorToast';
import ChatError from './ChatError';
import chatService from '../../services/chatService';
import modelService from '../../services/modelService';
import apiService from '../../services/apiService'; 
import useChatMessages from '../../hooks/useChatMessages';
import eventBus from '../../utils/eventBus';
import socketService from '../../services/socketService'; 
import { toast, ToastContainer } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css'; 

const SimpleTooltip = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const safeText = text || '';
  const hasContent = safeText.trim().length > 0;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
           className="absolute z-10 top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 font-medium text-white bg-gray-900 rounded-md shadow-sm dark:bg-gray-700 max-w-md sm:max-w-lg md:max-w-xl"
           style={{ fontSize: '0.55rem' }} 
        >
          {hasContent ? (
            safeText.split('\n').map((line, index) => (
              <div key={index}>{line || '\u00A0'}</div> 
            ))
          ) : (
            <div>(No specific system prompt set)</div>
          )}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-gray-900 dark:border-b-gray-700"></div>
        </div>
      )}
    </div>
  );
};
SimpleTooltip.propTypes = {
  text: PropTypes.string,
  children: PropTypes.node.isRequired,
};

const ChatView = ({ chatId, userSettings, onChatUpdated, currentUserId, openShareModal }) => { 
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [model, setModel] = useState(null); 

  const [imageGenToolConfig, setImageGenToolConfig] = useState(null);
  const [isImageGenToolGloballyActive, setIsImageGenToolGloballyActive] = useState(false);
  const [loadingToolConfig, setLoadingToolConfig] = useState(true);

  const {
    sending,
    inlineError,
    setInlineError,
    apiKeyError,
    setApiKeyError,
    handleSendMessage,
    handleStreamingComplete,
    streamingMessages, 
    currentNumericIdRef, 
    handleFeedbackUpdate,
    isToolStreamingThisChat,
    currentToolExecutionId
  } = useChatMessages(chatId, chat, setChat, onChatUpdated);

  const fetchChatAndModelDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const chatData = await chatService.getChat(chatId);
      setChat(chatData);

      if (chatData && chatData.model_id) {
        try {
          const modelDataFromApi = await modelService.getModel(chatData.model_id);
          if (modelDataFromApi) {
            const processedModel = {
              ...modelDataFromApi,
              is_active: Boolean(modelDataFromApi.is_active),
              can_generate_images: Boolean(modelDataFromApi.can_generate_images), 
              is_embedding_model: Boolean(modelDataFromApi.is_embedding_model),
              enable_scala_prompt: Boolean(modelDataFromApi.enable_scala_prompt)
            };
            setModel(processedModel);            
          } else {
            setModel(null);
          }
        } catch (modelError) {
          console.error('Error fetching CHAT model:', modelError);
          setModel(null); 
        }
      } else {
        setModel(null); 
      }
    } catch (err) {
      console.error('[ChatView] Error fetching chat:', err);
      setError('Failed to load chat history');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  const fetchImageToolConfig = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingToolConfig(true);
    try {
      // 1. Fetch global status of ALL local tools
      const localToolsStatusResponse = await apiService.get('/mcp/local-tools/status'); 
      if (localToolsStatusResponse.success && localToolsStatusResponse.data) {
        setIsImageGenToolGloballyActive(!!localToolsStatusResponse.data.image_gen); 
      } else {
        setIsImageGenToolGloballyActive(false);
        console.warn('[ChatView] Failed to fetch local tools status or data missing.');
      }

      // 2. Fetch user's specific config for 'image_gen' tool
      // This endpoint /mcp/tools/image_gen/config seems correct based on mcpRoutes.js
      const userConfigResponse = await apiService.get('/mcp/tools/image_gen/config'); 
      if (userConfigResponse.success && userConfigResponse.data) {
        setImageGenToolConfig(userConfigResponse.data); 
      } else {
        setImageGenToolConfig(null);
      }
    } catch (err) {
      console.error("Error fetching Image Generation tool configuration:", err);
      setIsImageGenToolGloballyActive(false);
      setImageGenToolConfig(null);
    } finally {
      setLoadingToolConfig(false);
    }
  }, [currentUserId]);


  useEffect(() => {
    if (chatId) {
      fetchChatAndModelDetails();
    }
    if (currentUserId) {
        fetchImageToolConfig();
    }
  }, [chatId, currentUserId, fetchChatAndModelDetails, fetchImageToolConfig]);

  const handleChatUpdateFromChild = useCallback((updatedChat) => {
    if (typeof updatedChat === 'function') {
      setChat(prev => updatedChat(prev));
    } else {
      setChat(updatedChat);
    }
    if (onChatUpdated) {
      onChatUpdated(updatedChat);
    }
  }, [onChatUpdated]);

  useEffect(() => {
    const unsubscribeChatDeleted = eventBus.subscribe('chat:deleted', (data) => {
      if (data && data.chatId && chat && data.chatId === chat.id) {
        setError({
          message: 'Chat Deleted',
          detail: 'This chat has been deleted. You can start a new conversation or select another chat from the sidebar.',
          type: 'deleted',
          actionUrl: '/chat'
        });
      }
    });
    return () => {
       unsubscribeChatDeleted();
     };
   }, [chat]); 

  useEffect(() => {
    const handleContextWarning = (data) => {
      if (chat && data && data.chatId && String(data.chatId) === String(chat.id)) {
        const percentage = data.maxTokens ? Math.round((data.estimatedTokens / data.maxTokens) * 100) : 'high';
        toast.warn( 
          `⚠️ Context window nearing limit (${percentage}% used). Consider starting a new chat soon.`,
          { position: "top-center", autoClose: 6000, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' }
        );
      }
    };
    const unsubscribeContextWarning = socketService.on('chat:context_warning', handleContextWarning);
    return () => unsubscribeContextWarning();
  }, [chat]); 

   if (loading || loadingToolConfig) { 
     return (
       <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400">Loading chat data...</p>
      </div>
    );
  }

  if (error) {
    return <ChatError error={error} onDismiss={() => setError('')} />;
  }

  if (!chat) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">No chat selected</p>
      </div>
    );
  }

  const isOwner = chat?.user_id === currentUserId;
  const isImageGenerationAvailable = !!(isImageGenToolGloballyActive && imageGenToolConfig && imageGenToolConfig.selected_model_id);

  return (
    <div className="flex flex-col h-full relative chat-container bg-white dark:bg-dark-primary shadow-lg overflow-hidden mt-4 w-full">
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
      />
      <ChatErrorToast
        inlineError={inlineError}
        onDismiss={() => setInlineError(null)}
      />

      {isOwner && (
        <div className="border-b border-gray-100 dark:border-dark-border py-3 px-4 bg-white dark:bg-dark-primary">
          <div className="flex items-center justify-between space-x-4"> 
            <div className="flex items-center space-x-4 flex-shrink-0 min-w-0"> 
              {model ? (
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <span className="mr-1 flex-shrink-0">
                    {model.provider === 'openai' ? '🔄' : 
                     model.provider === 'anthropic' ? '🔷' : 
                     model.provider === 'local' ? '💻' : '🤖'}
                  </span>
                  <span className="truncate" title={model.name}>
                    {model.name}
                    {!model.is_active && <span className="ml-1 text-yellow-600 dark:text-yellow-500">(inactive)</span>}
                  </span>
                </div>
              ) : (
                 <div className="flex items-center text-sm text-red-500 dark:text-red-400 italic">
                   Model Unavailable
                 </div>
              )}
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center space-x-3 flex-shrink-0"> 
              {Boolean(model?.enable_scala_prompt) && ( 
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-dark-border rounded-full px-2 py-0.5 cursor-default">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>System Prompt Active</span>
                  </div>
              )}
              {chat && chat.user_id === currentUserId && (
                <button
                  onClick={() => openShareModal(chat)}
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title="Share this chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12.223 11.075a.5.5 0 0 0 .7.71l7-7v3.58a.508.508 0 0 0 .5.5a.5.5 0 0 0 .5-.5v-4.79a.5.5 0 0 0-.5-.5h-4.79a.5.5 0 0 0 0 1h3.58Z"/>
                    <path fill="currentColor" d="M17.876 20.926H6.124a3.053 3.053 0 0 1-3.05-3.05V6.124a3.053 3.053 0 0 1 3.05-3.05h6.028a.5.5 0 0 1 0 1H6.124a2.053 2.053 0 0 0-2.05 2.05v11.752a2.053 2.053 0 0 0 2.05 2.05h11.752a2.053 2.053 0 0 0 2.05-2.05v-6.027a.5.5 0 0 1 1 0v6.027a3.053 3.053 0 0 1-3.05 3.05Z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )} 
      <div className="relative flex-1 overflow-hidden">
        <ChatContent
          chatId={chatId}
          chat={chat}
          onSendMessage={handleSendMessage}
          sending={sending}
          onChatUpdated={handleChatUpdateFromChild} 
          handleStreamingComplete={handleStreamingComplete} 
          streamingMessages={streamingMessages} 
          currentNumericIdRef={currentNumericIdRef} 
          model={model} 
          isImageGenerationAvailable={isImageGenerationAvailable} 
          userSettings={userSettings} 
          handleFeedbackUpdate={handleFeedbackUpdate} 
          isOwner={isOwner} 
          isModelAvailable={!!model} 
          isModelActive={model?.is_active ?? false} 
          isToolStreamingThisChat={isToolStreamingThisChat}
          currentToolExecutionId={currentToolExecutionId}
         />
        {apiKeyError && (
          <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="absolute inset-0 bg-gray-800 bg-opacity-60 pointer-events-auto" onClick={() => setApiKeyError(null)}></div>
            <div className="relative w-80 sm:w-96 bg-yellow-50 border-2 border-yellow-300 rounded-lg shadow-2xl p-5 mx-auto z-10 pointer-events-auto">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="h-6 w-6 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-yellow-800">⚠️ API Key Error</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p className="font-medium">{apiKeyError.message}</p>
                    <p className="mt-1">{apiKeyError.detail}</p>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                      onClick={() => setApiKeyError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

 ChatView.propTypes = {
   chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
   userSettings: PropTypes.object, 
   onChatUpdated: PropTypes.func, 
   currentUserId: PropTypes.number.isRequired,
   openShareModal: PropTypes.func.isRequired 
 };

export default ChatView;
