// ──────────────────────────────────────────────────────────────────────────────
// Shim for all `node:`-prefixed core modules (events, buffer, etc.)
// ──────────────────────────────────────────────────────────────────────────────
const Module = require('module');
const _origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  // if it's something like 'node:events' or 'node:buffer', strip the prefix
  if (request.startsWith('node:')) {
    request = request.slice(5);
  }
  return _origLoad(request, parent, isMain);
};
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express'); 
const swaggerSpec = require('./src/config/swagger'); 
const dbPath = path.join(__dirname, 'src', 'models', 'db.js');
if (!fs.existsSync(dbPath)) {
  console.error(`ERROR: Database module not found at ${dbPath}. Deployment issue?`);
  process.exit(1);
}

const { ensureSecureKeys } = require('./src/utils/securityUtils');
const { checkHuggingFaceDependencies } = require('./scripts/check_hf_dependencies');
const { loadSystemSettings } = require('./src/config/systemConfig'); 

// Configure llama.cpp shared library path (if exists)
const llamaBinDir = path.join(__dirname, 'bin', 'llama');
if (fs.existsSync(llamaBinDir)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${llamaBinDir}:${process.env.LD_LIBRARY_PATH}`
    : llamaBinDir;
}

// Setup process-wide uncaught exception handlers
process.on('uncaughtException', (err) => {
  console.error('\n=====================================');
  console.error('UNCAUGHT EXCEPTION - SERVER CRASHING:', err);
  fs.appendFileSync('server-crash.log', `\n[${new Date().toISOString()}] UNCAUGHT EXCEPTION:\n${err.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n=====================================');
  console.error('UNHANDLED PROMISE REJECTION:', reason);
  fs.appendFileSync('server-crash.log', `\n[${new Date().toISOString()}] UNHANDLED REJECTION:\n${reason}\n`);
});

// Load .env file but DO NOT override existing process.env variables (like those set by PM2)
dotenv.config({ override: false }); 

try {
  ensureSecureKeys();

  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  const { initializeSocket } = require('./src/config/socket');
  const wsServer = initializeSocket(server);

  const { setupEventBusBridge } = require('./src/config/eventBusBridge');
  setupEventBusBridge(wsServer);

  app.set('wsServer', wsServer);


const { setupMiddleware, getFileUploadMiddleware } = require('./src/config/middleware');
const { protect } = require('./src/middleware/authMiddleware'); 
setupMiddleware(app); 

  const { setupRoutes } = require('./src/config/routes');
  setupRoutes(app, {
    fileUpload: getFileUploadMiddleware(),
    protect: protect
  });

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      console.error('Malformed JSON received:', err.message);
      return res.status(400).json({ error: 'Malformed JSON payload.' });
    }

    if (err.type === 'entity.too.large' || (err.name === 'PayloadTooLargeError' || err.status === 413)) {
      console.warn(`PayloadTooLargeError encountered for ${req.method} ${req.path}: ${err.message}`);
      const limit = err.limit ? `${(err.limit / 1024 / 1024).toFixed(2)} MB` : 'the configured limit';
      return res.status(413).json({
        error: 'Request payload is too large.',
        message: `The request body exceeds ${limit}.`
      });
    }

    console.error('Unhandled Express error:', err);
    if (!res.headersSent) {
       res.status(err.status || 500).json({ error: 'An unexpected server error occurred.' });
    }
  });


  async function startServer() {
    try {
      const { initializeServer } = require('./src/config/database');
      await initializeServer(); 

      await loadSystemSettings(); 
      if (process.env.SKIP_HF_CHECK !== 'true') {
        try {
          await checkHuggingFaceDependencies();
        } catch (hfError) {
          console.warn('Warning: Hugging Face dependency check failed:', hfError.message);
        }
      }

      if (process.env.SKIP_VLLM_SERVICE !== 'true') {
        try {
          const vllmService = require('./src/services/vllmService');
          if (typeof vllmService.initialize === 'function') {
            await vllmService.initialize();
          }
        } catch (vllmError) {
          console.warn('Warning: vLLM Service initialization failed:', vllmError.message);
        }
      }

      server.listen(PORT, () => {
      });
    } catch (error) {
      console.error('Failed to start server:', error); 
      fs.appendFileSync('server-crash.log', `\n[${new Date().toISOString()}] STARTUP ERROR:\n${error.stack}\n`);
      process.exit(1);
    }
  }

  startServer();

  const shutdown = (signal) => {
    server.close(async () => { 
      try {
        if (process.env.SKIP_VLLM_SERVICE !== 'true') {
          const vllmService = require('./src/services/vllmService');
          if (vllmService && typeof vllmService.shutdown === 'function') {
            await vllmService.shutdown();
          }
        }
        const { db } = require('./src/models/db'); 
        if (db && typeof db.close === 'function') {
          await new Promise((resolve, reject) => {
            db.close((err) => {
              if (err) {
                console.error('Error closing database:', err.message);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      } catch (dbCloseError) {
        console.error('Error accessing/closing database during shutdown:', dbCloseError);
      }
      process.exit(0); 
    });

    setTimeout(() => {
      console.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10000); 
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

} catch (initError) {
  console.error('Error during server initialization:', initError);
  fs.appendFileSync('server-crash.log', `\n[${new Date().toISOString()}] INITIALIZATION ERROR:\n${initError.stack}\n`);
  process.exit(1);
}
