const Integration = require('../models/Integration');
const apiService = require('../services/apiService');

/**
 * Integration controller for managing auth and service integrations
 */

// Get all integrations
exports.getAllIntegrations = async (req, res) => {
  try {
    const integrations = await Integration.findAll();
    
    // Mask client secrets for security
    const sanitizedIntegrations = integrations.map(integration => ({
      ...integration,
      client_secret: integration.client_secret ? '••••••••' : ''
    }));
    
    res.status(200).json({
      success: true,
      count: sanitizedIntegrations.length,
      data: sanitizedIntegrations
    });
  } catch (error) {
    console.error('Error getting all integrations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching integrations'
    });
  }
};

// Get integration by ID
exports.getIntegrationById = async (req, res) => {
  try {
    const integration = await Integration.findById(req.params.id);
    
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }
    
    // Mask client secret for security
    const sanitizedIntegration = {
      ...integration,
      client_secret: integration.client_secret ? '••••••••' : ''
    };
    
    res.status(200).json({
      success: true,
      data: sanitizedIntegration
    });
  } catch (error) {
    console.error('Error getting integration by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching integration'
    });
  }
};

// Create integration
exports.createIntegration = async (req, res) => {
  try {
    const { name, provider, client_id, client_secret, additional_config, enabled } = req.body;
    
    // Validate required fields
    if (!name || !provider) {
      return res.status(400).json({
        success: false,
        message: 'Name and provider are required'
      });
    }
    
    // Check for duplicate provider
    const existingIntegrations = await Integration.findAll();
    const providerExists = existingIntegrations.some(
      integration => integration.provider === provider
    );
    
    if (providerExists) {
      return res.status(400).json({
        success: false,
        message: `Integration with provider "${provider}" already exists`
      });
    }

    // If a client_secret (API key) is provided, validate it before saving
    if (client_secret) {
      // Validate API key with the provider
      const validationResult = await apiService.validateApiKey(provider, client_secret);
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: `Invalid API key: ${validationResult.message}`
        });
      }
      
      console.log(`API key validation passed for ${provider}`);
    }
    
    // Create integration
    const integration = await Integration.create({
      name,
      provider,
      client_id: client_id || '',
      client_secret: client_secret || '',
      additional_config,
      enabled: Boolean(enabled)
    });
    
    // Mask client secret in response
    const sanitizedIntegration = {
      ...integration,
      client_secret: integration.client_secret ? '••••••••' : ''
    };
    
    res.status(201).json({
      success: true,
      message: 'Integration created successfully',
      data: sanitizedIntegration
    });
  } catch (error) {
    console.error('Error creating integration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating integration'
    });
  }
};

// Update integration
exports.updateIntegration = async (req, res) => {
  try {
    const { name, provider, client_id, client_secret, additional_config, enabled } = req.body;
    
    // Find the integration
    const integration = await Integration.findById(req.params.id);
    
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }
    
    // Get the provider name (either from the request or from the existing integration)
    const providerName = provider || integration.provider;
    
    // If a client_secret (API key) is provided, validate it before saving
    if (client_secret !== undefined && client_secret !== '') {
      // Validate API key with the provider
      const validationResult = await apiService.validateApiKey(providerName, client_secret);
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: `Invalid API key: ${validationResult.message}`
        });
      }
      
      console.log(`API key validation passed for ${providerName}`);
    }
    
    // Handle a case where client_secret is not provided (keep existing)
    const updatedClientSecret = client_secret === undefined ? 
      integration.client_secret : client_secret;
    
    // Only update changed fields
    const updatedIntegration = await Integration.update(req.params.id, {
      name: name !== undefined ? name : undefined,
      provider: provider !== undefined ? provider : undefined,
      client_id: client_id !== undefined ? client_id : undefined,
      client_secret: updatedClientSecret,
      additional_config: additional_config !== undefined ? additional_config : undefined,
      enabled: enabled !== undefined ? Boolean(enabled) : undefined
    });
    
    // Mask client secret in response
    const sanitizedIntegration = {
      ...updatedIntegration,
      client_secret: updatedIntegration.client_secret ? '••••••••' : ''
    };
    
    res.status(200).json({
      success: true,
      message: 'Integration updated successfully',
      data: sanitizedIntegration
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating integration'
    });
  }
};

// Delete integration
exports.deleteIntegration = async (req, res) => {
  try {
    const deleted = await Integration.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Integration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting integration'
    });
  }
};

// Toggle integration status
exports.toggleIntegrationStatus = async (req, res) => {
  try {
    const integration = await Integration.findById(req.params.id);
    
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }
    
    // Toggle the enabled status
    const updatedIntegration = await Integration.update(req.params.id, {
      enabled: !integration.enabled
    });
    
    // Mask client secret in response
    const sanitizedIntegration = {
      ...updatedIntegration,
      client_secret: updatedIntegration.client_secret ? '••••••••' : ''
    };
    
    res.status(200).json({
      success: true,
      message: `Integration ${updatedIntegration.enabled ? 'enabled' : 'disabled'} successfully`,
      data: sanitizedIntegration
    });
  } catch (error) {
    console.error('Error toggling integration status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling integration status'
    });
  }
};

// Get authentication configuration for use in services
exports.getAuthConfig = async (req, res) => {
  try {
    const authConfig = await Integration.getAuthConfig();
    
    // Return only the auth config object directly (not wrapped in data)
    // This ensures the client can check if there are any keys directly
    res.status(200).json(authConfig);
  } catch (error) {
    console.error('Error getting auth configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting auth configuration'
    });
  }
};

// Export test client configuration (masked)
exports.getTestClientConfig = async (req, res) => {
  try {
    const integration = await Integration.findById(req.params.id);
    
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }
    
    // Create response with masked secrets
    const config = {
      provider: integration.provider,
      clientId: integration.client_id,
      // Don't include client secret in response
      ...(integration.additional_config || {})
    };
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting test client config:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting test configuration'
    });
  }
};
