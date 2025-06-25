/**
 * Azure AD-specific authentication helpers
 * 
 * Provides specialized functions for Azure Active Directory authentication
 * including JWT token validation, group membership checking, and domain validation.
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

/**
 * Validates an Azure AD JWT token
 * @param {string} token - The ID token to validate
 * @param {object} config - Azure AD configuration
 * @returns {Promise<object>} The decoded and validated token payload
 */
async function validateAzureAdToken(token, config) {
  const { tenantId, clientId } = config;
  
  // For Azure AD, we need to validate the token with the tenant-specific keys
  const client = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  });
  
  // Decode the token without verification to get the key ID
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    throw new Error('Invalid token');
  }
  
  // Get the key ID from the token header
  const kid = decoded.header.kid;
  
  // Get the signing key
  const getSigningKey = (kid) => {
    return new Promise((resolve, reject) => {
      client.getSigningKey(kid, (err, key) => {
        if (err) {
          return reject(err);
        }
        const signingKey = key.getPublicKey();
        resolve(signingKey);
      });
    });
  };
  
  try {
    const signingKey = await getSigningKey(kid);
    
    // Verify the token with the correct signing key
    const verifiedToken = jwt.verify(token, signingKey, {
      audience: clientId, // Must match the application ID
      issuer: `https://sts.windows.net/${tenantId}/` // Must match the tenant issuer
    });
    
    return verifiedToken;
  } catch (error) {
    console.error('Azure AD token validation error:', error);
    throw new Error('Token validation failed: ' + error.message);
  }
}

/**
 * Checks if the user's email domain is in the allowed domains list
 * @param {string} email - User's email
 * @param {string} allowedDomains - Comma-separated list of allowed domains
 * @returns {boolean} True if the domain is allowed
 */
function isAllowedDomain(email, allowedDomains) {
  if (!allowedDomains || !email || !email.includes('@')) {
    return true; // No domain restrictions
  }
  
  const userDomain = email.split('@')[1].toLowerCase();
  const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
  
  return domains.includes(userDomain);
}

/**
 * Extract group memberships from Azure AD token claims
 * @param {object} tokenClaims - The decoded token claims
 * @returns {Array<string>} Array of group IDs 
 */
function extractGroupMemberships(tokenClaims) {
  // Azure AD can include groups in different claim formats
  const groups = tokenClaims.groups || tokenClaims.wids || [];
  return Array.isArray(groups) ? groups : [];
}

/**
 * Build authorization parameters for Azure AD
 * @param {object} config - Azure AD configuration
 * @returns {object} Authorization parameters 
 */
function buildAzureAuthParams(config) {
  const { clientId, tenantId, scope, responseMode, redirectUri } = config;
  
  return {
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: responseMode || 'query',
    scope: scope || 'openid profile email',
    tenant: tenantId
  };
}

/**
 * Get user info from Azure AD token claims
 * @param {object} tokenClaims - The decoded token claims 
 * @returns {object} Standardized user info
 */
function getUserInfoFromClaims(tokenClaims) {
  return {
    id: tokenClaims.oid || tokenClaims.sub, // Object ID or subject ID
    email: tokenClaims.email || tokenClaims.preferred_username,
    name: tokenClaims.name || tokenClaims.preferred_username,
    givenName: tokenClaims.given_name,
    familyName: tokenClaims.family_name,
    groups: extractGroupMemberships(tokenClaims),
    tenantId: tokenClaims.tid // Tenant ID
  };
}

module.exports = {
  validateAzureAdToken,
  isAllowedDomain,
  extractGroupMemberships,
  buildAzureAuthParams,
  getUserInfoFromClaims
};
