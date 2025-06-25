import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import WelcomeCard from '../components/dashboard/WelcomeCard';
import RecentChats from '../components/dashboard/RecentChats';
import Stats from '../components/dashboard/Stats';
import { useAuth } from '../contexts/AuthContext'; 
import chatService from '../services/chatService';
import modelService from '../services/modelService';

const DashboardPage = () => {
  const [loading, setLoading] = useState({
    chats: true,
    stats: true
  });
  const [selectedModel, setSelectedModel] = useState(null);
  const [stats, setStats] = useState({
    totalChats: 0,
    totalMessages: 0,
    monthlyTokenUsage: 0 
  });
  const [recentChats, setRecentChats] = useState([]);
  const [models, setModels] = useState([]);
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false); 
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth(); 

  useEffect(() => {
    // Fetch everything we need for the dashboard
    const loadDashboardData = async () => {
      try {
        // Start loading state
        setLoading({
          chats: true,
          stats: true
        });
        
        // Fetch chats, models, stats, privacy status, and token usage simultaneously
        const [chatsResponse, modelData, tokenUsageResponse] = await Promise.all([
          chatService.getChats(),
          modelService.getActiveModels(),
          chatService.getMonthlyTokenUsage() // Fetch monthly token usage
        ]);

        const isPrivacyEnabled = (modelData?.privacyModeEnabled === true);
        setPrivacyModeEnabled(isPrivacyEnabled);
        // --- End Privacy Status Processing ---

        // --- Process Models ---
        let fetchedModels = Array.isArray(modelData) ? modelData :
                          (modelData?.data && Array.isArray(modelData.data)) ? modelData.data : [];

        // Filter for models suitable for general chat:
        // - Not an embedding model (is_embedding_model is 0 or false)
        // - Not an image generation model (can_generate_images is 0 or false)
        let suitableChatModels = fetchedModels.filter(model => {
          const isEmbedding = model.is_embedding_model === 1 || model.is_embedding_model === true;
          const canGenerateImages = model.can_generate_images === 1 || model.can_generate_images === true;
          return !isEmbedding && !canGenerateImages;
        });
        
        if (isPrivacyEnabled) {
          suitableChatModels = suitableChatModels.filter(model => !model.external_provider_id);
        } else {
          suitableChatModels = suitableChatModels.map(model => {
            if (model.external_provider_id && !model.can_use) {
              return { ...model, is_disabled: true }; 
            }
            return model;
          });
        }
        setModels(suitableChatModels); 
        // --- End Model Processing ---
        
        // Process chats - ensure we're working with an array (existing logic)
        const chatsArray = Array.isArray(chatsResponse) ? chatsResponse : 
                          (chatsResponse?.data && Array.isArray(chatsResponse.data)) ? chatsResponse.data : [];
        
        // Calculate total messages from all chats
        let totalMessageCount = 0;
        if (chatsArray && chatsArray.length > 0) {
          chatsArray.forEach(chat => {
            totalMessageCount += (chat.message_count || 0);
          });
        }
        
        // Update stats
        setStats({
          totalChats: chatsArray.length,
          totalMessages: totalMessageCount,
          // Ensure we are accessing the nested 'data' property if the service returns the full API envelope
          monthlyTokenUsage: tokenUsageResponse?.data?.totalTokens || tokenUsageResponse?.totalTokens || 0 
        });
        
        let recentChatsList = [];
        if (chatsArray && chatsArray.length > 0) {
          const sortedChats = [...chatsArray].sort((a, b) => 
            new Date(b.updated_at) - new Date(a.updated_at)
          );
          recentChatsList = sortedChats.slice(0, 5);
        }
        setRecentChats(recentChatsList);
        
        setLoading({
          chats: false,
          stats: false
        });
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError('Failed to load dashboard data. Please refresh the page to try again.');
        setLoading({
          chats: false,
          stats: false
        });
      }
    };

    loadDashboardData();
  }, []);

  const handleModelSelect = (modelId) => {
    setSelectedModel(modelId);
  };

  const handleStartChat = async () => {
    if (!selectedModel) {
      alert('Please select a model first');
      return;
    }
    
    try {
      const response = await chatService.createChat({
        modelId: selectedModel,
        title: 'New Chat'
      });
      
      if (response && response.id) {
        navigate(`/chat/${response.id}`);
      } else {
        throw new Error('Failed to create chat');
      }
    } catch (err) {
      console.error('Error creating chat:', err);
      alert('Model disabled. Contact your Administrator.');
    }
  };

  return (
    <Sidebar>
      <div className="py-4 flex h-full flex-col justify-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-text-primary">Dashboard</h1>
          
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-700 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                {!authLoading && <WelcomeCard username={user?.username || "User"} />}
              </div>
              
              {/* Stats cards */}
              <div className="bg-white dark:bg-dark-primary overflow-hidden shadow rounded-lg border dark:border-dark-border">
                <Stats 
                  loading={loading.stats} 
                  totalChats={stats.totalChats} 
                  totalMessages={stats.totalMessages}
                  monthlyTokenUsage={stats.monthlyTokenUsage} 
                />
              </div>
              
              {/* Start a new chat card */}
              <div className="bg-white dark:bg-dark-primary overflow-hidden shadow rounded-lg border dark:border-dark-border">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary">Start a new chat</h3>
                  <div className="mt-2 max-w-xl text-sm text-gray-500 dark:text-dark-text-secondary">
                    <p>Select a model and start a new conversation.</p>
                  </div>
                  <div className="mt-5">
                    <label htmlFor="model-selector" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                      Select Model
                    </label>
                    <select
                      id="model-selector"
                      value={selectedModel || ''}
                      onChange={(e) => handleModelSelect(e.target.value)}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-dark-border text-gray-900 dark:text-dark-text-primary dark:bg-dark-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm rounded-md"
                    >
                      <option value="" disabled>Select a model</option>
                      
                      {/* Group models like ModelSelector */}
                      {models.length > 0 ? (
                        (() => {
                          const groupedModels = models.reduce((acc, model) => {
                            if (model.provider_name === 'Scalytics MCP') {
                              if (!acc['scalytics']) acc['scalytics'] = [];
                              acc['scalytics'].push(model);
                            } else if (model.external_provider_id) {
                              if (!acc['external']) acc['external'] = [];
                              acc['external'].push(model);
                            } else {
                              if (!acc['local']) acc['local'] = [];
                              acc['local'].push(model);
                            }
                            return acc;
                          }, {});

                          return (
                            <>
                              {/* Scalytics MCP models */}
                              {groupedModels.scalytics && groupedModels.scalytics.length > 0 && (
                                <optgroup label="Scalytics MCP Models" className="text-gray-900 dark:text-dark-text-primary">
                                  {groupedModels.scalytics.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {/* Local models */}
                              {groupedModels.local && groupedModels.local.length > 0 && (
                                <optgroup label="Local Models" className="text-gray-900 dark:text-dark-text-primary">
                                  {groupedModels.local.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {/* External models */}
                              {groupedModels.external && groupedModels.external.length > 0 && (
                                <optgroup label="External API Models" className="text-gray-900 dark:text-dark-text-primary">
                                  {groupedModels.external.map((model) => (
                                    <option 
                                      key={model.id} 
                                      value={model.id}
                                      disabled={model.is_disabled} 
                                      className={model.is_disabled ? 'text-gray-400 dark:text-gray-500' : ''} 
                                    >
                                      {model.provider_name ? `${model.provider_name}: ` : ''}
                                      {model.name} {model.is_disabled ? '(API key inactive)' : ''} {/* Add indicator */}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <option value="" disabled>Loading models...</option>
                      )}
                    </select>

                    {/* Add Info Messages (copied from ModelSelector) */}
                    {privacyModeEnabled && (
                      <div className="mt-2 text-xs text-blue-600 dark:text-dark-link bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-200 dark:border-blue-800">
                        <span className="font-semibold">Privacy Mode Active:</span> Only local models are available.
                      </div>
                    )}
                    {!privacyModeEnabled && models.some(model => model.external_provider_id && model.is_disabled) && (
                      <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                        <span className="font-semibold">Note:</span> External models marked '(API key inactive)' cannot be used.
                      </div>
                    )}
                    {models.some(m => m.provider_name === 'Scalytics MCP') && (
                       <div className="mt-2 text-xs text-blue-600 dark:text-dark-link bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-200 dark:border-blue-800">
                         <span className="font-semibold">Note:</span> Scalytics MCP models don't require an API key.
                       </div>
                    )}
                    {/* End Info Messages */}
                    
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleStartChat}
                        disabled={!selectedModel}
                        className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 ${
                          !selectedModel ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                        Start New Chat
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Recent chats */}
              <div className="sm:col-span-2 bg-white dark:bg-dark-primary overflow-hidden shadow rounded-lg border dark:border-dark-border">
                <RecentChats
                  loading={loading.chats}
                  chats={recentChats}
                />
              </div>
            </div>
            
            {/* Quick actions */}
            <div className="mt-6 bg-white dark:bg-dark-primary shadow px-4 py-5 sm:px-6 rounded-lg border dark:border-dark-border">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary">Quick actions</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link
                  to="/settings"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-primary bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5 text-gray-400 dark:text-dark-text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Manage settings
                </Link>
                <Link
                  to="/settings/api-keys"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-primary bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5 text-gray-400 dark:text-dark-text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                  Manage API keys
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default DashboardPage;
