import React, { useState, useEffect, useMemo } from 'react';
import apiService from '../../../services/apiService';
import ModernAlert from '../../common/ModernAlert';

const GlobalApiKeysManager = () => {
  const [providers, setProviders] = useState([]);
  const [globalApiKeys, setGlobalApiKeys] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [cxId, setCxId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  const currentProviderObj = useMemo(() => {
    return providers.find(p => String(p.id) === String(selectedProvider));
  }, [providers, selectedProvider]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [providersResponse, globalKeysResponse] = await Promise.all([
          apiService.get('/admin/providers'),
          apiService.get('/apikeys/admin/global'),
        ]);
        
        const filteredProviders = (providersResponse.data || []).filter(provider => 
          provider.name !== 'Local'
        );
        
        setProviders(filteredProviders);
        setGlobalApiKeys(globalKeysResponse.data || []);
        
      } catch (error) {
        setAlert({
          show: true,
          message: 'Failed to load API providers or keys. Please try again.',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Add new global API key
  const handleAddKey = async (e) => {
    e.preventDefault();
    
    const isGoogleSearch = currentProviderObj && currentProviderObj.name === 'Google Search';

    if (!selectedProvider || !apiKey.trim() || (isGoogleSearch && !cxId.trim())) {
      let message = 'Please select a provider and enter an API key.';
      if (isGoogleSearch && !cxId.trim()) {
        message = 'For Google Search, please provide Provider, API Key, and CX ID.';
      }
      setAlert({
        show: true,
        message, 
        type: 'error'
      });
      return;
    }
    
    try {
      setSubmitting(true);
      setAlert({ show: false });

      const payload = {
        providerId: selectedProvider,
        keyName: `GLOBAL: ${currentProviderObj?.name || 'Provider'} Key`,
        keyValue: apiKey,
        encrypt: true
      };

      if (isGoogleSearch && cxId) {
        payload.extraConfig = { cx: cxId.trim() };
      }
      
      await apiService.post('/apikeys/admin/global', payload);
      
      const response = await apiService.get('/apikeys/admin/global');
      setGlobalApiKeys(response.data || []);
      
      setSelectedProvider('');
      setApiKey('');
      setCxId(''); 
      
      setAlert({
        show: true,
        message: 'Global API key added successfully',
        type: 'success'
      });
    } catch (error) {
      setAlert({
        show: true,
        message: error.response?.data?.message || 'Failed to add global API key',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this global API key? This may affect all users of the system.')) {
      return;
    }
    
    try {
      setLoading(true);
      
      await apiService.delete(`/apikeys/admin/${keyId}`);
      
      setGlobalApiKeys(prevKeys => prevKeys.filter(key => key.id !== keyId));
      
      setAlert({
        show: true,
        message: 'Global API key deleted successfully',
        type: 'success'
      });
    } catch (error) {
      setAlert({
        show: true,
        message: error.response?.data?.message || 'Failed to delete global API key',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateKey = async (keyId) => {
    try {
      setLoading(true);
      
      await apiService.put(`/apikeys/admin/${keyId}/activate`);
      
      setGlobalApiKeys(prevKeys => prevKeys.map(key => 
        key.id === keyId ? { ...key, is_active: true } : key
      ));
      
      setAlert({
        show: true,
        message: 'Global API key activated successfully',
        type: 'success'
      });
    } catch (error) {
      let errorMessage = 'Failed to activate global API key';
      
      if (error.response?.data?.message === 'Cannot activate global API keys while Privacy Mode is enabled') {
        errorMessage = 'Cannot activate global API keys while Privacy Mode is enabled. Please disable Privacy Mode in the Admin → Privacy settings first.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      setAlert({
        show: true,
        message: errorMessage,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Deactivate a global API key
  const handleDeactivateKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to deactivate this global API key? This will prevent all users from using this provider\'s models.')) {
      return;
    }
    
    try {
      setLoading(true);
      
      await apiService.put(`/apikeys/admin/${keyId}/deactivate`);
      
      // Update the key status in the state
      setGlobalApiKeys(prevKeys => prevKeys.map(key => 
        key.id === keyId ? { ...key, is_active: false } : key
      ));
      
      setAlert({
        show: true,
        message: 'Global API key deactivated successfully',
        type: 'success'
      });
    } catch (error) {
      setAlert({
        show: true,
        message: error.response?.data?.message || 'Failed to deactivate global API key',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Test an API key
  const handleTestKey = async (keyId) => {
    // TODO: This would require the API to support a test endpoint for a key by ID
    setAlert({
      show: true,
      message: 'Key testing functionality will be implemented in a future update',
      type: 'info'
    });
  };

  if (loading && globalApiKeys.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-primary rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-primary rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-dark-text-primary mb-6">Global API Keys</h2>
      
      {alert.show && (
        <ModernAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert({ ...alert, show: false })}
        />
      )}

      {/* Add new API key form */}
      <form onSubmit={handleAddKey} className="mb-8 border-b border-gray-200 dark:border-dark-border pb-6">
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-4">Add New Global API Key</h3>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 gap-x-4">
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Provider
            </label>
            <select
              id="provider"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={submitting}
            >
              <option value="">Select a provider</option>
              {providers && Array.isArray(providers) && providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter the API key"
              disabled={submitting}
            />
          </div>

          {/* Conditional CX ID input for Google Search */}
          { currentProviderObj && currentProviderObj.name === 'Google Search' && (
            <div className="sm:col-span-2"> {/* Spans across two columns or adjust as needed */}
              <label htmlFor="cxId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Custom Search Engine ID (CX)
              </label>
              <input
                type="text"
                id="cxId"
                value={cxId}
                onChange={(e) => setCxId(e.target.value)}
                className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter your Google CX ID"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Required for Google Search. This will be stored in the provider's endpoint configuration.
              </p>
            </div>
          )}
        </div>
        
        <div className="mt-4">
          <button
            type="submit"
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-purple-500 ${
              submitting ? 'opacity-70 cursor-not-allowed' : ''
            }`}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </>
            ) : (
              'Add Global API Key'
            )}
          </button>
        </div>
      </form>

      {/* Global API keys list */}
      <div>
        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-4">System-wide Global API Keys</h3>
        
        {!globalApiKeys || !Array.isArray(globalApiKeys) || globalApiKeys.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-md">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="mt-2">No global API keys have been added yet.</p>
            <p className="text-sm mt-1">Add your first global key above to provide system-wide access to external providers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Provider</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Added On</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
                {globalApiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{key.provider_name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{key.key_name}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {key.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() => handleTestKey(key.id)}
                          className="text-blue-600 dark:text-dark-link hover:text-blue-800 dark:hover:text-dark-link"
                          title="Test this API key"
                        >
                          Test
                        </button>
                        {key.is_active ? (
                          <button
                            onClick={() => handleDeactivateKey(key.id)}
                            className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300"
                            title="Deactivate this API key"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className={`
                              text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300'
                              }
                            `}
                            title={ "Activate this API key" }
                            onClick={() => handleActivateKey(key.id)}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteKey(key.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                          title="Delete this API key"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <div className="mt-8 p-4 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-sm rounded-md border border-purple-100 dark:border-purple-800">
        <h4 className="font-medium">About Global API Keys</h4>
        <p className="mt-1">
          Global API keys are available to all users in the system and provide fallback access when a user doesn't have their own key.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Keys are shared across all users of the platform</li>
          <li>User-specific keys take precedence over global keys</li>
          <li>Consider usage quotas and billing implications when adding global keys</li>
          <li>Use encryption for enhanced security of sensitive API key data</li>
        </ul>
      </div>
    </div>
  );
};

export default GlobalApiKeysManager;
