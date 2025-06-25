const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Scalytics Connect API',
      version: '1.0.0', 
      description: 'API documentation for Scalytics Connect, including the OpenAI-compatible Scalytics API.',
    },
    servers: [
      {
        url: '/', 
        description: 'Current Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT', 
          description: 'Enter your Scalytics API Key (prefixed with "Bearer ")'
        }
      }
    },
  },
   apis: ['./src/routes/agentRoutes.js', './src/routes/scalyticsApiRoutes.js'], 
 };
 
const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
