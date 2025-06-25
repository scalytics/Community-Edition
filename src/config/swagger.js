const swaggerJsdoc = require('swagger-jsdoc');
const packageJson = require('../../package.json'); // Read version from package.json

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Scalytics Connect API',
      version: packageJson.version, // Use version from package.json
      description: 'API documentation for the Scalytics Connect backend, including AI Agents and MCP features.',
    },
    servers: [
      {
        url: process.env.API_URL || '/api', // Use relative path or env var
        description: 'API server',
      },
    ],
    components: {
      // Define reusable schemas
      schemas: {
        ApiResponseSuccessList: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            count: { type: 'integer', example: 1 },
            total: { type: 'integer', example: 10 },
            data: { type: 'array', items: { type: 'object' } } // Generic list
          }
        },
         ApiResponseSuccessObject: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' } // Generic object
          }
        },
       ApiResponseError: {
          type: 'object',
          required: ['success', 'message'],
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message description' }
          }
        },
        Model: { // Keep existing Model schema
            type: 'object',
            properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                model_path: { type: 'string', nullable: true },
                context_window: { type: 'integer', nullable: true },
                is_active: { type: 'boolean' },
                is_primary: { type: 'boolean', nullable: true },
                external_provider_id: { type: 'integer', nullable: true },
                external_model_id: { type: 'string', nullable: true },
                embedding_dimension: { type: 'integer', nullable: true },
                provider_name: { type: 'string', nullable: true }, // Added via join usually
                can_use: { type: 'boolean', description: 'Indicates if the current user can use this model based on keys/settings' },
                model_family: { type: 'string', nullable: true },
                prompt_format_type: { type: 'string', nullable: true },
                // Add other fields as needed
            }
        },
        ApiKey: { // Keep existing ApiKey schema
            type: 'object',
            properties: {
                id: { type: 'integer' },
                provider_id: { type: 'integer' },
                provider_name: { type: 'string' },
                key_name: { type: 'string' },
                is_encrypted: { type: 'boolean' },
                is_active: { type: 'boolean' },
                is_global: { type: 'boolean' },
                user_id: { type: 'integer', nullable: true },
                extra_config: { type: 'string', nullable: true, description: 'JSON string for extra config like CX ID' },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
            }
        },
        Chat: { // Keep existing Chat schema
            type: 'object',
            properties: {
                id: { type: 'integer' },
                user_id: { type: 'integer' },
                model_id: { type: 'integer' },
                title: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
            }
        },
        Message: { // Keep existing Message schema
            type: 'object',
            properties: {
                id: { type: 'integer' },
                chat_id: { type: 'integer' },
                role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                content: { type: 'string' },
                tokens: { type: 'integer', nullable: true },
                created_at: { type: 'string', format: 'date-time' },
                // Add other fields like mcp_metadata if needed
            }
        },
        AgentCapability: { // Keep existing AgentCapability schema
             type: 'object',
             properties: {
                 context_window: { type: 'integer', nullable: true },
                 supports_functions: { type: 'boolean', nullable: true },
                 supports_vision: { type: 'boolean', nullable: true },
                 supports_tools: { type: 'boolean', nullable: true },
                 tools: { type: 'array', items: { type: 'string' }, nullable: true }
             }
        },
        Agent: { // Keep existing Agent schema
             allOf: [
                 { $ref: '#/components/schemas/Model' },
                 {
                     type: 'object',
                     properties: {
                         capabilities: { $ref: '#/components/schemas/AgentCapability', nullable: true },
                         is_agent: { type: 'boolean', example: true },
                         supported_tools: { type: 'array', items: { type: 'string' }, nullable: true }
                     }
                 }
             ]
        },
        Tool: { // Keep existing Tool schema
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                input_schema: { type: 'object', description: 'JSON schema for input arguments' },
                output_schema: { type: 'object', description: 'JSON schema for output' },
                serverId: { type: 'integer', description: 'ID of the server providing the tool' },
                serverName: { type: 'string', description: 'Name of the server providing the tool' }
            }
        },
        McpServer: {
            type: 'object',
            properties: {
                 id: { type: 'integer' },
                 name: { type: 'string' },
                 description: { type: 'string', nullable: true },
                 connection_type: { type: 'string', enum: ['command', 'websocket', 'stdio'] },
                 connection_details: { type: 'string', description: 'JSON string' },
                 is_active: { type: 'boolean' },
                 status: { type: 'string', enum: ['connecting', 'connected', 'disconnected', 'error'] },
                 last_seen: { type: 'string', format: 'date-time', nullable: true },
                 last_error: { type: 'string', nullable: true },
                 created_at: { type: 'string', format: 'date-time' },
                 updated_at: { type: 'string', format: 'date-time' },
            }
        }
      },
      // Define reusable responses
      responses: {
          UnauthorizedError: {
              description: 'API key is missing or invalid / Authentication failed',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseError' } } }
          },
          ForbiddenError: {
              description: 'User does not have permission for this action',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseError' } } }
          },
          NotFoundError: {
              description: 'The requested resource was not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseError' } } }
          },
          BadRequestError: {
              description: 'Invalid input parameters',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseError' } } }
          },
          ServerError: {
              description: 'Internal server error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseError' } } }
          }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Path to the API docs files (routes and controllers)
  apis: ['./src/routes/*.js', './src/controllers/*.js'], // Adjust paths as needed
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
