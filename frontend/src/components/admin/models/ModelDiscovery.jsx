import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ModelFileSelector from './ModelFileSelector';
import adminService from '../../../services/adminService';
import socketService from '../../../services/socketService';

const ModelDiscovery = ({
  providers,
  providersAvailable,
  loading,
  resetInProgress,
  discoveryInProgress,
  localModelOptions,
  handleResetModels,
  handleDiscoverModels,
  handleLocalOptionChange
}) => {
  const [showModelFileSelector, setShowModelFileSelector] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(null);

  const handleDiscoverClick = (providerId, modelId = null) => {
    if (providerId === 'huggingface' && modelId) {
      setSelectedModelId(modelId);
      setShowModelFileSelector(true);
    } else {
      handleDiscoverModels(providerId);
    }
  };

  const handleFileSelect = async (file) => {
    const currentModelId = selectedModelId;
    setShowModelFileSelector(false);
    setSelectedModelId(null);

    if (!currentModelId) {
      console.error('[ModelDiscovery] Cannot download, modelId was null.');
      return;
    }

    try {
      const response = await adminService.downloadHuggingFaceModel(currentModelId, {
        file: file.name,
        downloadId: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      });

      const downloadId = response?.data?.downloadId;

      if (downloadId) {
        socketService.subscribeToDownload(downloadId);
      } else {
        console.error('[ModelDiscovery] Failed to get downloadId from download initiation response:', response);
      }
    } catch (error) {
      console.error('[ModelDiscovery] Error initiating download:', error);
    }
  };

  const handleFileSelectCancel = () => {
    setShowModelFileSelector(false);
    setSelectedModelId(null);
  };

  return (
    <div className="space-y-6">
      {showModelFileSelector && selectedModelId && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-dark-primary bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center z-50">
          <div className="max-w-4xl w-full p-4">
            <ModelFileSelector
              modelId={selectedModelId}
              onFileSelect={handleFileSelect}
              onCancel={handleFileSelectCancel}
            />
          </div>
        </div>
      )}

      {/* Global actions */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Global Model Actions</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            These actions affect all models across the system.
          </p>
          <div className="mt-4 space-y-4">
                          <button
                            type="button"
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-full shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            onClick={() => handleDiscoverClick('huggingface', 'microsoft/phi-2')}
                            disabled={discoveryInProgress}
                          >
              {resetInProgress ? 'Resetting...' : 'Reset All Models to Defaults'}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This will reset all models to their default state, deactivating any non-default models.
            </p>
          </div>
        </div>
      </div>

      {/* Providers for model discovery */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">API Providers</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Discover and manage models from external API providers.
          </p>
        </div>

        <div className="border-t border-gray-200 dark:border-dark-border">
          {loading ? (
            <div className="animate-pulse px-4 py-5 sm:p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div>
              ))}
            </div>
          ) : !providersAvailable ? (
             <div className="px-4 py-5 sm:p-6">
               <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
                 <div className="flex">
                   <div className="flex-shrink-0">
                     <svg className="h-5 w-5 text-blue-400 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                       <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                     </svg>
                   </div>
                   <div className="ml-3">
                     <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Provider APIs Ready</h3>
                     <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                       <p>
                         Provider APIs are now available. You can discover models from different providers,
                         including Local models, Hugging Face Hub, and more. Select a provider from the list below.
                       </p>
                     </div>
                   </div>
                 </div>
               </div>
               {/* Show Local discovery option */}
               <div className="mt-6">
                 <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <div>
                       <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Local Models</h3>
                       <p className="text-sm text-gray-500 dark:text-gray-400">Discover models from the local filesystem</p>
                     </div>
                     <div>
                       <button
                         type="button"
                         onClick={() => handleDiscoverModels('local')}
                         disabled={discoveryInProgress}
                         className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                       >
                         {discoveryInProgress ? 'Discovering...' : 'Discover Local Models'}
                       </button>
                     </div>
                   </div>
                   {/* Local model options */}
                   <div className="mt-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                     <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-2">Local Model Options</h4>
                     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                       <div>
                         <label htmlFor="basePath" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                           Base Directory
                         </label>
                         <input
                           type="text"
                           name="basePath"
                           id="basePath"
                           value={localModelOptions.basePath}
                           onChange={handleLocalOptionChange}
                           placeholder="Leave empty for default"
                           className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                         />
                         <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                           Path to models directory. Leave empty to use the default.
                         </p>
                       </div>
                       <div className="flex items-center h-12 mt-8">
                         <input
                           id="recursive"
                           name="recursive"
                           type="checkbox"
                           checked={localModelOptions.recursive}
                           onChange={handleLocalOptionChange}
                           className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                         />
                         <label htmlFor="recursive" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                           Search recursively in subdirectories
                         </label>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
          ) : providers.length === 0 ? (
            <div className="px-4 py-5 sm:p-6 text-center text-gray-500 dark:text-gray-400">
              No API providers configured
            </div>
          ) : (
            <ul className="space-y-3 p-4"> {/* Removed divide-y, added spacing and padding */}
              {providers
                .filter(provider => provider.category !== 'Search' && provider.name?.toLowerCase() !== 'courtlistener') // Filter out search providers and CourtListener by name
                .map((provider) => (
                  <li key={provider.id} className="px-4 py-5 sm:p-6 hover:bg-gray-50 dark:hover:bg-dark-secondary border border-gray-200 dark:border-dark-border rounded-md shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{provider.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{provider.description}</p>
                      </div>
                      <div className="flex space-x-2">
                        {/* Only show buttons relevant to discovery */}
                        {provider.name === 'Hugging Face' ? (
                          <div className="flex space-x-2">
                             <button
                              type="button"
                              onClick={() => handleDiscoverClick('huggingface', 'TheBloke/phi-2-GGUF')} 
                              disabled={discoveryInProgress}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                            >
                              {discoveryInProgress ? 'Browsing...' : 'Browse Model Files'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscoverModels(provider.id)}
                              disabled={discoveryInProgress}
                              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                            >
                              Discover All
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDiscoverModels(provider.id)}
                            disabled={discoveryInProgress}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                          >
                            {discoveryInProgress ? 'Discovering...' : 'Discover Models'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              {/* Add Local provider if it doesn't exist in the DB providers list */}
              {!providers.some(p => p.name === 'Local') && (
                <li className="px-4 py-5 sm:p-6 hover:bg-gray-50 dark:hover:bg-dark-secondary border border-gray-200 dark:border-dark-border rounded-md shadow-sm">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Local Models</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Discover models from the local filesystem</p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => handleDiscoverModels('local')}
                          disabled={discoveryInProgress}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                        >
                          {discoveryInProgress ? 'Discovering...' : 'Discover Local Models'}
                        </button>
                      </div>
                    </div>
                    {/* Local model options */}
                    <div className="mt-4 bg-gray-50 dark:bg-dark-secondary p-4 rounded-md"> {/* Changed dark:bg-gray-700 to dark:bg-dark-secondary for consistency */}
                      <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-2">Local Model Options</h4>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="basePath" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Base Directory
                          </label>
                          <input
                            type="text"
                            name="basePath"
                            id="basePath"
                            value={localModelOptions.basePath}
                            onChange={handleLocalOptionChange}
                            placeholder="Leave empty for default"
                            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Path to models directory. Leave empty to use the default.
                          </p>
                        </div>
                        <div className="flex items-center h-12 mt-8">
                          <input
                            id="recursive"
                            name="recursive"
                            type="checkbox"
                            checked={localModelOptions.recursive}
                            onChange={handleLocalOptionChange}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                          />
                          <label htmlFor="recursive" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Search recursively in subdirectories
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

ModelDiscovery.propTypes = {
  providers: PropTypes.array.isRequired,
  providersAvailable: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  resetInProgress: PropTypes.bool.isRequired,
  discoveryInProgress: PropTypes.bool.isRequired,
  localModelOptions: PropTypes.object.isRequired,
  handleResetModels: PropTypes.func.isRequired,
  handleDiscoverModels: PropTypes.func.isRequired,
  handleLocalOptionChange: PropTypes.func.isRequired
};

export default ModelDiscovery;
