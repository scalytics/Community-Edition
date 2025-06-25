const { getSystemSetting } = require('../../config/systemConfig');
const { db } = require('../../models/db');
const eventBus = require('../../utils/eventBus');
const { UserCancelledError } = require('../../utils/errorUtils');
const Message = require('../../models/Message'); 
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises; 
const fsSync = require('fs'); 
const activeClients = new Map();
let internalToolsCache = []; 

const promisifyDbMethods = (dbInstance) => {
    if (!dbInstance.runAsync) {
        dbInstance.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
            dbInstance.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
        });
    }
    if (!dbInstance.getAsync) {
        dbInstance.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
            dbInstance.get(sql, params, (err, row) => { err ? reject(err) : resolve(row); });
        });
    }
    if (!dbInstance.allAsync) {
        dbInstance.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
            dbInstance.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows); });
        });
    }
     if (!dbInstance.execAsync) {
        dbInstance.execAsync = (sql) => new Promise((resolve, reject) => {
            dbInstance.exec(sql, (err) => { err ? reject(err) : resolve(); });
        });
    }
     if (!dbInstance.prepareAsync) {
        dbInstance.prepareAsync = (sql) => new Promise((resolve, reject) => {
            const stmt = dbInstance.prepare(sql, (err) => { err ? reject(err) : resolve(stmt); });
        });
    }
     if (!dbInstance.finalizeAsync) {
        dbInstance.finalizeAsync = (stmt) => new Promise((resolve, reject) => {
            stmt.finalize((err) => { err ? reject(err) : resolve(); });
        });
    }
     if (!dbInstance.runAsyncPrepared) { 
        dbInstance.runAsyncPrepared = (stmt, params = []) => new Promise((resolve, reject) => {
             stmt.run(params, function(err) { err ? reject(err) : resolve(this); });
        });
    }
};
promisifyDbMethods(db);



/**
 * Updates the status of an MCP server in the database.
 */
async function updateServerStatus(serverId, status, error = null) {
    try {
        await db.runAsync(
            `UPDATE mcp_servers SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP ${status === 'connected' ? ', last_seen = CURRENT_TIMESTAMP' : ''} WHERE id = ?`,
             [status, error ? error.message.substring(0, 255) : null, serverId]
         );
     } catch (dbError) {
         console.error(`[MCPService] Failed to update status for server ${serverId}:`, dbError);
    }
}

/**
 * Disconnects a specific client and updates status.
 */
 async function disconnectClient(serverId, reason = 'manual disconnect') {
     if (activeClients.has(serverId)) {
         const { client, serverInfo } = activeClients.get(serverId);
         try {
             await client.close();
        } catch (closeError) {
            console.error(`[MCPService] Error during explicit close for server ${serverId}:`, closeError);
        }
        activeClients.delete(serverId);
        await updateServerStatus(serverId, 'disconnected', new Error(reason));
    }
}

/**
 * Connects to a single MCP server based on its configuration.
  */
 async function connectToServer(server) {
      if (activeClients.has(server.id)) {
          return;
      }
 
      await updateServerStatus(server.id, 'connecting');
      let client = null;

     try {
         const { MCPClient } = await import('mcp-client');
         client = new MCPClient();
         const details = JSON.parse(server.connection_details);
 
          client.onClose = async () => {
              activeClients.delete(server.id);
              await updateServerStatus(server.id, 'disconnected');
         };
         client.onError = async (error) => {
             console.error(`[MCPService] Connection error for server ${server.name} (ID: ${server.id}):`, error);
             activeClients.delete(server.id);
             await updateServerStatus(server.id, 'error', error);
         };

         if (server.connection_type === 'websocket') {
             if (!details.url || !details.url.startsWith('ws')) {
                 throw new Error(`Invalid or missing 'url' for WebSocket server ${server.name}`);
             }
             await client.connect(details.url, {});
         } else if (server.connection_type === 'command') {
             if (!details.command) throw new Error(`Missing 'command' for command server ${server.name}`);
             const args = details.args || [];
             const commandPath = details.command.startsWith('/') ? details.command : path.join(process.cwd(), details.command);
             await client.connectViaCommand(commandPath, args);
         } else if (server.connection_type === 'stdio') {
             throw new Error('Connection type "stdio" requires external process management.');
         } else {
               throw new Error(`Unsupported connection type: ${server.connection_type}`);
          }
 
          activeClients.set(server.id, { client, serverInfo: server });
          await updateServerStatus(server.id, 'connected');

     } catch (connectError) {
         console.error(`[MCPService] Failed to connect to server ${server.name} (ID: ${server.id}):`, connectError);
         await updateServerStatus(server.id, 'error', connectError);
         if (client) { try { await client.close(); } catch {} }
         activeClients.delete(server.id);
     }
}


/**
 * Initializes the MCP Service, reads active servers, attempts connections,
  * and ensures local tool status entries exist.
  */
 async function initializeMCPService() {
     for (const serverId of activeClients.keys()) {
         await disconnectClient(serverId, 're-initialization');
    }
    activeClients.clear();

    try {
        const activeServers = await db.allAsync(
            `SELECT id, name, connection_type, connection_details, api_key_hash
              FROM mcp_servers WHERE is_active = 1`
         );
         await Promise.all(activeServers.map(server => connectToServer(server)));
     } catch (error) {
         console.error('[MCPService] Error during external server initialization:', error);
    }

     try {
         const internalTools = getInternalToolsFromConfig();
         if (internalTools && internalTools.length > 0) {
             const upsertSql = `
                 INSERT INTO mcp_local_tools_status (tool_name, is_active)
                 VALUES (?, 1)
                 ON CONFLICT(tool_name) DO UPDATE SET
                     is_active = excluded.is_active,
                     updated_at = CURRENT_TIMESTAMP;
             `;
             const upsertStmt = await db.prepareAsync(upsertSql);
             for (const tool of internalTools) {
                 if (tool && tool.name) {
                     await db.runAsyncPrepared(upsertStmt, [tool.name]);
                 } else { 
                     console.warn('[MCPService] Found invalid tool definition in config, skipping status upsert.');
                 }
             }
             await db.finalizeAsync(upsertStmt);
             
         }
    } catch (dbError) {
         console.error('[MCPService] Error ensuring status entries for internal tools:', dbError);
     }
 
}


/**
 * Discovers internal tools by scanning the mcp_tools directory.
 */
async function discoverInternalTools() {
    const toolsDir = path.join(__dirname, '..', '..', 'mcp_tools'); // Navigate up two levels
    const discoveredTools = [];
    try {
        const entries = await fs.readdir(toolsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const toolDir = path.join(toolsDir, entry.name);
                const toolJsonPath = path.join(toolDir, 'tool.json');
                try {
                    // Check if tool.json exists
                    await fs.access(toolJsonPath, fsSync.constants.R_OK); // Use fsSync constants with promises access
                    const toolJsonContent = await fs.readFile(toolJsonPath, 'utf-8');
                    const toolDefinition = JSON.parse(toolJsonContent);

                    // Validation:
                    // - Must have a name and arguments_schema.
                    // - If it's NOT config-only, it must have path and function_name.
                    const isConfigOnlyTool = toolDefinition.is_internal_config_only === true;
                    const hasBaseRequirements = toolDefinition.name && toolDefinition.arguments_schema;
                    const hasExecutableRequirements = toolDefinition.path && toolDefinition.function_name;

                    if (hasBaseRequirements && (isConfigOnlyTool || hasExecutableRequirements)) {
                        discoveredTools.push(toolDefinition);
                        console.log(`[MCPService Discovery] Discovered internal tool: ${toolDefinition.name} (Config-only: ${isConfigOnlyTool})`);
                    } else {
                        let missingFields = [];
                        if (!toolDefinition.name) missingFields.push("name");
                        if (!toolDefinition.arguments_schema) missingFields.push("arguments_schema");
                        if (!isConfigOnlyTool && !hasExecutableRequirements) {
                            if (!toolDefinition.path) missingFields.push("path");
                            if (!toolDefinition.function_name) missingFields.push("function_name");
                        }
                        console.warn(`[MCPService Discovery] Invalid tool definition in ${toolJsonPath}. Missing/invalid fields: ${missingFields.join(', ')}.`);
                    }
                } catch (err) {
                    if (err.code !== 'ENOENT') { // Ignore if tool.json doesn't exist, log other errors
                        console.error(`[MCPService Discovery] Error reading or parsing ${toolJsonPath}:`, err);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`[MCPService Discovery] Error reading mcp_tools directory (${toolsDir}):`, err);
    }
    return discoveredTools;
}


/**
 * Initializes the MCP Service, reads active servers, attempts connections,
 * discovers internal tools, and ensures local tool status entries exist.
 */
async function initializeMCPService() {
    // Disconnect existing clients
    for (const serverId of activeClients.keys()) {
        await disconnectClient(serverId, 're-initialization');
    }
    activeClients.clear();

    // Discover internal tools first
    try {
        internalToolsCache = await discoverInternalTools();
        console.log(`[MCPService Init] Discovered ${internalToolsCache.length} internal tools.`);
    } catch (discoveryError) {
        console.error('[MCPService Init] Error during internal tool discovery:', discoveryError);
        internalToolsCache = []; // Ensure cache is empty on error
    }

    // Connect to external servers
    try {
        const activeServers = await db.allAsync(
            `SELECT id, name, connection_type, connection_details, api_key_hash
             FROM mcp_servers WHERE is_active = 1`
        );
        await Promise.all(activeServers.map(server => connectToServer(server)));
    } catch (error) {
        console.error('[MCPService Init] Error during external server initialization:', error);
    }

    // Ensure status entries for discovered internal tools
    try {
        // Use the discovered tools from the cache
        if (internalToolsCache.length > 0) {
            const upsertSql = `
                INSERT INTO mcp_local_tools_status (tool_name, is_active)
                VALUES (?, 1)
                ON CONFLICT(tool_name) DO UPDATE SET
                    is_active = excluded.is_active,
                    updated_at = CURRENT_TIMESTAMP;
            `;
            const upsertStmt = await db.prepareAsync(upsertSql);
            for (const tool of internalToolsCache) { // Iterate over cached tools
                if (tool && tool.name) {
                    await db.runAsyncPrepared(upsertStmt, [tool.name]);
                } else {
                    console.warn('[MCPService Init] Found invalid tool definition during status upsert, skipping.');
                }
            }
            await db.finalizeAsync(upsertStmt);
        }
    } catch (dbError) {
        console.error('[MCPService Init] Error ensuring status entries for internal tools:', dbError);
    }
}

/**
 * Handles updates to server configurations (e.g., from admin UI).
 */
async function handleServerUpdate(updatedServerConfig) {
      const serverId = updatedServerConfig.id;
      const existingClientEntry = activeClients.get(serverId);

     if (!updatedServerConfig.is_active) {
         await disconnectClient(serverId, 'server deactivated');
         return;
     }

     if (existingClientEntry) {
         const oldDetails = JSON.stringify(JSON.parse(existingClientEntry.serverInfo.connection_details));
          const newDetails = JSON.stringify(JSON.parse(updatedServerConfig.connection_details));
          if (oldDetails !== newDetails || existingClientEntry.serverInfo.connection_type !== updatedServerConfig.connection_type) {
              await disconnectClient(serverId, 'configuration changed');
              await connectToServer(updatedServerConfig);
          } else {
               if (existingClientEntry.client.isConnected) {
                    await updateServerStatus(serverId, 'connected');
               } else {
                    await connectToServer(updatedServerConfig);
               }
          }
      } else {
          await connectToServer(updatedServerConfig);
      }
}

/**
  * Handles server deletion.
  */
 async function handleServerDelete(serverId) {
     await disconnectClient(serverId, 'server deleted');
 }


/**
 * Calls a tool provided by a connected external MCP server.
 * Internal tools defined in mcp-plugins.json are handled separately (e.g., in AgentService).
 */
async function callMCPTool(serverIdentifier, toolName, args) {
    const isAirGapped = getSystemSetting('air_gapped_mode', 'false') === 'true';

    const serverId = Number(serverIdentifier); // Attempt to treat identifier as external server ID first
    const clientEntry = activeClients.get(serverId);
    const internalTool = internalToolsCache.find(t => t.name === toolName);

    // Check if it's an internal tool being called via external mechanism
    if (internalTool && clientEntry) {
        // This scenario shouldn't happen if routing logic is correct, but good to check.
        throw new Error(`Tool '${toolName}' is defined internally but called via external MCP mechanism for server ID ${serverId}. Check service logic.`);
    }

    // If it's not an internal tool and no external client is found
    if (!internalTool && !clientEntry) {
        throw new Error(`MCP Server with ID ${serverId} is not connected or registered, and '${toolName}' is not a known internal tool.`);
    }

    // If it's an internal tool, it should be handled elsewhere (e.g., AgentService calling the function directly)
    // This function is specifically for EXTERNAL MCP calls.
    if (internalTool) {
         throw new Error(`Internal tool '${toolName}' cannot be called via the external MCPService.callMCPTool function.`);
    }

    // Proceed with external call if clientEntry exists
    const { client, serverInfo } = clientEntry;

    let isExternal = false;
    try {
        const details = JSON.parse(serverInfo.connection_details);
        if (serverInfo.connection_type === 'websocket' && details.url && !details.url.includes('localhost') && !details.url.includes('127.0.0.1')) {
            isExternal = true;
        }
    } catch { }

    if (isAirGapped && isExternal) {
         throw new Error(`Cannot call external MCP tool '${toolName}' on server '${serverInfo.name}' (ID: ${serverId}) in Air Gapped mode.`);
     }
 
     try {
         const result = await client.callTool(toolName, args);
         return result;
     } catch (error) {
        console.error(`[MCPService] Error calling tool '${toolName}' on server '${serverInfo.name}':`, error);
        await updateServerStatus(serverId, 'error', error);
        throw error;
    }
}

/**
 * Retrieves a list of available tools from all connected external servers.
  * Includes internal tools defined in mcp-plugins.json if they are marked active.
  */
 async function listMCPTools() {
     let allTools = [];
 
    const externalResults = await Promise.allSettled(
        Array.from(activeClients.entries()).map(async ([serverId, clientEntry]) => {
            try {
                const tools = await clientEntry.client.listTools();
                return tools.map(tool => ({ ...tool, serverId, serverName: clientEntry.serverInfo.name }));
            } catch (error) {
                console.error(`[MCPService] Error listing tools for server ${clientEntry.serverInfo.name} (ID: ${serverId}):`, error);
                await updateServerStatus(serverId, 'error', error);
                return [];
            }
        })
    );

    externalResults.forEach(result => {
        if (result.status === 'fulfilled') {
            allTools = allTools.concat(result.value);
        }
    });

    try {
        // Use the cached internal tools
        const activeLocalToolStatuses = await db.allAsync(
            'SELECT tool_name FROM mcp_local_tools_status WHERE is_active = 1'
        );
        const activeLocalToolNames = new Set(activeLocalToolStatuses.map(row => row.tool_name));

        // Add active internal tools from cache
        internalToolsCache.forEach(tool => {
            if (activeLocalToolNames.has(tool.name)) {
                allTools.push({
                    ...tool,
                    serverId: 'internal', // Keep identifier consistent
                    serverName: 'InternalFunctions' // Keep identifier consistent
                });
            }
        });
    } catch (dbError) {
        console.error('[MCPService] Error fetching or processing internal/local tool statuses:', dbError);
    }


    return allTools;
}

// Remove getInternalToolsFromConfig and isInternalToolDefined

module.exports = {
    initializeMCPService,
    callMCPTool,
    listMCPTools,
    handleServerUpdate,
    handleServerDelete,
    callInternalTool // Export the new function
};

/**
 * Calls an internal tool function dynamically.
 * @param {string} toolName - The name of the internal tool to call.
 * @param {object} args - Arguments to pass to the tool function.
 * @param {object} context - Context object (e.g., { userId, chatId }) to pass.
 * @returns {Promise<any>} - The result returned by the tool function, or an object indicating completion for streaming tools.
 */
async function callInternalTool(toolName, args, context) {
    const toolDefinition = internalToolsCache.find(t => t.name === toolName);

    if (!toolDefinition) {
        throw new Error(`Internal tool '${toolName}' not found or not loaded.`);
    }

    if (!toolDefinition.path || !toolDefinition.function_name) {
        throw new Error(`Internal tool '${toolName}' definition is incomplete (missing path or function_name).`);
    }

    try {
        // Construct the absolute path to the tool's implementation file
        // Assuming toolDefinition.path is relative to the project root
        const toolPath = path.resolve(process.cwd(), toolDefinition.path);

        // Dynamically require the module
        // Use Date.now() to bypass cache if needed during development, but be careful in production
        // const toolModule = require(toolPath + '?t=' + Date.now()); // Cache busting - use with caution
        const toolModule = require(toolPath);


        const toolFunction = toolModule[toolDefinition.function_name];

        if (typeof toolFunction !== 'function') {
            throw new Error(`Function '${toolDefinition.function_name}' not found or not a function in module '${toolDefinition.path}'.`);
        }

        if (toolFunction.constructor.name === 'AsyncGeneratorFunction') {
            // Handle streaming tool (async generator)
            console.log(`[MCPService] Tool '${toolName}' is a streaming tool for chat ${context.chatId}.`);
            const toolExecutionId = `tool-exec-${Date.now()}`; // Unique ID for this tool run

            // Emit an event indicating the tool stream has started
            eventBus.publish('mcp:tool_stream_started', {
                chatId: context.chatId,
                toolName: toolName,
                toolExecutionId: toolExecutionId,
            });
            
            let finalMessageId = null;
            try {
                for await (const chunk of toolFunction(args, context)) {
                    if (chunk.type === 'progress_update' || chunk.type === 'partial_data') {
                        eventBus.publish('mcp:tool_chunk_generated', {
                            chatId: context.chatId,
                            toolName: toolName,
                            toolExecutionId: toolExecutionId, 
                            chunkType: chunk.type,
                            payload: chunk.payload,
                        });
                    } else if (chunk.type === 'final_data') {
                        const createdMessageId = await Message.create({
                            chat_id: context.chatId, 
                            user_id: context.userId, 
                            role: 'assistant', 
                            content: chunk.payload.full_content,
                            mcp_metadata: JSON.stringify({ 
                                tool_id: toolName, 
                                tool_execution_id: toolExecutionId,
                                sources: chunk.payload.sources || [] 
                            })
                        });
                        finalMessageId = createdMessageId; 
                        console.log(`[MCPService] Saved final_data for tool '${toolName}' (exec ID: ${toolExecutionId}) as message ID ${finalMessageId} in chat ${context.chatId}.`);
                        // Event emission is handled by Message.create (if enabled) or calling controller.
                        // MCPService should not emit chat:message_created directly to avoid duplicates if Message.create does it.
                    }
                }
                // After the loop finishes (generator completes)
                eventBus.publish('mcp:tool_stream_complete', {
                    chatId: context.chatId,
                    toolName: toolName,
                    toolExecutionId: toolExecutionId,
                    finalMessageId: finalMessageId, 
                });
                console.log(`[MCPService] Internal streaming tool '${toolName}' (exec ID: ${toolExecutionId}) completed for chat ${context.chatId}.`);
                return { success: true, message: `Streaming tool '${toolName}' completed.`, finalMessageId, toolExecutionId };
            } catch (streamError) {
                console.error(`[MCPService] Error streaming internal tool '${toolName}' (exec ID: ${toolExecutionId}) for chat ${context.chatId}:`, streamError);
                const errorMessage = streamError && streamError.message ? streamError.message : "An unexpected connection error occurred with the tool.";
                eventBus.publish('mcp:tool_stream_error', { 
                    chatId: context.chatId,
                    toolName: toolName,
                    toolExecutionId: toolExecutionId, 
                    error: errorMessage,
                });
                if (streamError instanceof UserCancelledError) {
                    throw streamError; 
                } else {
                    const displayError = streamError && streamError.message ? streamError.message : "SSE connection error with the research service. Please wait a few moments and try again.";
                    throw new Error(`Failed to stream internal tool '${toolName}': ${displayError}`);
                }
            }
        } else {
            // Handle non-streaming tool (regular async function)
            const result = await toolFunction(args, context);
            console.log(`[MCPService] Internal non-streaming tool '${toolName}' completed.`);
            // For non-streaming tools, the result might need to be saved as a message here
            // If this service needs to save it:
            /*
            if (result && result.content) { 
                await Message.create({
                    chatId: context.chatId,
                    role: 'assistant',
                    content: result.content,
                    tool_id: toolName,
                });
            }
            */
            return result;
        }

    } catch (error) {
        console.error(`[MCPService] Error executing internal tool '${toolName}':`, error);
        if (error instanceof UserCancelledError) {
            throw error;
        }
        throw new Error(`Failed to execute internal tool '${toolName}': ${error.message}`);
    }
}
