import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom'; 
import modelService from '../../services/modelService'; 
import eventBus from '../../utils/eventBus';

const AIAgentsIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17c.612-1.576 1.707-3 3-3h8c1.293 0 2.388 1.424 3 3M11 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 3a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-9 2a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6-4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>
);
const ScalyticsSeekIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
  </svg>
);


const AgentList = ({
  selectedAgentTaskId, 
  onAgentTaskSelected, 
  refreshTrigger = 0,
}) => {
  const [agents, setAgents] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation(); 

  // State for collapsible sections (optional, can default to open)
  const [isTasksOpen, setIsTasksOpen] = useState(true);
  const [isAgentsOpen, setIsAgentsOpen] = useState(true);

  // Fetch MCP Agents
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const allModels = await modelService.getModels();
      const mcpAgents = allModels.filter(model =>
        model.provider_name === 'Scalytics MCP' || model.provider_name === 'MCP'
      );
      setAgents(mcpAgents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError('Could not load AI agents.');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [refreshTrigger, fetchAgents]);

  // Handle selecting an agent task (like Scalytics Live Search or a specific agent)
  const handleAgentTaskClick = (taskId) => {
    if (onAgentTaskSelected) {
      onAgentTaskSelected(taskId);
    }
    if (taskId === 'scalytics-seek') {
      navigate('/ai-agents/scalytics-seek');
    } else {
      navigate(`/ai-agents/${taskId}`); 
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
          className="mt-2 text-blue-500 dark:text-dark-link hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentSelection = location.pathname.split('/ai-agents/')[1] || null;

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-dark-primary border-r dark:border-dark-border">
       <div className="p-4 border-b dark:border-dark-border">
         <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Agent Tasks</h2>
       </div>

      {/* Agent Task list sections */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-4">

        {/* Scalytics Live Search Section */}
        <div className="py-1">
            <button
              onClick={() => setIsTasksOpen(!isTasksOpen)}
              className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <span>Tools</span>
              <svg className={`w-4 h-4 transform transition-transform ${isTasksOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isTasksOpen && (
              <div className="mt-1 space-y-1">
                 {/* Static Scalytics Live Search Button/Link */}
                 <button 
                   key="scalytics-seek"
                   className={`
                     flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors group text-left
                     ${currentSelection === 'scalytics-seek'
                       ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-900 dark:text-teal-100 shadow-sm'
                       : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/70'}
                   `}
                   onClick={() => handleAgentTaskClick('scalytics-seek')}
                 >
                   <ScalyticsSeekIcon className="flex-shrink-0 h-5 w-5 mr-3 text-teal-500 dark:text-teal-400" />
                   <span className="truncate">Scalytics Live Search</span>
                 </button>
              </div>
            )}
        </div>


        {/* MCP Agents Section */}
        <div className="py-1">
           <button
             onClick={() => setIsAgentsOpen(!isAgentsOpen)}
             className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
           >
             <span>MCP Agents ({agents.length})</span>
             <svg className={`w-4 h-4 transform transition-transform ${isAgentsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
           </button>
           {isAgentsOpen && (
             <div className="mt-1 space-y-1">
              {agents && agents.length > 0 ? (
                agents.map((agent) => (
                <button 
                  key={`agent-${agent.id}`}
                  className={`
                    flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors group text-left
                    ${String(currentSelection) === String(agent.id) 
                      ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-900 dark:text-dark-text-primary shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/70'}
                  `}
                  onClick={() => handleAgentTaskClick(agent.id)}
                >
                  <AIAgentsIcon className="flex-shrink-0 h-5 w-5 mr-3 text-gray-400 dark:text-gray-500" />
                  <span className="truncate">{agent.name || 'Unnamed Agent'}</span>
                  {/* No delete button needed here */}
                </button>
                ))
              ) : (
                isAgentsOpen && (
                  <div className="text-center px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                    No MCP agents found.
                  </div>
                )
              )}
            </div>
           )}
        </div>

      </div>
    </div>
  );
};

AgentList.propTypes = {
  selectedAgentTaskId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onAgentTaskSelected: PropTypes.func,
  refreshTrigger: PropTypes.number
};

export default AgentList;
