import React, { useState, useEffect } from 'react';
import apiService from '../../../services/apiService';
import { apiKeyService, providerService, privacyService } from '../../../services/admin';
import StatusMessage from './StatusMessage';
import ApiKeysTab from './ApiKeysTab';
import ProvidersTable from './ProvidersTable';
import AddProviderForm from './AddProviderForm';
import EditProviderModal from './EditProviderModal';
import ScalyticsApiConfig from './ScalyticsApiConfig.jsx'; 

const ProvidersAdmin = () => {
  const [activeTab, setActiveTab] = useState('providers'); 

  const [providers, setProviders] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [editingProvider, setEditingProvider] = useState(null);
  const [newProvider, setNewProvider] = useState({
    name: '', description: '', api_url: '', endpoints: { models: '', chat: '', validate: '' }, is_active: true, is_external: true
  });

  const handleOpenEditModal = (providerToEdit) => {
    let finalEndpointsObject = { models: '', chat: '', validate: '' }; 

    if (providerToEdit && providerToEdit.endpoints && typeof providerToEdit.endpoints === 'string' && providerToEdit.endpoints.trim() !== '') {
      try {
        const parsed = JSON.parse(providerToEdit.endpoints);
        if (typeof parsed === 'object' && parsed !== null) {
          finalEndpointsObject.models = parsed.models || '';
          finalEndpointsObject.chat = parsed.chat || '';
          finalEndpointsObject.validate = parsed.validate || '';
        }
      } catch (e) {
        console.error('Error parsing endpoints JSON in handleOpenEditModal:', e);
      }
    } else if (providerToEdit && typeof providerToEdit.endpoints === 'object' && providerToEdit.endpoints !== null) {
      finalEndpointsObject.models = providerToEdit.endpoints.models || '';
      finalEndpointsObject.chat = providerToEdit.endpoints.chat || '';
      finalEndpointsObject.validate = providerToEdit.endpoints.validate || '';
    }
    
    const providerForModal = {
      ...providerToEdit,
      endpoints: finalEndpointsObject,
    };
    setEditingProvider(providerForModal);
  };

  const [loading, setLoading] = useState(true); 
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [error, setError] = useState(''); 
  const [success, setSuccess] = useState('');

  const [scalyticsSettings, setScalyticsSettings] = useState({
    enabled: false, windowMs: 900000, maxRequests: 100,
  });
  const [scalyticsSettingsLoading, setScalyticsSettingsLoading] = useState(true);
  const [scalyticsSettingsSaving, setScalyticsSettingsSaving] = useState(false);
  const [scalyticsSettingsError, setScalyticsSettingsError] = useState('');
  const [scalyticsSettingsSuccess, setScalyticsSettingsSuccess] = useState('');

  const [isPrivacyModeEnabled, setIsPrivacyModeEnabled] = useState(false);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const response = await providerService.getProviders();
      setProviders(response || []);
      setError('');
    } catch (err) {
      console.error('Error fetching providers:', err);
      setError('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      setApiKeysLoading(true);
      const keys = await apiKeyService.getAllApiKeys();
      setApiKeys(keys || []);
      setError('');
    } catch (err) {
      console.error('Error fetching API keys:', err);
      setError('Failed to load API keys.');
      setApiKeys([]);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const fetchScalyticsSettings = async () => {
      setScalyticsSettingsLoading(true);
      setScalyticsSettingsError('');
      try {
        const response = await apiService.get('/admin/settings/scalytics-api');
        if (response.success && response.data) {
          setScalyticsSettings({
            enabled: response.data.scalytics_api_enabled === 'true',
            windowMs: parseInt(response.data.scalytics_api_rate_limit_window_ms || '900000', 10),
            maxRequests: parseInt(response.data.scalytics_api_rate_limit_max || '100', 10),
          });
        } else {
           
           setScalyticsSettingsError('Failed to load Scalytics API settings.');
        }
      } catch (err) {
         console.error("Error fetching Scalytics API settings in ProvidersAdmin:", err);
         setScalyticsSettingsError('Failed to load Scalytics API settings.');
         setScalyticsSettings(prev => ({ ...prev, enabled: false }));
      } finally {
         setScalyticsSettingsLoading(false);
      }
    };

  const fetchPrivacyStatus = async () => {
      try {
        const settingsData = await privacyService.getPrivacySettings(); 
        if (settingsData && typeof settingsData.globalPrivacyMode === 'boolean') {
           setIsPrivacyModeEnabled(settingsData.globalPrivacyMode === true);
        } else {
           
           setIsPrivacyModeEnabled(false); 
        }
      } catch (err) {
         console.error("Error fetching global privacy status in ProvidersAdmin:", err);
         setIsPrivacyModeEnabled(false);
      }
    };

  useEffect(() => {
    fetchProviders();
    fetchApiKeys();
    fetchScalyticsSettings(); 
    fetchPrivacyStatus();
  }, []);

  const saveProvider = async () => {
    try {
      setError(''); setSuccess('');
      
      if (!editingProvider || !editingProvider.id) {
        setError('Cannot save provider: Data is missing.');
        return;
      }

      const payload = {
        ...editingProvider,
        is_external: editingProvider.is_external ? 1 : 0, 
      };
      
      await providerService.updateProvider(editingProvider.id, payload);
      
      setSuccess('Provider updated successfully');
      setEditingProvider(null);
      fetchProviders();
    } catch (err) {
      console.error('[ProvidersAdmin] Error in saveProvider for ID', editingProvider ? editingProvider.id : 'unknown', ':', err);
      setError(err.message || 'Failed to update provider');
    }
  };

  const addProvider = async () => {
    try {
      setError(''); setSuccess('');
      if (!newProvider.name.trim()) {
        setError('Provider name is required'); return;
      }
      if (!newProvider.api_url.trim()) {
        setError('API URL is required'); return;
      }
      if (!newProvider.api_url.trim().startsWith('http://') && !newProvider.api_url.trim().startsWith('https://')) {
        setError('API URL must start with http:// or https://'); return;
      }
      
      const payload = {
        ...newProvider,
        is_external: newProvider.is_external ? 1 : 0, 
      };
      
      await providerService.addProvider(payload);
      
      setSuccess('Provider added successfully');
      setNewProvider({ name: '', description: '', api_url: '', endpoints: { models: '', chat: '', validate: '' }, is_active: true, is_external: true });
      fetchProviders();
    } catch (err) {
      setError(err.message || 'Failed to add provider.');
    }
  };

  const handleToggleActive = async (providerId, newStatus) => {
    try {
      setError(''); setSuccess('');
      const providerToUpdate = providers.find(p => p.id === providerId);
      if (!providerToUpdate) throw new Error('Provider not found.');
      const updatePayload = { ...providerToUpdate, is_active: newStatus };
      await providerService.updateProvider(providerId, updatePayload);
      setSuccess(`Provider ${providerToUpdate.name} ${newStatus ? 'activated' : 'deactivated'} successfully`);
      fetchProviders();
    } catch (err) {
      console.error('Error toggling provider status:', err);
      setError(err.message || 'Failed to toggle provider status');
    }
  };

  const deleteProvider = async (id) => {
    if (!window.confirm('Are you sure you want to delete this provider?')) return;
    try {
      setError(''); setSuccess('');
      await providerService.deleteProvider(id);
      setSuccess('Provider deleted successfully');
      fetchProviders();
    } catch (err) {
      console.error('Error deleting provider:', err);
      setError(err.message || 'Error deleting provider');
    }
  };

  const activateApiKey = async (keyId) => {
    try {
      setError(''); setSuccess('');
      await apiKeyService.activateApiKey(keyId);
      setSuccess('API key activated successfully');
      fetchApiKeys();
    } catch (err) {
      console.error('Error activating API key:', err);
      setError(err.message || 'Failed to activate API key');
    }
  };

  const deactivateApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to deactivate this API key?')) return;
    try {
      setError(''); setSuccess('');
      await apiKeyService.deactivateApiKey(keyId);
      setSuccess('API key deactivated successfully');
      fetchApiKeys();
    } catch (err) {
      console.error('Error deactivating API key:', err);
      setError(err.message || 'Failed to deactivate API key');
    }
  };

  const deleteApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) return;
    try {
      setError(''); setSuccess('');
      await apiKeyService.deleteApiKey(keyId);
      setSuccess('API key deleted successfully');
      fetchApiKeys();
    } catch (err) {
      console.error('Error deleting API key:', err);
      setError(err.message || 'Failed to delete API key');
    }
  };

  const handleScalyticsSettingsChange = async (newSettingsData) => {
    setScalyticsSettingsSaving(true);
    setScalyticsSettingsError('');
    setScalyticsSettingsSuccess('');

    const payload = {};
    const updatedSettings = { ...scalyticsSettings }; 

    if (newSettingsData.hasOwnProperty('enabled')) {
      payload.scalytics_api_enabled = newSettingsData.enabled.toString();
      updatedSettings.enabled = newSettingsData.enabled;
    }
    if (newSettingsData.hasOwnProperty('windowMs')) {
       const windowMinutes = newSettingsData.windowMs / 60000;
       if (isNaN(windowMinutes) || windowMinutes <= 0) {
          setScalyticsSettingsError("Rate limit window must be a positive number of minutes.");
          setScalyticsSettingsSaving(false); return;
       }
       payload.scalytics_api_rate_limit_window_ms = newSettingsData.windowMs.toString();
       updatedSettings.windowMs = newSettingsData.windowMs;
    }
     if (newSettingsData.hasOwnProperty('maxRequests')) {
       if (isNaN(newSettingsData.maxRequests) || newSettingsData.maxRequests < 0) {
          setScalyticsSettingsError("Max requests must be a non-negative number.");
          setScalyticsSettingsSaving(false); return;
       }
       payload.scalytics_api_rate_limit_max = newSettingsData.maxRequests.toString();
       updatedSettings.maxRequests = newSettingsData.maxRequests;
    }

    if (Object.keys(payload).length === 0) {
       
       setScalyticsSettingsSaving(false);
       return; 
    }


    try {
      const response = await apiService.put('/admin/settings/scalytics-api', payload);
      if (response.success) {
        setScalyticsSettings(updatedSettings); 
        setScalyticsSettingsSuccess('Scalytics API settings saved successfully!');
        setTimeout(() => setScalyticsSettingsSuccess(''), 5000);
      } else {
        throw new Error(response.message || 'Failed to save settings');
      }
    } catch (err) {
      console.error("Error saving Scalytics API settings:", err);
      setScalyticsSettingsError(`Failed to save settings: ${err.message}`);
    } finally {
      setScalyticsSettingsSaving(false);
    }
  };

  const initialLoading = loading || apiKeysLoading || scalyticsSettingsLoading;

  if (initialLoading && providers.length === 0 && apiKeys.length === 0) {
    return (
      <div className="animate-pulse p-6 space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* General Status messages */}
      <StatusMessage message={success} type="success" onDismiss={() => setSuccess('')} />
      <StatusMessage message={error} type="error" onDismiss={() => setError('')} />

      <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-700 p-4">
         <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700 dark:text-dark-text-primary">
              Looking for <strong>Global API Keys</strong>? Please visit the <a href="/admin/integrations" className="font-medium underline">Integrations</a> tab and select the "Global API Keys" sub-tab.
            </p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('providers')}
            className={`${
              activeTab === 'providers'
                ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
          >
            API Providers
          </button>
          <button
            onClick={() => setActiveTab('scalyticsApi')}
            className={`${
              activeTab === 'scalyticsApi'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
          >
            Scalytics API 
          </button>
          <button
            onClick={() => setActiveTab('apiKeys')}
            className={`${
              activeTab === 'apiKeys'
                ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
          >
            User API Keys
          </button>
        </nav>
      </div>

      <div className="mt-4">
        {activeTab === 'providers' && (
          <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 flex justify-between">
               <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">API Providers</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                  Manage external API providers for models
                </p>
              </div>
            </div>
            <ProvidersTable
              providers={providers}
              loading={loading}
              onEdit={handleOpenEditModal}
              onDelete={deleteProvider}
              onToggleActive={handleToggleActive}
              isScalyticsApiGloballyEnabled={scalyticsSettings.enabled} 
              isPrivacyModeEnabled={isPrivacyModeEnabled}
            />
            <AddProviderForm
              provider={newProvider}
              onChange={setNewProvider}
              onSubmit={addProvider}
            />
          </div>
        )}

        {activeTab === 'scalyticsApi' && (
          <ScalyticsApiConfig
            initialIsEnabled={scalyticsSettings.enabled}
            initialWindowMs={scalyticsSettings.windowMs}
            initialMaxRequests={scalyticsSettings.maxRequests}
            onSettingsChange={handleScalyticsSettingsChange}
            saving={scalyticsSettingsSaving}
            error={scalyticsSettingsError}
            success={scalyticsSettingsSuccess}
          />
        )}

        {activeTab === 'apiKeys' && (
          <ApiKeysTab
            apiKeys={apiKeys}
            loading={apiKeysLoading}
            onActivate={activateApiKey}
            onDeactivate={deactivateApiKey}
            onDelete={deleteApiKey}
          />
        )}
      </div>

      {/* Edit Provider Modal */}
      <EditProviderModal
        provider={editingProvider}
        onChange={setEditingProvider}
        onSave={saveProvider}
        onCancel={() => setEditingProvider(null)}
      />
    </div>
  );
};

export default ProvidersAdmin;
