const express = require('express');
const mcpServerController = require('../controllers/mcpServerController');
const { protect, admin } = require('../middleware/authMiddleware'); // Use admin middleware

const router = express.Router();

// Apply admin protection to all these routes
router.use(protect, admin);

/**
 * @swagger
 * tags:
 *   name: MCP Servers
 *   description: Management of external MCP server registrations (Admin only)
 */

/**
 * @swagger
 * /api/admin/mcp-servers:
 *   get:
 *     summary: Get all registered MCP servers
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of MCP servers.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseSuccessList'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/McpServer'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/', mcpServerController.getAllMcpServers);

/**
 * @swagger
 * /api/admin/mcp-servers:
 *   post:
 *     summary: Add a new MCP server registration
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique name for the server.
 *               description:
 *                 type: string
 *                 description: Optional description.
 *               connection_type:
 *                 type: string
 *                 enum: [command, websocket, stdio]
 *                 description: How the backend connects to the server.
 *               connection_details:
 *                 type: string
 *                 description: JSON string containing connection details based on connection_type. See documentation for expected format per type.
 *             required:
 *               - name
 *               - connection_type
 *               - connection_details
 *     responses:
 *       201:
 *         description: Server registered successfully. Returns server details and the generated API key (show once).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  success: { type: boolean }
 *                  message: { type: string }
 *                  data:
 *                      type: object
 *                      properties:
 *                          id: { type: integer }
 *                          name: { type: string }
 *                          # ... other server fields ...
 *                          apiKey: { type: string, description: "Plain text API key - store securely!" }
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/', mcpServerController.addMcpServer);

/**
 * @swagger
 * /api/admin/mcp-servers/{id}:
 *   get:
 *     summary: Get details of a specific MCP server
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the MCP server.
 *     responses:
 *       200:
 *         description: MCP server details.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseSuccessObject'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/McpServer'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/:id', mcpServerController.getMcpServer);

/**
 * @swagger
 * /api/admin/mcp-servers/{id}:
 *   put:
 *     summary: Update an MCP server registration
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the MCP server to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               connection_type: { type: string, enum: [command, websocket, stdio] }
 *               connection_details: { type: string, description: "JSON string" }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: MCP server updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseSuccessObject'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/McpServer'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put('/:id', mcpServerController.updateMcpServer);

/**
 * @swagger
 * /api/admin/mcp-servers/{id}:
 *   delete:
 *     summary: Delete an MCP server registration
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the MCP server to delete.
 *     responses:
 *       200:
 *         description: MCP server deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "MCP Server deleted successfully." }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete('/:id', mcpServerController.deleteMcpServer);

module.exports = router;
