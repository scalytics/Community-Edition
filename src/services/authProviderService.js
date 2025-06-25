const Integration = require('../models/Integration');
const authProviders = require('../auth/providers');

/**
 * Service for managing auth providers using integration configurations
 * Integrates with the providers directory for consistent configuration
 */
const authProviderService = {
  /**
   * Get authentication configuration for a specific provider
   * @param {string} provider - Provider name (e.g., 'google', 'github')
   * @returns {Promise<Object|null>} Auth configuration or null if not found/enabled
   */
  async getProviderConfig(provider) {
    try {
      // Try to get from integrations table first
      const integration = await Integration.findByProvider(provider);
      
      if (integration && integration.enabled) {
        return {
          clientId: integration.client_id,
          clientSecret: integration.client_secret,
          ...(integration.additional_config || {})
        };
      }
      
      // If not found in integrations or not enabled, fall back to environment variables
      return this.getProviderConfigFromEnv(provider);
    } catch (error) {
      console.error(`Error getting provider config for ${provider}:`, error);
      // Fall back to environment variables
      return this.getProviderConfigFromEnv(provider);
    }
  },

  /**
   * Get authentication configuration from environment variables
   * @param {string} provider - Provider name (e.g., 'google', 'github')
   * @returns {Object|null} Auth configuration or null if not found
   */
  getProviderConfigFromEnv(provider) {
    // Map of provider names to their environment variable prefixes
    const providerEnvMap = {
      google: 'GOOGLE_OAUTH',
      github: 'GITHUB_OAUTH',
      microsoft: 'MICROSOFT_OAUTH',
      okta: 'OKTA_OAUTH'
    };
    
    const prefix = providerEnvMap[provider];
    if (!prefix) return null;
    
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    
    // If no credentials in env vars, return null
    if (!clientId || !clientSecret) {
      return null;
    }
    
    // Build config based on provider with additional env vars
    const config = {
      clientId,
      clientSecret
    };
    
    // Get provider config from auth providers directory
    const providerConfig = authProviders.getProviderConfig(provider);
    
    if (providerConfig) {
      // Apply default config from provider definition
      if (providerConfig.defaultConfig) {
        // Add default configuration
        if (providerConfig.defaultConfig.defaultRedirectUri) {
          config.redirectUri = process.env[`${prefix}_REDIRECT_URI`] || 
                             providerConfig.defaultConfig.defaultRedirectUri;
        }
        
        if (providerConfig.defaultConfig.scope) {
          config.scope = process.env[`${prefix}_SCOPE`] || 
                       providerConfig.defaultConfig.scope;
        }
        
        // Provider-specific settings
        if (provider === 'microsoft' && providerConfig.defaultConfig.defaultTenantId) {
          config.tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || 
                          providerConfig.defaultConfig.defaultTenantId;
        }
        
        if (provider === 'okta') {
          config.domain = process.env.OKTA_OAUTH_DOMAIN;
          // Domain is required for Okta
          if (!config.domain) {
            return null;
          }
        }
      }
    } else {
      // Fallback for providers not in the directory
      switch (provider) {
        case 'google':
          config.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || '/auth/google/callback';
          config.scope = process.env.GOOGLE_OAUTH_SCOPE || 'profile email';
          break;
        case 'github':
          config.redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || '/auth/github/callback';
          config.scope = process.env.GITHUB_OAUTH_SCOPE || 'user repo';
          break;
        case 'microsoft':
          config.redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI || '/auth/microsoft/callback';
          config.tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || 'common';
          config.scope = process.env.MICROSOFT_OAUTH_SCOPE || 'user.read';
          break;
        case 'okta':
          config.redirectUri = process.env.OKTA_OAUTH_REDIRECT_URI || '/auth/okta/callback';
          config.domain = process.env.OKTA_OAUTH_DOMAIN;
          if (!config.domain) return null;
          break;
      }
    }
    
    return config;
  },
  
  /**
   * Check if a provider is enabled
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} Whether provider is enabled
   */
  async isProviderEnabled(provider) {
    const config = await this.getProviderConfig(provider);
    return !!config;
  },
  
  /**
   * Get all enabled auth providers
   * @returns {Promise<Array>} Array of enabled provider names
   */
  async getEnabledProviders() {
    try {
      // Get enabled integrations
      const integrations = await Integration.findAll();
      const enabledIntegrations = integrations
        .filter(integration => integration.enabled)
        .map(integration => integration.provider);
      
      // Get known providers from the providers directory
      const knownProviders = Object.keys(authProviders.getAllProviders());
      const enabledEnvProviders = [];
      
      for (const provider of knownProviders) {
        if (!enabledIntegrations.includes(provider)) {
          const config = this.getProviderConfigFromEnv(provider);
          if (config) {
            enabledEnvProviders.push(provider);
          }
        }
      }
      
      return [...enabledIntegrations, ...enabledEnvProviders];
    } catch (error) {
      console.error('Error getting enabled providers:', error);
      return [];
    }
  }
};

module.exports = authProviderService;
