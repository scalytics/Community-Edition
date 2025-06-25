import React, { useState, useEffect } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import integrationService from '../../../services/integrationService';

const IntegrationForm = ({ integration, onSave, onCancel, isLoading }) => {
  // Removed unused theme variable
  useTheme();
  const [formData, setFormData] = useState({
    name: '',
    provider: '',
    client_id: '',
    client_secret: '',
    additional_config: '',
    enabled: false
  });
  const [errors, setErrors] = useState({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Check if provider might be an AI provider (needs key validation)
  const isAIProvider = (provider) => {
    const aiProviders = ['OpenAI', 'Anthropic', 'Cohere', 'Mistral', 'Hugging Face'];
    return aiProviders.includes(provider);
  };

  // Handle API key validation
  const validateApiKey = async () => {
    if (!formData.provider || !formData.client_secret) {
      setValidationResult({
        isValid: false,
        message: 'Both provider and API key are required for validation'
      });
      return;
    }

    try {
      setValidating(true);
      setValidationResult(null);
      
      const response = await integrationService.validateApiKey(
        formData.provider, 
        formData.client_secret
      );
      
      setValidationResult(response.data);
    } catch (error) {
      setValidationResult({
        isValid: false,
        message: error.response?.data?.message || 'Error validating API key'
      });
    } finally {
      setValidating(false);
    }
  };

  // Initialize form with integration data when editing
  useEffect(() => {
    if (integration) {
      setFormData({
        name: integration.name || '',
        provider: integration.provider || '',
        client_id: integration.client_id || '',
        client_secret: '', // Don't prefill for security reasons
        additional_config: integration.additional_config ? JSON.stringify(integration.additional_config, null, 2) : '',
        enabled: Boolean(integration.enabled)
      });
    }
  }, [integration]);

  // Handle input change
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when field is updated
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Validate form data
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.provider.trim()) {
      newErrors.provider = 'Provider is required';
    }
    
    // Validate JSON syntax for additional_config if not empty
    if (formData.additional_config.trim()) {
      try {
        JSON.parse(formData.additional_config);
      } catch (error) {
        newErrors.additional_config = 'Invalid JSON format';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const processedData = {
      ...formData,
      additional_config: formData.additional_config ? JSON.parse(formData.additional_config) : null
    };
    
    onSave(processedData);
  };

  // Provider options
  const providerOptions = [
    { value: '', label: 'Select provider...' },
    { value: 'google', label: 'Google OAuth' },
    { value: 'github', label: 'GitHub OAuth' },
    { value: 'microsoft', label: 'Microsoft (Personal Accounts)' },
    { value: 'azure_ad', label: 'Azure Active Directory' },
    { value: 'okta', label: 'Okta OAuth' },
    { value: 'custom', label: 'Custom Provider' }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name field */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Integration Name
        </label>
        <input
          type="text"
          name="name"
          id="name"
          value={formData.name}
          onChange={handleChange}
          className={`mt-1 block w-full rounded-md shadow-sm 
            ${errors.name 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500'}
            dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm`}
          placeholder="e.g., Google Authentication"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
        )}
      </div>

      {/* Provider field */}
      <div>
        <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Provider
        </label>
        <select
          name="provider"
          id="provider"
          value={formData.provider}
          onChange={handleChange}
          className={`mt-1 block w-full rounded-md shadow-sm 
            ${errors.provider 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500'}
            dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm`}
          disabled={isLoading || (integration && integration.id)}
        >
          {providerOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.provider && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.provider}</p>
        )}
        {integration && integration.id && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Provider cannot be changed after creation.
          </p>
        )}
      </div>
      
      {/* Custom provider input if 'custom' is selected */}
      {formData.provider === 'custom' && (
        <div>
          <label htmlFor="custom_provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Custom Provider Name
          </label>
          <input
            type="text"
            name="provider"
            id="custom_provider"
            value={formData.provider === 'custom' ? '' : formData.provider}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm"
            placeholder="e.g., azure, auth0, etc."
            disabled={isLoading}
          />
        </div>
      )}

      {/* Client ID field */}
      <div>
        <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Client ID
        </label>
        <input
          type="text"
          name="client_id"
          id="client_id"
          value={formData.client_id}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm"
          placeholder="Enter client ID"
          disabled={isLoading}
        />
      </div>

      {/* Client Secret field */}
      <div>
        <label htmlFor="client_secret" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Client Secret {isAIProvider(formData.provider) ? '/ API Key' : ''}
        </label>
        <div className="mt-1 flex">
          <input
            type="password"
            name="client_secret"
            id="client_secret"
            value={formData.client_secret}
            onChange={handleChange}
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm"
            placeholder={integration ? "Leave blank to keep current secret" : "Enter client secret"}
            disabled={isLoading || validating}
          />
          {isAIProvider(formData.provider) && formData.client_secret && (
            <button
              type="button"
              onClick={validateApiKey}
              className="ml-2 inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={isLoading || validating || !formData.client_secret}
            >
              {validating ? (
                <svg className="animate-spin mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Test Key'}
            </button>
          )}
        </div>
        {integration && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Leave blank to keep the current secret.
          </p>
        )}
        {validationResult && (
          <div className={`mt-2 p-2 text-sm rounded-md ${
            validationResult.isValid 
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' 
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            {validationResult.message}
          </div>
        )}
      </div>

      {/* Additional Configuration field */}
      <div>
        <label htmlFor="additional_config" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Additional Configuration (JSON)
        </label>
        <textarea
          name="additional_config"
          id="additional_config"
          rows="5"
          value={formData.additional_config}
          onChange={handleChange}
          className={`mt-1 block w-full rounded-md shadow-sm 
            ${errors.additional_config 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500'}
            dark:bg-gray-700 dark:text-dark-text-primary sm:text-sm font-mono`}
          placeholder={`{\n  "redirectUri": "/auth/callback",\n  "scope": "openid profile email"\n}`}
          disabled={isLoading}
        ></textarea>
        {errors.additional_config && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.additional_config}</p>
        )}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Enter additional provider configuration as JSON. Include redirectUri and any provider-specific parameters.
        </p>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id="enabled"
            name="enabled"
            type="checkbox"
            checked={formData.enabled}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
            disabled={isLoading}
          />
        </div>
        <div className="ml-3 text-sm">
          <label htmlFor="enabled" className="font-medium text-gray-700 dark:text-gray-300">
            Enable Integration
          </label>
          <p className="text-gray-500 dark:text-gray-400">
            When enabled, this integration will be available for authentication.
          </p>
        </div>
      </div>

      {/* Form actions */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          ) : (
            'Save Integration'
          )}
        </button>
      </div>
    </form>
  );
};

export default IntegrationForm;
