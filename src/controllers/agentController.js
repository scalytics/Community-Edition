const { db } = require('../models/db'); 
const providerManager = require('../services/providers'); 
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Model = require('../models/Model'); 
const { getSystemSetting } = require('../config/systemConfig');
const { UserCancelledError } = require('../utils/errorUtils'); 
const AgentService = require('../services/agents/AgentService'); 
const apiKeyService = require('../services/apiKeyService'); 
const MCPService = require('../services/agents/MCPService'); 

/**
 * Get MCP agents (models that support agent capabilities)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAgents = async (req, res) => {
  try {
    const mcpProvider = providerManager.getProvider('MCP');

    if (!mcpProvider) {
      return res.status(404).json({
        success: false,
        message: 'MCP provider not found'
      });
    }

    const models = await db.allAsync(`
      SELECT m.id, m.name, m.description, m.context_window, m.external_model_id,
             ap.name as provider_name
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      WHERE m.is_active = 1
      AND (ap.name = 'Scalytics MCP' OR ap.name = 'MCP')
    `);

    const agentsWithCapabilities = await Promise.all(models.map(async (model) => {
      let capabilities = [];
      try {
        if (mcpProvider.getModelCapabilities) {
          capabilities = await mcpProvider.getModelCapabilities(model.external_model_id);
        }
      } catch (error) {
        console.error(`Error fetching capabilities for model ${model.id}:`, error);
      }
      return {
        ...model,
        capabilities: capabilities,
        is_agent: true,
        supported_tools: capabilities.tools || []
      };
    }));

    res.status(200).json({
      success: true,
      count: agentsWithCapabilities.length,
      data: agentsWithCapabilities
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching agents'
    });
  }
};

/**
 * Get available MCP tools
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getMCPTools = async (req, res) => {
  try {
    const mcpProvider = providerManager.getProvider('MCP');

    if (!mcpProvider) {
      return res.status(404).json({
        success: false,
        message: 'MCP provider not found'
      });
    }

    let tools = [];
    if (mcpProvider.getAvailableTools) {
      tools = await mcpProvider.getAvailableTools();
    } else {
      tools = [
        // { id: 'web-search', name: 'Web Search', description: 'Search the web for information' },
        // { id: 'code-interpreter', name: 'Code Interpreter', description: 'Execute code to solve problems' },
        // { id: 'data-analysis', name: 'Data Analysis', description: 'Analyze data files uploaded by the user' },
        // { id: 'image-recognition', name: 'Image Recognition', description: 'Analyze and describe images' }
      ];
    }

    res.status(200).json({
      success: true,
      count: tools.length,
      data: tools
    });
  } catch (error) {
    console.error('Get MCP tools error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching MCP tools'
    });
  }
};

/**
 * Get agent capabilities
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAgentCapabilities = async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getAsync(`
      SELECT m.id, m.name, m.description, m.external_model_id, m.context_window,
             ap.name as provider_name
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      WHERE m.id = ? AND m.is_active = 1
    `, [agentId]);

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const mcpProvider = providerManager.getProvider('MCP');
    if (!mcpProvider) {
      return res.status(404).json({ success: false, message: 'MCP provider not found' });
    }

    let capabilities = {};
    try {
      if (mcpProvider.getModelCapabilities) {
        capabilities = await mcpProvider.getModelCapabilities(agent.external_model_id);
      } else {
        capabilities = {
          context_window: agent.context_window || 8192,
          supports_functions: true, supports_vision: false, supports_tools: true,
          // tools: ['web-search', 'code-interpreter', 'data-analysis']
          tools: []
        };
      }
    } catch (error) {
      console.error(`Error fetching capabilities for agent ${agentId}:`, error);
      capabilities = {
        context_window: agent.context_window || 8192,
        supports_functions: true, supports_tools: true,
        // tools: ['web-search', 'code-interpreter']
        tools: []
      };
    }

    res.status(200).json({ success: true, data: { ...agent, capabilities } });
  } catch (error) {
    console.error('Get agent capabilities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching agent capabilities' });
  }
};

/**
 * Start a chat with selected agents/tools
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.startAgentChat = async (req, res) => {
  try {
    const { agentIds, title } = req.body;
    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least one agent ID' });
    }
    const primaryAgent = await db.getAsync(`SELECT m.id, m.name FROM models m WHERE m.id = ? AND m.is_active = 1`, [agentIds[0]]);
    if (!primaryAgent) {
      return res.status(404).json({ success: false, message: 'Primary agent not found' });
    }
    const chatId = await Chat.create({ userId: req.user.id, modelId: primaryAgent.id, title: title || `Chat with ${primaryAgent.name}` });
    await db.runAsync('INSERT INTO chat_metadata (chat_id, key, value) VALUES (?, ?, ?)', [chatId, 'selected_agents', JSON.stringify(agentIds)]);
    let systemMessage = `This chat uses the Scalytics MCP agent "${primaryAgent.name}".`;
    if (agentIds.length > 1) systemMessage += ` Additional tools have been enabled: ${agentIds.slice(1).join(', ')}.`;
    await Message.create({ chat_id: chatId, role: 'system', content: systemMessage });
    const chat = await Chat.findById(chatId);
    res.status(201).json({ success: true, message: 'Agent chat created successfully', data: chat });
  } catch (error) {
    console.error('Start agent chat error:', error);
    res.status(500).json({ success: false, message: 'Error starting agent chat' });
  }
};

/**
 * Handle Live Search Request
 * Orchestrates fetching search results, filtering, and AI analysis.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.handleDeepSearchRequest = async (req, res) => {
  const { query, title, fileIds } = req.body;
  const userId = req.user?.id;

  // --- Basic Validation ---
  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }
  if (!query && (!fileIds || fileIds.length === 0)) {
    return res.status(400).json({ success: false, message: 'Search query or file upload is required.' });
  }

  // --- Fetch User Tool Config for 'live-search' ---
  let reasoningModelName; 
  let actualModelIdentifier; 
  try {
    const configRow = await db.getAsync(
      'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
      [userId, 'live-search'] 
    );

    if (!configRow || !configRow.config) {
      console.warn(`[Live Search Ctrl] User ${userId} attempted live search without configuration for 'live-search'.`);
      return res.status(400).json({ success: false, message: 'Live Search configuration not found. Please configure the tool models in the Agent settings.' });
    }

    const toolConfig = JSON.parse(configRow.config);
    reasoningModelName = toolConfig.reasoningModelName;

    // Validate reasoningModelName
    if (!reasoningModelName || typeof reasoningModelName !== 'string' || reasoningModelName.trim() === '') {
      console.warn(`[Live Search Ctrl] User ${userId} has incomplete configuration (missing or invalid reasoningModelName). Config:`, toolConfig);
      return res.status(400).json({ success: false, message: 'Live Search configuration is incomplete or invalid. Please configure the reasoning model.' });
    }
    reasoningModelName = reasoningModelName.trim(); 

    // --- Resolve Model ID to Name/External ID if necessary ---
    actualModelIdentifier = reasoningModelName; 
    if (/^\d+$/.test(reasoningModelName)) { 
        try {
            const modelRecord = await db.getAsync(
                'SELECT name, external_model_id FROM models WHERE id = ?',
                [parseInt(reasoningModelName, 10)]
            );
            if (!modelRecord) {
                throw new Error(`Configured reasoning model ID ${reasoningModelName} not found in the database.`);
            }
            actualModelIdentifier = modelRecord.external_model_id || modelRecord.name;
        } catch (resolveError) {
            console.error(`[Live Search Ctrl] Error resolving reasoning model ID ${reasoningModelName}:`, resolveError);
            return res.status(500).json({ success: false, message: `Failed to resolve configured reasoning model: ${resolveError.message}` });
        }
    } else {
    }

  } catch (err) {
    console.error(`[Live Search Ctrl] Error fetching/parsing/resolving tool config for user ${userId}:`, err);
    const userMessage = err instanceof SyntaxError ? 'Stored configuration is invalid.' : `Failed to load tool configuration: ${err.message}`;
     return res.status(500).json({ success: false, message: userMessage });
  }

  let chatId;
  let initialUserMessage;
  let userDefaultModelId;
  try {
    const userSettings = await db.getAsync('SELECT default_model_id FROM user_settings WHERE user_id = ?', [userId]);
    userDefaultModelId = userSettings?.default_model_id;

    if (!userDefaultModelId) {
        const systemDefault = await db.getAsync('SELECT id FROM models WHERE is_default = 1 AND is_active = 1 LIMIT 1');
        userDefaultModelId = systemDefault?.id;
    }

    if (!userDefaultModelId) {
        const anyActiveModel = await db.getAsync('SELECT id FROM models WHERE is_active = 1 LIMIT 1');
        userDefaultModelId = anyActiveModel?.id;
    }

    if (!userDefaultModelId) {
        console.error(`[Live Search Ctrl] Could not determine a default model for user ${userId} or system.`);
        return res.status(500).json({ success: false, message: 'Could not determine a default model to create the chat.' });
    }

    const chatTitleBase = query ? query : (fileIds && fileIds.length > 0 ? `Analysis of ${fileIds.length} file(s)` : 'Live Search Task');
    const finalChatTitle = title || `Live Search: ${chatTitleBase.substring(0, 30)}${chatTitleBase.length > 30 ? '...' : ''}`;

    chatId = await Chat.create({ userId, modelId: userDefaultModelId, title: finalChatTitle });

    const userMessageId = await Message.create({ chat_id: chatId, role: 'user', content: query || `Initiated task with ${fileIds.length} file(s).` });
    initialUserMessage = await Message.findById(userMessageId);

    res.status(201).json({ success: true, message: 'Deep search chat created.', data: { chatId, initialUserMessage } });

  } catch (chatCreateError) {
    console.error('[Live Search] Error creating initial chat/message:', chatCreateError);
    if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Failed to initialize live search chat.' });
    } else {
        console.error('[Live Search] Headers already sent, could not send chat creation error response.');
        return; 
    }
  }

  // Ensure chatId is valid before proceeding
  if (!chatId) {
      console.error('[Live Search Ctrl] Chat ID is invalid after chat creation attempt.');
      return;
  }

  // --- Trigger the Asynchronous Internal Tool Call ---
  MCPService.callInternalTool( 
      'live-search',       
      { 
        query,
        reasoningModelName: actualModelIdentifier, 
        fileIds
      },
      { 
      userId,
      chatId
    }
  ).catch(mcpError => {
      console.error(`[Live Search Ctrl] Failed to trigger MCP tool 'live-search' for chat ${chatId}:`, mcpError);
      Message.create({ chat_id: chatId, role: 'system', content: `Error: Failed to start the Live Search process. ${mcpError.message}` }).catch(console.error);
  });

};


/**
 * Runs an internal MCP tool within the context of an existing chat.
 * @param {Object} req - Request object (expects chatId in params, toolName and args in body)
 * @param {Object} res - Response object
 */
exports.runToolInChat = async (req, res) => {
    const { chatId } = req.params;
    const { toolName, args } = req.body; 
    const userId = req.user?.id;

    // --- Basic Validation ---
    if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }
    if (!chatId || isNaN(parseInt(chatId, 10))) {
        return res.status(400).json({ success: false, message: 'Valid Chat ID is required.' });
    }
    if (!toolName) {
        return res.status(400).json({ success: false, message: 'Tool name is required.' });
    }
    if (!args || typeof args !== 'object') {
        return res.status(400).json({ success: false, message: 'Tool arguments are required.' });
    }
    // Specific validation for live-search query
    if (toolName === 'live-search' && (!args.query || typeof args.query !== 'string')) {
         return res.status(400).json({ success: false, message: 'Query argument is required for live-search tool.' });
    }

    const numericChatId = parseInt(chatId, 10);

    try {
        // --- Verify Chat Ownership ---
        const chat = await Chat.findById(numericChatId);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found.' });
        }
        if (chat.user_id !== userId) {
            return res.status(403).json({ success: false, message: 'User does not own this chat.' });
        }

        // --- Save User's Query/Trigger as a Message ---
        let userMessageContent = `Using tool: ${toolName}`;
        if (args.query) {
            userMessageContent = args.query; 
        } else if (args.fileIds && args.fileIds.length > 0) {
             userMessageContent = `Initiated ${toolName} with ${args.fileIds.length} file(s).`;
        }

        const userMessageId = await Message.create({
            chat_id: numericChatId,
            role: 'user',
            content: userMessageContent
        });
        const initialUserMessage = await Message.findById(userMessageId); 

        // --- Respond Immediately ---
        res.status(202).json({
            success: true,
            message: `Tool '${toolName}' started successfully in chat ${numericChatId}.`,
            data: { chatId: numericChatId, userMessage: initialUserMessage } 
        });

        // --- Trigger Asynchronous Tool Call ---
        const toolContext = { userId, chatId: numericChatId };
        let toolArgs = { ...args }; 

        if (toolName === 'live-search') {
            const configRow = await db.getAsync(
                'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
                [userId, 'live-search']
            );
            // For the simplified live search, configuration is optional
            if (configRow && configRow.config) {
                const toolConfig = JSON.parse(configRow.config);
                
                if (toolConfig.max_results !== undefined) {
                    toolArgs.max_results = toolConfig.max_results;
                }
            }
        }


        MCPService.callInternalTool(toolName, toolArgs, toolContext)
            .then(result => {
            })
            .catch(toolError => {
                console.error(`[Agent Ctrl] Background execution of internal tool '${toolName}' for chat ${numericChatId} failed:`, toolError);
                let systemMessageContent;
                if (toolError instanceof UserCancelledError) {
                    systemMessageContent = toolError.message; 
                                                            
                } else {
                    systemMessageContent = `Error running tool '${toolName}': ${toolError.message}`;
                }
                Message.create({ chat_id: numericChatId, role: 'system', content: systemMessageContent }).catch(console.error);
            });

    } catch (error) {
        console.error(`[Agent Ctrl] Error running tool '${toolName}' in chat ${numericChatId}:`, error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: `Failed to run tool: ${error.message}` });
        }
    }
};


module.exports = exports;
