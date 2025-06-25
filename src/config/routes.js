/**
 * API routes configuration
 */
const path = require('path');
const express = require('express'); 

/**
 * Set up all API routes
 * @param {Object} app - Express application instance
 * @param {Object} middleware - Middleware functions
 */

function setupRoutes(app, middleware) {

  const authRoutes = require('../routes/authRoutes');
  const chatRoutes = require('../routes/chatRoutes');
  const chatController = require('../controllers/chatController'); 
  const modelRoutes = require('../routes/modelRoutes');
  const adminRoutes = require('../routes/adminRoutes');
  const apiKeyRoutes = require('../routes/apiKeyRoutes');
  const agentRoutes = require('../routes/agentRoutes');
  const fileRoutes = require('../routes/fileRoutes');
  const githubRoutes = require('../routes/githubRoutes');
  const systemMaintenanceRoutes = require('../routes/systemMaintenanceRoutes');
  const documentationRoutes = require('../routes/documentationRoutes');
  const integrationRoutes = require('../routes/integrationRoutes');
  const oauthRoutes = require('../routes/oauthRoutes');
  const hardwareRoutes = require('../routes/hardwareRoutes');
  const shareRoutes = require('../routes/shareRoutes');
  const userRoutes = require('../routes/userRoutes');
  const mcpRoutes = require('../routes/mcpRoutes'); 
  const userController = require('../controllers/userController');
  const scalyticsApiRoutes = require('../routes/scalyticsApiRoutes');
  const adminFilteringRoutes = require('../routes/adminFilteringRoutes'); 
  const filterDataRoutes = require('../routes/filterDataRoutes');
  const internalApiController = require('../controllers/internalApiController'); 

  // --- Mount Standard API Routes ---
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes); 
  app.get('/api/chats/usage/monthly', middleware.protect, chatController.getMonthlyTokenUsage);
  app.use('/api/models', modelRoutes);
  app.use('/api/admin/filters', adminFilteringRoutes);
  app.use('/api/filters', filterDataRoutes); 
  app.use('/api/admin/mcp-servers', require('../routes/mcpServerRoutes')); 
  app.use('/api/admin', adminRoutes); 
  app.use('/api/apikeys', apiKeyRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/files', fileRoutes); 
  app.use('/api/hardware', hardwareRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/oauth', oauthRoutes);
  app.use('/api/hardware', hardwareRoutes);
  app.use('/api/shares', shareRoutes); 
  app.use('/api/users', userRoutes); 
  app.use('/api/system', systemMaintenanceRoutes);
  app.use('/api/docs', middleware.protect, documentationRoutes);
  app.use('/api/mcp', mcpRoutes);

  // --- Internal API Routes (should be restricted, e.g., by firewall or specific middleware if not localhost only) ---
  app.post('/api/internal/v1/local_completion', internalApiController.handleInternalLocalCompletion);

  app.use('/v1', scalyticsApiRoutes);

  // --- Serve Static API Docs (Redoc HTML) ---
  const apiDocsPath = path.join(__dirname, '../../docs/api-docs.html');
  app.get('/api-docs', (req, res, next) => {
    res.sendFile(apiDocsPath, (err) => {
      // Optional: Handle error if sendFile fails (e.g., file not found)
      if (err) {
         console.error(`Error sending API Docs file (${apiDocsPath}): ${err.message}`);
         if (!res.headersSent) {
            res.status(404).send('API Documentation not found or could not be served.');
         }
       }
     });
   });
 
   // --- General Status & Error Handling ---
  app.get('/api/status', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  app.use((err, req, res, next) => {
    console.error('Express error handler:', err.stack); 
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
    });
  });

  app.use('/api', (req, res) => {
    return res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(require('express').static(path.join(process.cwd(), 'frontend/build')));
    
    // All remaining requests go to index.html for client-side routing, EXCLUDING /api-docs (which serves HTML)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api-docs')) { 
        return next();
      }
      res.sendFile(path.join(process.cwd(), 'frontend/build', 'index.html'), (err) => {
        if (err) {
           console.error("Error sending index.html:", err);
           if (!res.headersSent) { 
              res.status(500).send("Error serving application.");
           }
        }
      });
    });
  } else {
    app.get('/set-password', (req, res) => {
      const token = req.query.token;
      if (token) {
        res.redirect(`/api/auth/register-redirect?token=${token}`);
      } else {
        res.status(200).send('Set Password Page - Use API for actual functionality');
      }
    });
  }
}

module.exports = { setupRoutes };
