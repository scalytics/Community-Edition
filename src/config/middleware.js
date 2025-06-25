/**
 * Express middleware configuration
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const { blockSuspiciousRequests } = require('../middleware/requestBlocker'); 

/**
 * Configure all Express middleware
 * @param {Object} app - Express application instance
 */
function setupMiddleware(app) {
  app.use(helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },
    // Restore original CSP
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'], 
        'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'], 
        'img-src': ["'self'", 'data:', 'blob:', 'http://localhost:3000', 'https://unpkg.com'], 
        'connect-src': ["'self'", 'http://localhost:3000', 'https://huggingface.co', 'ws:', 'wss:'], 
      },
    },
    expectCt: false,
  }));

  // CORS configuration
  const corsOptions = process.env.NODE_ENV === 'production'
    ? {
        origin: function (origin, callback) {
          const allowedOrigins = [
            process.env.API_CORS_ORIGIN     
          ].filter(Boolean);

          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
            callback(new Error(`Origin ${origin} not allowed by CORS`));
          }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      }
    : {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      };
  app.use(cors(corsOptions));

  app.use(blockSuspiciousRequests);

  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
      const origin = req.headers.origin;
      
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS'); 
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  // Request parsing middleware
  app.use(express.json({ limit: '2mb' })); 
  app.use(express.urlencoded({ extended: true, limit: '5mb' })); 
  
  app.use(morgan('dev', {
    skip: function (req, res) { return res.statusCode < 400; }
  }));

  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Created uploads directory at ${uploadDir}`);
  }

  // Serve uploads directory with specific headers
  app.use('/uploads', (req, res, next) => {
    if (process.env.DEBUG_MODE === 'true') {
      console.log(`[WARN] Uploads request: ${req.path}`);
    }
    next();
  }, express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res, filePath) => {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[WARN] Serving file: ${filePath}`);
      }
      
      // Set Cache-Control for different file types
      if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || 
          filePath.endsWith('.png') || filePath.endsWith('.gif') || 
          filePath.endsWith('.webp')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      
      // Allow cross-origin resource sharing policies
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none'); 
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
  }));
}

/**
 * Configure and return file upload middleware
 * @returns {Function} Express middleware for file uploads
 */
function getFileUploadMiddleware() {
  return fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    createParentPath: true,
    abortOnLimit: true,
    responseOnLimit: 'File size limit exceeded',
    useTempFiles: true,
    tempFileDir: '/tmp/',
    safeFileNames: true,  
    preserveExtension: 4, 
    debug: false, 
    uploadTimeout: 60000 
  });
}

module.exports = {
  setupMiddleware,
  getFileUploadMiddleware
};
