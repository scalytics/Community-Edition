const { db } = require('../models/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Helper function to generate API Key (adjust length/complexity as needed)
function generateApiKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

// Helper function to hash API Key
async function hashApiKey(apiKey) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(apiKey, salt);
}

/**
 * Get all registered MCP servers (Admin)
 */
exports.getAllMcpServers = async (req, res) => {
    try {
        const servers = await db.allAsync(`
            SELECT id, name, description, connection_type, connection_details, is_active, status, last_seen, last_error, created_at, updated_at
            FROM mcp_servers ORDER BY name ASC
        `);
        res.status(200).json({ success: true, count: servers.length, data: servers });
    } catch (error) {
        console.error('Error getting MCP servers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch MCP servers.' });
    }
};

/**
 * Get details for a single MCP server (Admin)
 */
exports.getMcpServer = async (req, res) => {
    try {
        const { id } = req.params;
        const server = await db.getAsync(`
            SELECT id, name, description, connection_type, connection_details, is_active, status, last_seen, last_error, created_at, updated_at
            FROM mcp_servers WHERE id = ?
        `, [id]);

        if (!server) {
            return res.status(404).json({ success: false, message: 'MCP Server not found.' });
        }
        res.status(200).json({ success: true, data: server });
    } catch (error) {
        console.error(`Error getting MCP server ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch MCP server details.' });
    }
};

/**
 * Add a new MCP server (Admin)
 */
exports.addMcpServer = async (req, res) => {
    const { name, description, connection_type, connection_details } = req.body;

    if (!name || !connection_type || !connection_details) {
        return res.status(400).json({ success: false, message: 'Name, connection_type, and connection_details are required.' });
    }

    // Validate connection_details based on type (basic validation)
    let parsedDetails;
    try {
        parsedDetails = JSON.parse(connection_details);
        if (connection_type === 'websocket' && !parsedDetails.url) throw new Error('Missing url for websocket');
        if (connection_type === 'command' && (!parsedDetails.command || !Array.isArray(parsedDetails.args))) throw new Error('Missing command/args for command');
        // Add stdio validation if needed
    } catch (e) {
        return res.status(400).json({ success: false, message: `Invalid connection_details JSON or missing required fields for type ${connection_type}: ${e.message}` });
    }

    try {
        // Generate and hash API key
        const plainApiKey = generateApiKey();
        const apiKeyHash = await hashApiKey(plainApiKey);

        const result = await db.runAsync(
            `INSERT INTO mcp_servers (name, description, connection_type, connection_details, api_key_hash, is_active, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, description || null, connection_type, connection_details, apiKeyHash, 0, 'disconnected'] // Start inactive
        );

        const newServer = await db.getAsync('SELECT id, name, description, connection_type, connection_details, is_active, status FROM mcp_servers WHERE id = ?', [result.lastID]);

        // IMPORTANT: Return the plain text key ONLY ONCE upon creation
        res.status(201).json({
            success: true,
            message: 'MCP Server added successfully. Store the API key securely - it will not be shown again.',
            data: {
                ...newServer,
                apiKey: plainApiKey // Return plain key only on creation
            }
        });
    } catch (error) {
        console.error('Error adding MCP server:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ success: false, message: 'An MCP Server with this name already exists.' });
        }
        res.status(500).json({ success: false, message: 'Failed to add MCP server.' });
    }
};

/**
 * Update an existing MCP server (Admin)
 * Note: Does not allow updating the API key hash directly via this endpoint.
 */
exports.updateMcpServer = async (req, res) => {
    const { id } = req.params;
    const { name, description, connection_type, connection_details, is_active } = req.body;

    // Basic validation
    if (is_active === undefined && !name && !description && !connection_type && !connection_details) {
         return res.status(400).json({ success: false, message: 'No update fields provided.' });
    }

    let setClauses = [];
    let params = [];

    if (name !== undefined) { setClauses.push('name = ?'); params.push(name); }
    if (description !== undefined) { setClauses.push('description = ?'); params.push(description || null); }
    if (connection_type !== undefined) { setClauses.push('connection_type = ?'); params.push(connection_type); }
    if (connection_details !== undefined) {
         // Validate JSON structure if provided
         try { JSON.parse(connection_details); } catch (e) { return res.status(400).json({ success: false, message: 'Invalid connection_details JSON.' }); }
         setClauses.push('connection_details = ?'); params.push(connection_details);
    }
    if (is_active !== undefined) { setClauses.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (setClauses.length === 0) {
         return res.status(400).json({ success: false, message: 'No valid update fields provided.' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
        const result = await db.runAsync(
            `UPDATE mcp_servers SET ${setClauses.join(', ')} WHERE id = ?`,
            params
        );

        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'MCP Server not found or no changes made.' });
        }

        const updatedServer = await db.getAsync('SELECT id, name, description, connection_type, connection_details, is_active, status FROM mcp_servers WHERE id = ?', [id]);
        res.status(200).json({ success: true, message: 'MCP Server updated successfully.', data: updatedServer });

        // TODO: Trigger MCPService to reconnect/disconnect if active status or connection details changed
        // const MCPService = require('../services/agents/MCPService');
        // MCPService.handleServerUpdate(updatedServer); // Hypothetical function

    } catch (error) {
        console.error(`Error updating MCP server ${id}:`, error);
         if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ success: false, message: 'An MCP Server with this name already exists.' });
        }
        res.status(500).json({ success: false, message: 'Failed to update MCP server.' });
    }
};

/**
 * Delete an MCP server (Admin)
 */
exports.deleteMcpServer = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.runAsync('DELETE FROM mcp_servers WHERE id = ?', [id]);
        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'MCP Server not found.' });
        }
        res.status(200).json({ success: true, message: 'MCP Server deleted successfully.' });

         // TODO: Trigger MCPService to disconnect if server was active
         // const MCPService = require('../services/agents/MCPService');
         // MCPService.handleServerDelete(id); // Hypothetical function

    } catch (error) {
        console.error(`Error deleting MCP server ${id}:`, error);
        res.status(500).json({ success: false, message: 'Failed to delete MCP server.' });
    }
};

// TODO: Add endpoint to regenerate API key if needed
