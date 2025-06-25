const jwt = require('jsonwebtoken');
const { db } = require('../models/db');
// Import Permission model
let Permission;
try {
  Permission = require('../models/Permission');
} catch (error) {
  console.error('Error importing Permission module:', error);
  // Fallback implementation to prevent crashes
  Permission = {
    userHasPermission: async () => false,
    applyMigration: async () => false
  };
}

// Protect routes - verify token and attach user to request
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'mcp_secret_key'
        );
      } catch (jwtError) {
        console.error('Token verification failed:', jwtError.message);
        
        // Provide more specific error message based on the JWT error
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            message: 'Your session has expired. Please log in again.',
            error: 'token_expired'
          });
        } else if (jwtError.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            message: 'Invalid authentication token. Please log in again.',
            error: 'invalid_token'
          });
        } else {
          return res.status(401).json({
            success: false,
            message: 'Authentication error: ' + jwtError.message,
            error: 'auth_error'
          });
        }
      }

      // Check if token is from OAuth or regular login
      const authMethod = decoded.auth_method || 'password';
      
      // Get user from token
      const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [decoded.id]);
      
      // Attach auth method to user object for potential use in routes
      if (user) {
        user.auth_method = authMethod;
        
        // If OAuth, attach provider info
        if (authMethod === 'oauth' && decoded.provider) {
          user.oauth_provider = decoded.provider;
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'user_not_found'
        });
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware general error:', error);
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: ' + (error.message || 'Unknown error'),
        error: 'auth_failed'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Admin middleware
exports.admin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this route. Admin privileges required.'
    });
  }
  next();
};

// Check private mode
exports.checkPrivateMode = async (req, res, next) => {
  try {
    // Get user settings
    const settings = await db.getAsync(
      'SELECT private_mode FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );

    // Attach private mode setting to request
    req.privateMode = settings && settings.private_mode ? true : false;
    next();
  } catch (error) {
    console.error('Private mode middleware error:', error);
    // Continue even if there's an error checking private mode
    req.privateMode = false;
    next();
  }
};

/**
 * Check if user has access to a specific model
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const checkModelAccess = async (req, res, next) => {
  try {
    // Get model ID from params or body
    const modelId = req.params.modelId || req.body.modelId;
    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }

    // Check if user has access through any of their groups
    const hasAccess = await db.getAsync(`
      SELECT EXISTS (
        SELECT 1 
        FROM group_model_access gma 
        JOIN user_groups ug ON gma.group_id = ug.group_id 
        WHERE gma.model_id = ? 
        AND ug.user_id = ? 
        AND gma.can_access = 1
      ) as has_access
    `, [modelId, req.user.id]);

    if (!hasAccess || hasAccess.has_access !== 1) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this model'
      });
    }

    next();
  } catch (error) {
    console.error('Model access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking model access'
    });
  }
};

/**
 * Check whether the user has access to a model.
 * This takes into account:
 * - Group permissions
 * - Public model status
 * - Admin access for local models
 * - API key availability for external models
 */
exports.checkModelAccess = async (req, res, next) => {
  try {
    // For GET /models endpoint, filter results rather than blocking
    if (req.method === 'GET' && req.path === '/models' && !req.params.id) {
      // This is the model listing endpoint - we'll handle filtering later
      req.shouldFilterModels = true;
      return next();
    }
    
    // Get model ID from request - check various places it might be
    let modelId = null;
    
    if (req.body && req.body.modelId) {
      modelId = req.body.modelId;
    } else if (req.params && req.params.modelId) {
      modelId = req.params.modelId;
    } else if (req.query && req.query.modelId) {
      modelId = req.query.modelId;
    } else if (req.params && req.params.id && req.path.startsWith('/models/')) {
      modelId = req.params.id;
    }
    
    // If no model ID, we can't check access
    if (!modelId) {
      // For chat creation or when specifically needed, model ID is required
      if (req.path.includes('/chat') && req.method === 'POST') {
        return res.status(400).json({
          success: false,
          message: 'Model ID is required for chat creation'
        });
      }
      
      // For other routes, continue without checking
      return next();
    }
    
    // Get all models available to this user - with robust error handling
    let availableModels = [];
    try {
      const Model = require('../models/Model');
      
      // Check if getActiveForUser exists and is a function before calling it
      if (typeof Model.getActiveForUser === 'function') {
        availableModels = await Model.getActiveForUser(req.user.id);
      } else {
        console.error('Model.getActiveForUser is not a function - using fallback');
        
        // Fallback to get models directly from database
        availableModels = await db.allAsync(`
          SELECT m.*, p.name as provider_name, p.id as provider_id
          FROM models m
          LEFT JOIN api_providers p ON m.external_provider_id = p.id
          WHERE m.is_active = 1
        `);
        
        // If user is not admin, filter by group access
        if (!req.user.is_admin) {
          const accessibleIds = new Set();
          const groupModels = await db.allAsync(`
            SELECT DISTINCT m.id
            FROM models m
            JOIN group_model_access gma ON m.id = gma.model_id
            JOIN user_groups ug ON gma.group_id = ug.group_id
            WHERE ug.user_id = ? 
            AND gma.can_access = 1
          `, [req.user.id]);
          
          groupModels.forEach(m => accessibleIds.add(m.id));
          availableModels = availableModels.filter(model => accessibleIds.has(model.id));
        }
        
        // Set necessary fields for consistency
        availableModels.forEach(model => {
          model.is_active = true;
          model.can_use = true;
        });
      }
    } catch (error) {
      console.error('Error getting available models in middleware:', error);
      // Return a descriptive error - don't silently fail
      return res.status(500).json({
        success: false,
        message: 'Server error fetching available models: ' + (error.message || 'Unknown error')
      });
    }
    
    // Find the requested model in the user's available models
    const userModel = availableModels.find(m => m.id === parseInt(modelId, 10));
    
    if (!userModel) {
      return res.status(404).json({
        success: false,
        message: 'Model not found or not available to you'
      });
    }
    
    // Check if model is active
    if (!userModel.is_active) {
      return res.status(403).json({
        success: false,
        message: 'This model is currently inactive'
      });
    }
    
    // Check if model can be used (important for external models that need API keys)
    if (userModel.can_use === false) {
      let message = 'You do not have access to this model';
      
      // Provide more specific error messages for external models
      if (userModel.external_provider_id) {
        if (!userModel.has_user_key && !userModel.has_system_key) {
          message = `No valid API key available for ${userModel.provider_name}`;
        } else if (userModel.has_user_key && !userModel.has_system_key) {
          message = `Your ${userModel.provider_name} API key is no longer valid`;
        } else if (!userModel.has_user_key && userModel.has_system_key) {
          message = `System API key for ${userModel.provider_name} is not available`;
        }
      }
      
      return res.status(403).json({
        success: false,
        message
      });
    }
    
    // If we get here, the user can access the model
    req.model = userModel;
    return next();
    
  } catch (error) {
    console.error('Model access check error:', error);
    // Don't silently continue on errors - send a proper error response
    return res.status(500).json({
      success: false,
      message: 'Error checking model access: ' + error.message
    });
  }
};

/**
 * Check if user has a specific permission
 * @param {string} permissionKey - Permission key to check
 * @returns {Function} Middleware function
 */
exports.hasPermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      // If user is admin, they always have all permissions
      if (req.user && req.user.is_admin) {
        return next();
      }

      // Check for power user with specific permission
      const hasPermission = await Permission.userHasPermission(req.user.id, permissionKey);
      if (hasPermission) {
        return next();
      }

      // No permission - return forbidden
      return res.status(403).json({
        success: false,
        message: `You don't have the required permission: ${permissionKey}`
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Middleware for routes that can be accessed by admins OR power users with specific permission
 * @param {string} permissionKey - Permission key to check
 * @returns {Function} Middleware function
 */
exports.adminOrPermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      // If user is admin, allow access
      if (req.user && req.user.is_admin) {
        return next();
      }

      // Otherwise check for specific permission
      const hasPermission = await Permission.userHasPermission(req.user.id, permissionKey);
      if (hasPermission) {
        // Mark as non-admin but with permission for routes that need to distinguish
        req.isPowerUser = true;
        return next();
      }

      // No admin rights or permission - return forbidden
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this route. Required permission: ' + permissionKey
      });
    } catch (error) {
      console.error('Admin or permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

// Combine commonly used middleware
exports.standardAuth = [exports.protect, exports.checkPrivateMode, exports.checkModelAccess];

// Apply the permissions migration on server start
(async () => {
  try {
    await Permission.applyMigration();
  } catch (error) {
    console.error('Failed to apply permissions migration:', error);
  }
})();
