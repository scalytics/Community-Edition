/**
 * Auth Providers Configuration
 * 
 * This module exports configuration for different authentication providers.
 * Add new providers here to make them available for integration.
 */

// OAuth provider configurations
const oauthProviders = {
  // Google OAuth provider
  google: {
    name: 'Google',
    description: 'Sign in with Google account',
    icon: 'google',
    type: 'oauth2',
    defaultConfig: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      refreshUrl: 'https://oauth2.googleapis.com/token',
      scope: 'profile email',
      defaultRedirectUri: '/auth/google/callback'
    },
    requiredFields: ['clientId', 'clientSecret', 'redirectUri'],
    optionalFields: ['scope']
  },
  
  // GitHub OAuth provider
  github: {
    name: 'GitHub',
    description: 'Sign in with GitHub account',
    icon: 'github',
    type: 'oauth2',
    defaultConfig: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'user:email',
      defaultRedirectUri: '/auth/github/callback'
    },
    requiredFields: ['clientId', 'clientSecret', 'redirectUri'],
    optionalFields: ['scope']
  },
  
  // Microsoft personal account OAuth provider
  microsoft: {
    name: 'Microsoft',
    description: 'Sign in with Microsoft personal account',
    icon: 'microsoft',
    type: 'oauth2',
    defaultConfig: {
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'user.read',
      defaultRedirectUri: '/auth/microsoft/callback'
    },
    requiredFields: ['clientId', 'clientSecret', 'redirectUri'],
    optionalFields: ['scope']
  },
  
  // Azure Active Directory OAuth provider
  azure_ad: {
    name: 'Azure AD',
    description: 'Sign in with Azure Active Directory (organizational account)',
    icon: 'azure',
    type: 'oauth2',
    defaultConfig: {
      authorizationUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
      scope: 'openid profile email',
      defaultRedirectUri: '/auth/azure/callback',
      defaultTenantId: 'organizations', // Default for multi-tenant apps
      responseType: 'code',
      responseMode: 'query'
    },
    requiredFields: ['clientId', 'clientSecret', 'redirectUri', 'tenantId'],
    optionalFields: ['scope', 'allowedDomains']
  },
  
  // Okta OAuth provider
  okta: {
    name: 'Okta',
    description: 'Sign in with Okta account',
    icon: 'okta',
    type: 'oauth2',
    defaultConfig: {
      authorizationUrl: 'https://{domain}/oauth2/v1/authorize',
      tokenUrl: 'https://{domain}/oauth2/v1/token',
      userInfoUrl: 'https://{domain}/oauth2/v1/userinfo',
      scope: 'openid profile email',
      defaultRedirectUri: '/auth/okta/callback'
    },
    requiredFields: ['clientId', 'clientSecret', 'redirectUri', 'domain'],
    optionalFields: ['scope']
  }
};

// API key-based providers
const apiKeyProviders = {
  // Example API key provider
  'api-provider': {
    name: 'API Provider',
    description: 'Authenticate with API key',
    icon: 'api',
    type: 'apikey',
    defaultConfig: {
      apiKeyHeader: 'X-API-Key'
    },
    requiredFields: ['apiKey'],
    optionalFields: ['apiKeyHeader']
  }
};

// Export all providers
module.exports = {
  oauth: oauthProviders,
  apiKey: apiKeyProviders,
  
  // Get provider config by ID
  getProviderConfig(providerId) {
    return oauthProviders[providerId] || apiKeyProviders[providerId] || null;
  },
  
  // Get all providers as a flat list
  getAllProviders() {
    return {
      ...oauthProviders,
      ...apiKeyProviders
    };
  },
  
  // Get provider display name
  getProviderName(providerId) {
    const provider = this.getProviderConfig(providerId);
    return provider ? provider.name : providerId;
  },
  
  // Check if provider exists
  providerExists(providerId) {
    return !!this.getProviderConfig(providerId);
  }
};
