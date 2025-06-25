/**
 * API Service for external provider operations
 * Handles validation of API keys and other provider-specific operations
 */
const axios = require('axios');
const providerManager = require('./providers');

/**
 * Validate an API key for a specific provider
 * @param {string} providerName - The name of the provider (e.g., 'OpenAI', 'Anthropic')
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<{isValid: boolean, message: string}>} - Validation result with message
 */
async function validateApiKey(providerName, apiKey) {
  try {
    if (!apiKey || !providerName) {
      return { 
        isValid: false, 
        message: 'API key and provider name are required' 
      };
    }

    // Get the provider module
    const provider = providerManager.getProvider(providerName);
    
    const providerModule = providerManager.getProvider(providerName);
    
    if (providerModule && typeof providerModule.validateApiKey === 'function') {
      // Use the provider-specific validation if available
      
      // Fetch the provider's DB record to pass as config
      const { db } = require('../models/db'); 
      const providerDbRecord = await db.getAsync('SELECT * FROM api_providers WHERE name = ?', [providerName]);

      if (!providerDbRecord) {
        return { isValid: false, message: `Configuration for provider '${providerName}' not found.` };
      }

      // Pass the apiKey and the full providerDbRecord as providerConfig
      const validationResult = await providerModule.validateApiKey(apiKey, providerDbRecord); 
      
      // The provider module should return an object { isValid: boolean, message?: string, errorMessage?: string }
      if (typeof validationResult === 'object' && validationResult !== null && 'isValid' in validationResult) {
        // Prioritize errorMessage if present and validation failed, otherwise use message or a default.
        let resultMessage;
        if (validationResult.isValid) {
          resultMessage = validationResult.message || `API key for ${providerName} is valid (specific validation).`;
        } else {
          resultMessage = validationResult.errorMessage || validationResult.message || `API key for ${providerName} is invalid or expired (specific validation).`;
        }
        return {
          isValid: validationResult.isValid,
          message: resultMessage
        };
      }
      // Fallback for older boolean results from provider modules (less likely now)
      const isValid = Boolean(validationResult);
      return {
        isValid,
        message: isValid 
          ? `API key for ${providerName} is valid (specific validation).` 
          : `API key for ${providerName} is invalid or expired (specific validation).`
      };
    } else {
      // Generic OpenAI-like validation for providers without a specific validateApiKey method
      // This includes custom providers not managed by providerManager.
      const { db } = require('../models/db'); 
      const providerDbRecord = await db.getAsync('SELECT api_url, endpoints FROM api_providers WHERE name = ?', [providerName]);

      if (!providerDbRecord || !providerDbRecord.api_url) {
        return { isValid: false, message: `Configuration for provider '${providerName}' not found or API URL is missing for generic validation.` };
      }

      let modelsEndpoint = '/v1/models'; // Default OpenAI models endpoint
      if (providerDbRecord.endpoints) {
        try {
          const parsedEndpoints = JSON.parse(providerDbRecord.endpoints);
          if (parsedEndpoints.models) {
            modelsEndpoint = parsedEndpoints.models;
          }
        } catch (e) {
          console.error(`[apiService.validateApiKey] Failed to parse endpoints for ${providerName}, using default /v1/models. Error: ${e.message}`);
        }
      }
      
      const targetUrl = `${providerDbRecord.api_url.replace(/\/$/, '')}${modelsEndpoint.startsWith('/') ? '' : '/'}${modelsEndpoint}`;
      
      try {
        await axios.get(targetUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 7000 // 7-second timeout for validation
        });
        return { isValid: true, message: `API key for ${providerName} appears valid (generic test connection successful).` };
      } catch (axiosError) {
        let errorMessage = `Generic validation failed for ${providerName}: ${axiosError.message}`;
        if (axiosError.response) {
          errorMessage = `Generic validation for ${providerName} failed with status ${axiosError.response.status}: ${axiosError.response.data?.error?.message || axiosError.response.statusText || axiosError.message}`;
          if (axiosError.response.status === 401 || axiosError.response.status === 403) {
            errorMessage = `API key for ${providerName} is invalid or not authorized (generic test connection).`;
          }
        }
        console.error(errorMessage);
        return { isValid: false, message: errorMessage };
      }
    }

    // Fallback - should not be reached if logic above is complete
    // const validationResult = await provider.validateApiKey(apiKey);
    
    // If the validation result is an object with isValid property, use that
    // Handle both old format (boolean) and new format (object with isValid and errorMessage)
    const validationResult = await provider.validateApiKey(apiKey);
    
    // If the validation result is an object with isValid property, use that
    if (typeof validationResult === 'object' && validationResult !== null && 'isValid' in validationResult) {
      return {
        isValid: validationResult.isValid,
        message: validationResult.isValid 
          ? `API key for ${providerName} is valid` 
          : validationResult.errorMessage || `API key for ${providerName} is invalid or expired`
      };
    } 
    
    // Otherwise, handle the legacy boolean return format
    const isValid = Boolean(validationResult);
    return {
      isValid,
      message: isValid 
        ? `API key for ${providerName} is valid` 
        : `API key for ${providerName} is invalid or expired`
    };
  } catch (error) {
    console.error(`Error validating API key for ${providerName}:`, error);
    return {
      isValid: false,
      message: `Error validating API key: ${error.message}`
    };
  }
}

module.exports = {
  validateApiKey
};
