import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import modelService from '../services/modelService';

const AgentSelector = ({ 
  selectedAgentId, 
  onAgentSelect,
  disabled = false
}) => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fetch available agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        
        // Get all Scalytics MCP agents
        const agentData = await modelService.getMCPAgents();
        
        // Sort by name for better user experience
        const sortedAgents = agentData.sort((a, b) => a.name.localeCompare(b.name));
        
        setAgents(sortedAgents);
        
        // Auto-select first agent if none selected and agents available
        if (!selectedAgentId && sortedAgents.length > 0 && onAgentSelect) {
          onAgentSelect(sortedAgents[0].id);
        }
        
        setError('');
      } catch (err) {
        console.error('Error fetching agents:', err);
        setError('Failed to load AI agents');
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, [selectedAgentId, onAgentSelect]);

  const handleAgentChange = (e) => {
    const agentId = Number(e.target.value);
    if (onAgentSelect) {
      onAgentSelect(agentId);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse h-10 bg-gray-200 rounded"></div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm p-2 border border-red-200 rounded bg-red-50">
        {error}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-yellow-700 text-sm p-2 border border-yellow-200 rounded bg-yellow-50">
        No Scalytics MCP agents available.
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="agent-selector" className="block text-sm font-medium text-gray-700 mb-1">
        Select AI Agent
      </label>
      <select
        id="agent-selector"
        value={selectedAgentId || ''}
        onChange={handleAgentChange}
        disabled={disabled}
        className={`
          block w-full pl-3 pr-10 py-2 text-base border-gray-300 
          focus:outline-none focus:ring-blue-500 focus:border-blue-500 
          sm:text-sm rounded-md
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
        `}
      >
        <option value="" disabled>Select an AI agent</option>
        
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      
      {selectedAgentId && agents.find(a => a.id === selectedAgentId) && (
        <div className="mt-2 text-xs text-gray-600">
          {agents.find(a => a.id === selectedAgentId).description}
        </div>
      )}
      
      <p className="mt-1 text-xs text-gray-500">
        {disabled 
          ? "You can't change agents in an existing chat" 
          : "Select the AI agent you want to chat with"}
      </p>
    </div>
  );
};

AgentSelector.propTypes = {
  selectedAgentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onAgentSelect: PropTypes.func,
  disabled: PropTypes.bool
};

export default AgentSelector;