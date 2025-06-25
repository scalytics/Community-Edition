import React, { useState, useEffect } from 'react';
import apiService from '../../services/apiService';
import InfoModal from '../common/InfoModal';
import { privacyService } from '../../services/admin';

const ApiKeyManager = ({ canGenerate }) => {
  const [providers, setProviders] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [googleCxId, setGoogleCxId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showGlobalKeyModal, setShowGlobalKeyModal] = useState(false);
  const [globalKeyOverrideInfo, setGlobalKeyOverrideInfo] = useState({ provider: '' });
  const [globalKeyProviderIds, setGlobalKeyProviderIds] = useState([]);
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  const [scalyticsKeyName, setScalyticsKeyName] = useState('');
  const [generatedScalyticsKey, setGeneratedScalyticsKey] = useState(null);
  const [generatingScalyticsKey, setGeneratingScalyticsKey] = useState(false);
  const [isScalyticsApiGloballyEnabled, setIsScalyticsApiGloballyEnabled] = useState(false);
  const [hasExistingScalyticsKey, setHasExistingScalyticsKey] = useState(false);
  const scalyticsKeyNameInputRef = React.useRef(null);

  useEffect(() => {
    const fetchGlobalKeysAndPrivacy = async () => {
      setPrivacyModeEnabled(false);
      setError('');
      try {
        let isPrivacyModeEnabled = false;
        try {
          const privacyResponse = await privacyService.getPrivacySettings();
          isPrivacyModeEnabled =
            (privacyResponse?.data?.data?.globalPrivacyMode === true) ||
            (privacyResponse?.data?.globalPrivacyMode === true) ||
            (privacyResponse?.globalPrivacyMode === true);

          setPrivacyModeEnabled(isPrivacyModeEnabled);
        } catch (privacyError) {
          console.error('Privacy settings fetch failed, defaulting to OFF:', privacyError);
        }
        try {
          const globalKeysResponse = await apiService.get('/apikeys/admin/global');
          let globalKeysList = [];
          if (Array.isArray(globalKeysResponse?.data)) {
            globalKeysList = globalKeysResponse.data;
          } else {
            console.warn("Received non-array response for global keys in initial fetch:", globalKeysResponse?.data);
          }

          // Now safely use array methods
          const globalProviderIds = globalKeysList
            .filter(key => key.is_active)
            .map(key => key.provider_id);
          setGlobalKeyProviderIds(globalProviderIds);
        } catch (keysError) {
          console.error('Global API keys fetch failed:', keysError);
          setGlobalKeyProviderIds([]);
        }
      } catch (err) {
        console.error('Catastrophic error in fetchGlobalKeysAndPrivacy:', err);
      }
    };
    fetchGlobalKeysAndPrivacy();
  }, []);

  // Fetch providers, user's API keys, and check admin status
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        const [providersResponse, apiKeysResponse, userInfoResponse] = await Promise.allSettled([
          apiService.get('/admin/providers'),
          apiService.get('/apikeys'),
          apiService.get('/auth/me')
        ]);

        if (providersResponse.status === 'fulfilled') {
          setProviders(providersResponse.value.data || []);
        } else {
          console.error("Failed to fetch providers:", providersResponse.reason);
          setProviders([]);
        }

        if (apiKeysResponse.status === 'fulfilled') {
          const userKeys = apiKeysResponse.value.data || [];
          setApiKeys(userKeys);
          // Check if user already has a Scalytics API key
          const existingScalytics = userKeys.some(key => key.provider_name === 'Scalytics API');
          setHasExistingScalyticsKey(existingScalytics);
        } else {
           console.error("Failed to fetch user API keys:", apiKeysResponse.reason);
          setApiKeys([]);
          setHasExistingScalyticsKey(false);
        }

        if (userInfoResponse.status === 'fulfilled') {
          const userData = userInfoResponse.value.data;
          const userIsAdmin = userData &&
            (userData.isAdmin === true ||
             (userData.groups && userData.groups.some(g => g.name.toLowerCase() === 'administrator')));
          setIsAdmin(userIsAdmin);
        } else {
           console.error("Failed to fetch user info:", userInfoResponse.reason);
          setIsAdmin(false);
        }
      } catch (err) {
        console.error('Error in fetching API data:', err);
        setError('Failed to load API providers or keys. Please try refreshing the page.');
        setProviders([]);
        setApiKeys([]);
      } finally {
        setLoading(false);
      }
    };

    // Fetch Scalytics API global status as well
    const fetchScalyticsStatus = async () => {
      try {
        const response = await apiService.get('/users/scalytics-api-status');
        if (response.success && response.data) {
          const isEnabled = response.data.isEnabled === true;
          setIsScalyticsApiGloballyEnabled(isEnabled);
        } else {
           console.warn("Could not fetch Scalytics API global status using public endpoint. Response:", response);
           setIsScalyticsApiGloballyEnabled(false);
        }
      } catch (err) {
         console.error("Error fetching Scalytics API global status:", err);
         setIsScalyticsApiGloballyEnabled(false);
      }
    };

    fetchData();
    fetchScalyticsStatus();
  }, []);

  // Function to refresh API keys list
  const refreshApiKeys = async () => {
    try {
      const apiKeysResponse = await apiService.get('/apikeys');
      const userKeys = apiKeysResponse.data || [];
      setApiKeys(userKeys);
      const existingScalytics = userKeys.some(key => key.provider_name === 'Scalytics API');
      setHasExistingScalyticsKey(existingScalytics);
    } catch (err) {
      console.error("Failed to refresh API keys:", err);
    }
  };

  // Add a new EXTERNAL API key
  const handleAddKey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    if (!selectedProvider || !apiKey.trim()) {
      setError('Please select a provider and enter an API key');
      setSubmitting(false);
      return;
    }

    const selectedProviderData = providers.find(p => p.id === Number(selectedProvider)); // Use strict equality (===) with type conversion

    try {
      // Construct the payload
      const payload = {
        providerId: selectedProvider,
        keyName: `USER: ${selectedProviderData?.name || 'Provider'} Key`,
        keyValue: apiKey,
        encrypt: true, 
        extraConfig: null 
      };

      // Add extraConfig specifically for Google Search
      if (selectedProviderData && selectedProviderData.name === 'Google Search') {
        if (!googleCxId.trim()) {
          setError('Google Custom Search Engine ID (CX) is required for Google Search keys.');
          setSubmitting(false);
          return;
        }
        payload.extraConfig = { cx: googleCxId.trim() };
      }

      await apiService.post('/apikeys', payload);
      await refreshApiKeys();
      const hasGlobalKey = globalKeyProviderIds.includes(Number(selectedProvider));

      if (hasGlobalKey) {
        const providerName = selectedProviderData?.name || 'Selected Provider';
        setGlobalKeyOverrideInfo({ provider: providerName, count: 1 });
        setShowGlobalKeyModal(true);
      }

      // Reset form
      setSelectedProvider('');
      setApiKey('');
      setGoogleCxId('');
      setSuccess('API key added successfully');

    } catch (err) {
      console.error('Error adding API key:', err);
      setError(err.response?.data?.message || err.message || 'Failed to add API key');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate a new Scalytics API key
  const handleGenerateScalyticsKey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setGeneratedScalyticsKey(null);

    // Check for empty name FIRST
    if (!scalyticsKeyName.trim()) {
      setError('Please enter a name for the key.');
      if (scalyticsKeyNameInputRef.current) {
        scalyticsKeyNameInputRef.current.focus();
      }
      return;
    }

    // If name is present, proceed
    setGeneratingScalyticsKey(true);
    setError('');
    setSuccess('');
    setGeneratedScalyticsKey(null);

    try {
      const response = await apiService.post('/apikeys/scalytics', { keyName: scalyticsKeyName.trim() });
      if (response.success && response.data?.apiKey) {
        setGeneratedScalyticsKey(response.data.apiKey);
        setSuccess(response.message || 'Scalytics API key generated successfully. Copy it now!');
        setScalyticsKeyName('');
        await refreshApiKeys();
      } else {
        throw new Error(response.message || 'Failed to generate key.');
      }
    } catch (err) {
      console.error('Error generating Scalytics API key:', err);
      setError(err.message || 'Failed to generate Scalytics API key.');
    } finally {
      setGeneratingScalyticsKey(false);
    }
  };

  // Delete an API key
  const handleDeleteKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) return;
    try {
      setError('');
      setSuccess('');

      const keyToDelete = apiKeys.find(key => key.id === keyId);
      await apiService.delete(`/apikeys/${keyId}`);
      setApiKeys(prevKeys => {
        const updatedKeys = prevKeys.filter(key => key.id !== keyId);

        if (keyToDelete && keyToDelete.provider_name === 'Scalytics API') {
          const stillHasScalytics = updatedKeys.some(key => key.provider_name === 'Scalytics API');
          setHasExistingScalyticsKey(stillHasScalytics);
        }
        if (keyToDelete && keyToDelete.provider_name === 'Scalytics API') {
          setGeneratedScalyticsKey(null);
        }

        return updatedKeys;
      });

      setSuccess('API key deleted successfully');
    } catch (err) {
      console.error('Error deleting API key:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete API key');
    }
  };

  // Activate
  const handleActivateKey = async (keyId) => {
    if (privacyModeEnabled) {
      setError('Cannot activate API keys while Privacy Mode is enabled. Please contact your administrator.');
      return;
    }

    try {
      setError(''); setSuccess('');
      await apiService.put(`/apikeys/${keyId}/activate`);
      setApiKeys(prevKeys => prevKeys.map(key => key.id === keyId ? { ...key, is_active: true } : key));
      setSuccess('API key activated successfully');
    } catch (err) {
      console.error('Error activating API key:', err);
      setError(err.response?.data?.message || err.message || 'Failed to activate API key');
    }
  };

  // Deactivate
  const handleDeactivateKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to deactivate this API key?')) return;
    try {
      setError(''); setSuccess('');
      await apiService.put(`/apikeys/${keyId}/deactivate`);
      setApiKeys(prevKeys => prevKeys.map(key => key.id === keyId ? { ...key, is_active: false } : key));
      setSuccess('API key deactivated successfully');
    } catch (err) {
      console.error('Error deactivating API key:', err);
      setError(err.response?.data?.message || err.message || 'Failed to deactivate API key');
    }
  };

  // Separate providers into AI and Search categories
  const searchProviderNames = ['Google Search', 'Bing Search'];
  const excludedProviderNames = ['Scalytics API', 'Scalytics MCP']; // Add names to exclude from display lists

  const filteredProviders = providers.filter(p => !excludedProviderNames.includes(p.name));

  const aiModelProviders = filteredProviders.filter(p => !searchProviderNames.includes(p.name));
  const searchProviders = filteredProviders.filter(p => searchProviderNames.includes(p.name));

  if (loading) {
    return (
      <div className="animate-pulse p-4 space-y-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-primary shadow-sm rounded-lg p-4 sm:p-6">
      <InfoModal
        isOpen={showGlobalKeyModal}
        onClose={() => setShowGlobalKeyModal(false)}
        title="Global API Keys Are Being Used"
        message={
          globalKeyOverrideInfo.count === 1
            ? `A global API key exists for ${globalKeyOverrideInfo.provider}. The system will use the global key instead of your personal key.`
            : `Global API keys exist for ${globalKeyOverrideInfo.count} providers, including ${globalKeyOverrideInfo.provider}. The system will use global keys instead of your personal keys when available.`
        }
        actionText="I Understand"
      />
      <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">External API Keys</h2>

      {privacyModeEnabled && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-400">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {/* Added dark variant for icon color */}
              <svg className="h-5 w-5 text-blue-400 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Privacy Mode Active</h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                <p>Global Privacy Mode is currently enabled by your administrator. External API models are restricted.</p>
                <p className="mt-1">While in Privacy Mode, you cannot add or activate API keys for external providers.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md border dark:border-red-800">
          {error}
        </div>
      )}
      {success && (<div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md border dark:border-green-800">{success}</div>)}

      {/* Available AI Model Providers Section */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-2">Available AI Model Providers</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {aiModelProviders.length > 0 ? (
            aiModelProviders.map(provider => (
              <div key={provider.id} className="border border-gray-200 dark:border-dark-border rounded-md p-3 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <div className="font-medium dark:text-dark-text-primary">{provider.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{provider.description}</div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-gray-500 dark:text-gray-400 text-center py-4">No AI Model providers available</div>
          )}
        </div>
      </div>

      {/* Available Search Providers Section */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-2">Available Search Providers</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {searchProviders.length > 0 ? (
            searchProviders.map(provider => (
              <div key={provider.id} className="border border-gray-200 dark:border-dark-border rounded-md p-3 hover:border-teal-300 dark:hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
                <div className="font-medium dark:text-dark-text-primary">{provider.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{provider.description}</div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-gray-500 dark:text-gray-400 text-center py-4">No Search providers available</div>
          )}
        </div>
      </div>

      {/* Add new API key form */}
      <form onSubmit={handleAddKey} className="mb-6 border-t border-gray-200 dark:border-dark-border pt-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">Add New API Key</h3>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-4">
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
            <select
              id="provider"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={submitting} 
            >
              <option value="">Select a provider</option>
              {/* Filter providers: show all (internal and external) EXCEPT specific excluded names */}
              {providers && Array.isArray(providers) && providers
                .filter(provider => !excludedProviderNames.includes(provider.name))
                .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} {/* Show all providers except those in excludedProviderNames */}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Key</label>
            <input
              type="password" id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter your API key"
              disabled={submitting} 
            />
          </div>

          {/* Conditionally show Google CX ID input */}
          {providers.find(p => p.id === selectedProvider)?.name === 'Google Search' && (
            <div className="sm:col-span-2">
              <label htmlFor="googleCxId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Google Custom Search Engine ID (CX)
                <span className="text-xs text-gray-500 ml-1">(Required for Google Search)</span>
              </label>
              <input
                type="text" id="googleCxId" value={googleCxId} onChange={(e) => setGoogleCxId(e.target.value)}
                className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter your CX ID (e.g., 0123456789abcdefg)" disabled={submitting || privacyModeEnabled}
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <button
            type="submit"
            className={`
              inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
              focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800
              bg-blue-600 hover:bg-blue-700 focus:ring-blue-500
            `}
            disabled={submitting} 
          >
            {submitting ? 'Adding...' : 'Add API Key'}
          </button>
        </div>
      </form>

      {/* Generate Scalytics API Key Form - Conditionally render based on canGenerate prop */}
      {canGenerate && (
        <div className="mb-6 border-t border-gray-200 dark:border-dark-border pt-6"> 
          <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">Generate Scalytics API Key</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Generate a key to use the Scalytics API with external tools (like development environments).
          This key only works with local models hosted by this instance.
        </p>
        {!isScalyticsApiGloballyEnabled && (
           <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-md border border-yellow-200 dark:border-yellow-700 text-sm">
             The Scalytics API is currently disabled by the administrator. Key generation is unavailable.
           </div>
        )}
        <div>
          <label htmlFor="scalyticsKeyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Key Name (e.g., "My Dev Key")
          </label>
          <input
            ref={scalyticsKeyNameInputRef} 
            type="text"
            id="scalyticsKeyName"
            value={scalyticsKeyName}
            onChange={(e) => setScalyticsKeyName(e.target.value)}
            className={`mt-1 block w-full sm:w-1/2 py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${!isScalyticsApiGloballyEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="Enter a descriptive name"
            disabled={generatingScalyticsKey || !isScalyticsApiGloballyEnabled || hasExistingScalyticsKey} 
          />
        </div>
        {hasExistingScalyticsKey && (
          <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-500">
            You already have a Scalytics API key. Only one key is allowed per user. Delete the existing key below to generate a new one.
          </p>
        )}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGenerateScalyticsKey}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${!isScalyticsApiGloballyEnabled || hasExistingScalyticsKey ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800'}`}
            disabled={generatingScalyticsKey || !isScalyticsApiGloballyEnabled || hasExistingScalyticsKey} 
          >
            {generatingScalyticsKey ? 'Generating...' : 'Generate Key'}
          </button>
          </div>
        {/* Display generated key once */}
        {generatedScalyticsKey && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">Key Generated Successfully!</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">Copy this key now. It will not be shown again.</p>
            <div className="mt-2 flex items-center bg-gray-100 dark:bg-dark-primary rounded p-2">
              <input
                type="text"
                readOnly
                value={generatedScalyticsKey}
                className="flex-grow bg-transparent border-none text-sm font-mono text-gray-700 dark:text-gray-300 focus:ring-0"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedScalyticsKey);
                  setSuccess('Key copied to clipboard!'); 
                  setTimeout(() => setSuccess(''), 3000); 
                }}
                className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                title="Copy Key"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        )}
        </div>
      )} {/* End conditional rendering block */}
      
      {/* Global API keys section */}
      <div className="border-t border-gray-200 dark:border-dark-border pt-6 mb-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">System-wide API Keys</h3>
        <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">The following global keys are set by administrators and available to all users.</div>
        {globalKeyProviderIds.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">No global API keys are currently active.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {providers.filter(provider => globalKeyProviderIds.includes(provider.id)).map(provider => (
                <div key={`global-key-${provider.id}`} className="border border-purple-200 dark:border-purple-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-semibold dark:text-dark-text-primary">{provider.name}</h4> 
                  <div className="mt-2">
                    {/* Added dark variants for badges */}
                    <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-1 rounded">Global</span>
                    <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded ml-2">Active</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Set by administrator for all users</p> 
                  
                  {/* Modern Global Key display box */}
                  <div className="mt-2 px-3 py-2.5 flex items-center rounded-md bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border border-green-300 dark:border-green-700 shadow-sm transition-all duration-200 hover:shadow-md group">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 dark:text-green-400 mr-2 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="font-mono text-sm tracking-wide text-green-700 dark:text-green-300 font-medium w-full">
                      [Protected Global Key]
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* User API keys list */}
      <div className="border-t border-gray-200 dark:border-dark-border pt-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">{isAdmin ? "User API Keys" : "Your Personal API Keys"}</h3>
        {!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            {canGenerate ? (
              <>
                <p>You haven't added any API keys yet.</p>
                <p className="text-sm">Add an external key or generate a Scalytics key above.</p>
              </>
            ) : (
              <p>You currently do not have any API keys and lack permission to generate new ones. Please contact your administrator if you require API access.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apiKeys.map((key) => {
              const isScalyticsKey = key.provider_name === 'Scalytics API';
              const isExternalKey = !isScalyticsKey; 

              return (
                <div key={key.id} className={`border ${isScalyticsKey ? 'border-indigo-200 dark:border-indigo-700' : 'border-blue-200 dark:border-blue-700'} rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}>
                <div>
                  {/* Header with title and action buttons */}
                  <div className="flex justify-between items-start mb-2">
                    {/* Added dark variant for title */}
                    <h4 className="font-semibold dark:text-dark-text-primary">{key.provider_name}</h4> 
                    <div className="flex items-center space-x-1">
                      {/* Activate/Deactivate only for EXTERNAL keys */}
                      {isExternalKey && key.is_active && (
                        <button
                          onClick={() => handleDeactivateKey(key.id)}
                          className="p-1.5 text-gray-400 hover:text-yellow-500 rounded-full hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                          title="Deactivate External API Key"
                        >
                          {/* Deactivate Icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                      )}
                      {isExternalKey && !key.is_active && (
                        <button
                          onClick={() => handleActivateKey(key.id)}
                          className="p-1.5 text-gray-400 hover:text-green-500 rounded-full hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                          title="Activate External API Key"
                        >
                          {/* Activate Icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                      )}
                      {/* Delete button always available */}
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete API Key"
                      >
                        {/* Delete Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {/* Scalytics keys are always considered 'active' in the DB, display depends on global toggle */}
                    {isScalyticsKey ? (
                       <span className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-1 rounded">Scalytics API</span>
                    ) : key.is_active ? (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">Active</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-2 py-1 rounded">Inactive</span>
                    )}
                    {/* Overwritten badge only relevant for external keys */}
                    {isExternalKey && globalKeyProviderIds.includes(key.provider_id) && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-1 rounded">
                        Overwritten
                      </span>
                    )}
                  </div>

                  {/* Added dark variants for text */}
                  <p className="text-xs mb-2 text-gray-600 dark:text-gray-400">Name: {key.key_name || 'Unnamed Key'}</p>
                  <p className="text-xs mb-2 text-gray-600 dark:text-gray-400">Added: {new Date(key.created_at).toLocaleDateString()}</p>

                  {/* Key display box - Different display for Scalytics vs External */}
                  {isScalyticsKey ? (
                     <div className="mt-2 px-3 py-2.5 flex items-center rounded-md bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 border border-indigo-300 dark:border-indigo-700 shadow-sm group">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500 dark:text-indigo-400 mr-2 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                       </svg>
                       <span className="font-mono text-sm tracking-wide text-indigo-700 dark:text-indigo-300 font-medium w-full">
                         [Scalytics API Key]
                       </span>
                     </div>
                  ) : (
                    (() => {
                      const isOverwritten = globalKeyProviderIds.includes(key.provider_id);
                      const isValid = key.is_active;
                      const boxStyles = isOverwritten
                        ? "border-yellow-300 dark:border-yellow-700 from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30"
                        : isValid
                          ? "border-green-300 dark:border-green-700 from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30"
                          : "border-gray-200 dark:border-dark-border from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800";
                      const iconColor = isOverwritten ? "text-yellow-500 dark:text-yellow-400" : isValid ? "text-green-500 dark:text-green-400" : "text-blue-500 dark:text-blue-400";
                      const textColor = isOverwritten ? "text-yellow-700 dark:text-yellow-300" : isValid ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300";
                      return (
                        <div className={`mt-2 px-3 py-2.5 flex items-center rounded-md bg-gradient-to-r ${boxStyles} shadow-sm transition-all duration-200 hover:shadow-md group`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${iconColor} mr-2 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span className={`font-mono text-sm tracking-wide ${textColor} font-medium w-full`}>
                            [Protected Private Key]
                          </span>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 text-sm rounded-md border border-blue-100 dark:border-blue-800">
        {/* Added dark variants for text */}
        <h4 className="font-medium text-blue-800 dark:text-blue-300">Why add API keys?</h4>
        <p className="mt-1 text-blue-700 dark:text-blue-400">
          Adding your own API keys for services like OpenAI, Anthropic, and others allows you to 
          access advanced models with your own account. Your keys are encrypted and securely stored.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyManager;
