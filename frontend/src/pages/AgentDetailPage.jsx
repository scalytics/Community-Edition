import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import modelService from '../services/modelService';

// Tools Icon
const ToolsIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
  </svg>
);

const AgentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTools, setSelectedTools] = useState([]);

  useEffect(() => {
    const fetchAgentDetails = async () => {
      try {
        setLoading(true);
        // Use the enhanced model service to get agent capabilities
        const agentDetails = await modelService.getMCPAgentCapabilities(id);
        setAgent(agentDetails);
        
        // Initialize with all tools if available
        if (agentDetails.capabilities && agentDetails.capabilities.tools) {
          setSelectedTools(agentDetails.capabilities.tools);
        }
      } catch (err) {
        console.error('Error fetching agent details:', err);
        setError('Failed to load agent details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAgentDetails();
    }
  }, [id]);

  const handleToolToggle = (toolId) => {
    setSelectedTools(prev => {
      if (prev.includes(toolId)) {
        return prev.filter(id => id !== toolId);
      } else {
        return [...prev, toolId];
      }
    });
  };

  const handleStartChat = async () => {
    try {
      // Use the enhanced model service to start an MCP chat
      const chat = await modelService.startMCPChat(parseInt(id, 10), selectedTools);
      
      // Navigate to the new chat
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error('Error starting agent chat:', err);
      setError('Failed to start chat with this agent');
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </Sidebar>
    );
  }

  if (error) {
    return (
      <Sidebar>
        <div className="bg-red-50 border-l-4 border-red-400 p-4 m-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <button 
                className="mt-2 text-sm text-blue-600 hover:underline"
                onClick={() => navigate('/ai-agents')}
              >
                Return to AI Agents
              </button>
            </div>
          </div>
        </div>
      </Sidebar>
    );
  }

  if (!agent) {
    return (
      <Sidebar>
        <div className="text-center py-12">
          <p className="text-gray-500">Agent not found</p>
          <button 
            className="mt-2 text-sm text-blue-600 hover:underline"
            onClick={() => navigate('/ai-agents')}
          >
            Return to AI Agents
          </button>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Agent Header */}
        <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg mb-6">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">{agent.name}</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{agent.description}</p>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                Scalytics MCP
              </span>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-dark-border px-4 py-5 sm:p-0">
            <dl className="sm:divide-y sm:divide-gray-200 dark:sm:divide-dark-border">
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Context Window</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                  {agent.capabilities?.context_window || agent.context_window || 'Unknown'} tokens
                </dd>
              </div>
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Supports Vision</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                  {agent.capabilities?.supports_vision ? 'Yes' : 'No'}
                </dd>
              </div>
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Supports Function Calling</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                  {agent.capabilities?.supports_functions ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Available Tools Section */}
        <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg mb-6">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Available Tools</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Select the tools you want to enable for this agent
            </p>
          </div>
          <div className="border-t border-gray-200 dark:border-dark-border px-4 py-5 sm:px-6">
            {agent.capabilities?.tools && agent.capabilities.tools.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {agent.capabilities.tools.map((tool) => (
                  <div 
                    key={typeof tool === 'string' ? tool : tool.id}
                    className={`relative rounded-lg border ${
                      selectedTools.includes(tool) ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-dark-border'
                    } px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 dark:hover:border-gray-500 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500`}
                    onClick={() => handleToolToggle(tool)}
                  >
                    <div className="flex-shrink-0">
                      <ToolsIcon className={`h-6 w-6 ${selectedTools.includes(tool) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {typeof tool === 'string' ? tool : tool.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {typeof tool === 'object' && tool.description ? tool.description : 'Enable this tool for the agent'}
                      </p>
                    </div>
                    {selectedTools.includes(tool) && (
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <ToolsIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">
                  No additional tools available for this agent.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Start Chat Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleStartChat}
            disabled={selectedTools.length === 0}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
              ${selectedTools.length > 0 
                ? 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                : 'bg-blue-300 cursor-not-allowed'
              }`}
          >
            Start Chat with {agent.name}
          </button>
        </div>
      </div>
    </Sidebar>
  );
};

export default AgentDetailPage;
