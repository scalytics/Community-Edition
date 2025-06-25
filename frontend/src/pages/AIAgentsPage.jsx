import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom'; 
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/common/Sidebar';
import apiService from '../services/apiService';
import { CogIcon } from '@heroicons/react/24/outline';
import ImageIcon from '../components/common/icons/ImageIcon'; 
import AIAgentsIcon from '../components/common/icons/AIAgentsIcon'; 
import ScalyticsSeekIcon from '../components/common/icons/ScalyticsSeekIcon'; 
import ToolConfigModal from '../components/agents/ToolConfigModal';
import AgentDetailPage from './AgentDetailPage';

const AIAgentsPage = () => {
  // --- Hooks ---
  const { user, loading: userLoading } = useAuth();
  const { taskId = null } = useParams();

  // State to hold the full tool definitions
  const [toolDefinitions, setToolDefinitions] = useState([]); 
  const [localToolStatuses, setLocalToolStatuses] = useState({}); 
  const [loadingTools, setLoadingTools] = useState(true);
  const [toolsError, setToolsError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedToolForConfig, setSelectedToolForConfig] = useState(null); 

  // Fetch full tool definitions
  const fetchToolDefinitions = useCallback(async () => {
    if (taskId) { 
      setLoadingTools(false);
      return;
    }
    const hasPermission = user?.isAdmin || user?.permissions?.includes('can_use_mcp_tools');
    if (!userLoading && !hasPermission) {
        setLoadingTools(false);
        setToolDefinitions([]);
        setLocalToolStatuses({});
        return;
    }
    if (userLoading) return;

    setLoadingTools(true);
    setToolsError('');
    try {
      const [definitionsResponse, statusesResponse] = await Promise.all([
        apiService.getAvailableToolDefinitions(), 
        apiService.get('/mcp/local-tools/status')  
      ]);

      if (definitionsResponse.success && Array.isArray(definitionsResponse.data)) {
        setToolDefinitions(definitionsResponse.data);
      } else {
        throw new Error(definitionsResponse.message || 'Failed to fetch tool definitions');
      }

      if (statusesResponse.success && typeof statusesResponse.data === 'object') {
        setLocalToolStatuses(statusesResponse.data);
      } else {
        console.warn('Could not fetch local tool statuses or data format incorrect.');
        setLocalToolStatuses({});
      }

    } catch (err) {
      console.error("Error fetching tool definitions or statuses:", err);
      if (err.response?.status === 403) {
         setToolsError('You do not have permission to view available tools.');
      } else {
         setToolsError(err.message || 'Could not load tool definitions/statuses.');
      }
      setToolDefinitions([]);
      setLocalToolStatuses({});
    } finally {
      setLoadingTools(false);
    }
  }, [taskId, user, userLoading]); 

  useEffect(() => {
    if (!userLoading) { 
       fetchToolDefinitions();
    }
  }, [fetchToolDefinitions, userLoading]); 

  // Update handler to pass the full tool object
  const handleConfigureClick = (tool) => {
    setSelectedToolForConfig(tool);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedToolForConfig(null);
  };

  const canUseTools = user?.isAdmin || user?.permissions?.includes('can_use_mcp_tools');

  const renderMainContent = () => {
    if (userLoading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    if (!canUseTools) {
       return (
         <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-dark-text-secondary p-8 text-center">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 text-red-400">
             <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
           </svg>
           <p className="text-lg font-semibold text-red-600 dark:text-red-400">Permission Denied</p>
           <p className="text-sm mt-1">You do not have permission to access AI Agents and Tools.</p>
        </div>
      );
    }

    if (!taskId) {
      if (loadingTools) {
        return <div className="text-center p-8">Loading available tools...</div>;
      }

      if (toolsError) {
        return (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md border dark:border-red-800">
              Error loading tool status: {toolsError}
            </div>
          </div>
        );
      }

      // Filter tools: show only if it's an external MCP tool OR an internal tool that's globally enabled
      const displayableTools = toolDefinitions.filter(tool => {
        if (tool.serverId && tool.serverId !== 'internal') { 
          return true; 
        }
        return localToolStatuses[tool.name] === true;
      });

      if (displayableTools.length === 0) {
        return (
          <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-dark-text-secondary p-8 text-center">
            <AIAgentsIcon className="h-16 w-16 mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No Tools Available</p>
            <p className="text-sm mt-1">There are currently no AI agent tools enabled or available for your account.</p>
          </div>
        );
      }

      return (
        <div className="p-4 sm:p-6 lg:p-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-text-primary mb-6">Available Tools</h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayableTools.map((tool) => {
              let displayName = tool.displayName || tool.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              if (tool.name === 'live-search') {
                displayName = 'Scalytics Live Search';
              }
              
              let IconComponent = CogIcon;
              if (tool.name === 'live-search') {
                IconComponent = ScalyticsSeekIcon;
              } else if (tool.name === 'image_gen') {
                IconComponent = ImageIcon; 
              }
              
              // isEnabled for configuration button refers to whether the tool itself is generally usable,
              // not to be confused with the global admin toggle for local tools.
              // For external tools, assume they are configurable if listed.
              // For internal tools, they are already filtered by localToolStatuses.
              const isConfigurable = true; 

              return (
                <div key={tool.name} className="bg-white dark:bg-dark-primary shadow-sm rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3">
                         <IconComponent className="h-6 w-6 text-blue-500" aria-hidden="true" />
                         <h3 className="text-md font-semibold text-gray-900 dark:text-dark-text-primary">{displayName}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-3 h-16 overflow-y-auto"> {/* Fixed height for description */}
                      {tool.description || 'No description provided.'}
                    </p>
                    <div className="flex justify-between items-center mt-auto pt-3 border-t border-gray-200 dark:border-dark-border"> {/* Ensure button is at bottom */}
                       <p className={`text-sm font-medium ${isConfigurable ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-dark-text-secondary'}`}>
                         {isConfigurable ? 'Configurable' : 'Not Configurable'}
                       </p>
                      <button
                        onClick={() => handleConfigureClick(tool)}
                        className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 dark:border-dark-border shadow-sm text-xs font-medium rounded text-gray-700 dark:text-dark-text-primary bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        disabled={!isConfigurable}
                      >
                         Configure
                       </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return <AgentDetailPage />;
  };

  return (
    <Sidebar>
      <div className="flex h-full overflow-hidden pt-1 bg-white dark:bg-dark-primary">
        <div className="flex-1 flex flex-col overflow-y-auto">
           {renderMainContent()}
         </div>
       </div>
       <ToolConfigModal
         isOpen={isModalOpen}
         onClose={handleCloseModal}
         tool={selectedToolForConfig}
       />
     </Sidebar>
   );
 };

export default AIAgentsPage;
