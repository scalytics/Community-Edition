import apiService from './apiService'; 

const agentService = {
  /**
   * Get all available MCP agents
   * @returns {Promise<Array>} - Array of agent objects
   */
  getAgents: async () => {
    try {
      const response = await apiService.get('/api/agents'); 
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching agents:', error);
      throw error;
    }
  },

  /**
   * Start a chat with selected agents
   * @param {Array} agentIds - IDs of selected agents 
   * @returns {Promise<Object>} - Chat creation response
   */
  startAgentChat: async (agentIds) => {
    try {
      const response = await apiService.post('/api/chats/agent', { agentIds }); 
      return response.data.data;
    } catch (error) {
      console.error('Error starting agent chat:', error);
      throw error;
    }
  },

  /**
   * Get agent capabilities
   * @param {number} agentId - Agent ID
   * @returns {Promise<Object>} - Agent capabilities
   */
  getAgentCapabilities: async (agentId) => {
    try {
      const response = await apiService.get(`/api/agents/${agentId}/capabilities`); 
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching capabilities for agent ${agentId}:`, error);
      throw error;
    }
  },

  /**
   * Get MCP tools (specialized form of agents)
   * @returns {Promise<Array>} - Array of tool objects
   */
  getMCPTools: async () => {
    try {
      const response = await apiService.get('/api/agents/tools'); 
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching MCP tools:', error);
      throw error;
    }
  }
};

export default agentService;
