import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import PropTypes from 'prop-types';
import ModelDropdown from '../common/ModelDropdown';
import modelService from '../../services/modelService';
import apiService from '../../services/apiService';

const ToolConfigModal = ({ isOpen, onClose, tool }) => {
  const [configValues, setConfigValues] = useState({});
  const [availableModels, setAvailableModels] = useState([]);
  const [servicesWithUserKeys, setServicesWithUserKeys] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleConfigChange = (key, value) => {
    if ((tool?.name === 'live-search' && key === 'reasoningModelName' && error) ||
        (tool?.name === 'image_gen' && key === 'selected_model_id' && error)) {
      setError('');
    }
    setConfigValues(prev => ({ ...prev, [key]: value }));
  };

  const fetchToolData = useCallback(async () => {
    if (!tool) return;
    setLoading(true);
    setError('');
    setIsSaving(false);
    setConfigValues({});
    setAvailableModels([]);
    setServicesWithUserKeys([]);

    try {
      let modelsForDropdown = [];
      const [servicesResponse, userAccessibleAndActiveModelsResponse] = await Promise.all([
        apiService.get('/apikeys/services-with-keys'),
        modelService.getActiveModels()
      ]);

      if (servicesResponse.success && Array.isArray(servicesResponse.data)) {
        setServicesWithUserKeys(servicesResponse.data);
      } else {
        console.warn('[ToolConfigModal] Could not fetch services with keys or data format incorrect.');
      }
      
      const privacyModeEnabled = false;

      let baseModels = Array.isArray(userAccessibleAndActiveModelsResponse) ? userAccessibleAndActiveModelsResponse :
                      (userAccessibleAndActiveModelsResponse?.data && Array.isArray(userAccessibleAndActiveModelsResponse.data)) ? userAccessibleAndActiveModelsResponse.data : [];
      
      
      baseModels.forEach(m => {
      });


      if (tool.name === 'image_gen') {
        let imageCapableModels = baseModels.filter(
          model => model.can_generate_images === true || model.can_generate_images === 1
        );

        
        modelsForDropdown = imageCapableModels.filter(model => {
          if (model.external_model_id) { 
            return String(model.external_model_id).toLowerCase().includes('image');
          }
          return true; 
        }).map(m => ({ ...m, id: String(m.id) }));
        
        if (modelsForDropdown.length === 0 && imageCapableModels.length > 0) {
            console.warn("[ToolConfigModal] No image models available for 'image_gen' after name filtering. Check external model naming conventions or if only local image models are available/accessible.");
        }

      } else if (tool.name === 'live-search') { 
        let generalPurposeLLMs = baseModels.filter(
          model => !(model.can_generate_images === true || model.can_generate_images === 1) &&
                   !(model.is_embedding_model === true || model.is_embedding_model === 1)
        );

        if (privacyModeEnabled) {
          modelsForDropdown = generalPurposeLLMs.filter(m => !m.external_provider_id).map(m => ({ ...m, id: String(m.id) }));
        } else {
          modelsForDropdown = generalPurposeLLMs.map(m => ({
            ...m,
            id: String(m.id),
            is_disabled: !!(m.external_provider_id && m.can_use === false) 
          }));
        }
      }
      setAvailableModels(modelsForDropdown);

      const configEndpoint = tool.name === 'image_gen' 
          ? '/mcp/tools/image_gen/config'
          : `/users/me/tool-configs/${tool.name}`;

      const configResponse = await apiService.get(configEndpoint);
      let initialConfig = {};
      if (configResponse.success && configResponse.data) {
        initialConfig = configResponse.data || {};
        if (tool.name === 'image_gen' && initialConfig.selected_model_id) {
          initialConfig.selected_model_id = String(initialConfig.selected_model_id);
        }
      } else {
        const defaults = {};
        if (tool.arguments_schema?.properties) {
          Object.entries(tool.arguments_schema.properties).forEach(([key, prop]) => {
            if (prop.default !== undefined) defaults[key] = prop.default;
          });
        }
        initialConfig = defaults;
      }
      
      if (tool.name === 'live-search' && initialConfig.reasoningModelName && modelsForDropdown.length > 0) {
        const modelExists = modelsForDropdown.some(
          m => m.id.toString() === initialConfig.reasoningModelName.toString() && !m.is_disabled
        );
        if (!modelExists) initialConfig.reasoningModelName = '';
      }
      setConfigValues(initialConfig);

    } catch (err) {
      console.error(`[ToolConfigModal] Error fetching initial data for ${tool.name}:`, err);
      setError(`Failed to load data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [tool]);

  useEffect(() => {
    if (isOpen && tool) {
      fetchToolData();
    } else if (!isOpen) {
      setLoading(false);
      setError('');
      setIsSaving(false);
      setAvailableModels([]);
      setConfigValues({});
    }
  }, [isOpen, tool, fetchToolData]);

  const handleSave = async () => {
    if (!tool || !tool.name || isSaving) return;
    const configToSave = { ...configValues };
    let validationError = '';

    if (tool.name === 'image_gen' && (!configToSave.selected_model_id || String(configToSave.selected_model_id).trim() === '')) {
      validationError = 'Please select a model for Image Generation.';
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(''); 

    try {
      const saveEndpoint = tool.name === 'image_gen' 
          ? '/mcp/tools/image_gen/config' 
          : '/users/me/tool-configs';
      
      const payload = tool.name === 'image_gen' 
          ? configToSave 
          : { toolName: tool.name, config: configToSave };

      const response = await apiService.post(saveEndpoint, payload);

      if (response.success) {
        onClose();
      } else {
        setError(response.message || 'Failed to save configuration.');
      }
    } catch (err) {
      console.error(`[ToolConfigModal] Error saving config for ${tool.name}:`, err);
      setError(`Error saving configuration: ${err.message || 'Network error'}`);
    } finally {
      setIsSaving(false);
    }
  };

   if (!isOpen || !tool) {
     return null;
   }

   const renderConfigFields = () => {
     if (!tool?.arguments_schema?.properties) {
       return <p className="text-sm text-gray-500 dark:text-gray-400">No user-configurable arguments for this tool.</p>;
     }
     const configurableFields = Object.entries(tool.arguments_schema.properties)
       .filter(([key]) => key !== 'query' && key !== 'fileIds');

     if (configurableFields.length === 0 && tool.name !== 'image_gen') {
        return <p className="text-sm text-gray-500 dark:text-gray-400">No user-configurable arguments for this tool.</p>;
     }
     
     if (tool.name === 'image_gen') {
        const imageGenProp = tool.arguments_schema?.properties?.selected_model_id || { 
            description: "Image Generation Model", 
            tooltip: "Select the model to use for generating images." 
        };
        return (
            <ModelDropdown
                key="selected_model_id_for_image_gen"
                label={imageGenProp.description}
                selectedModelId={configValues.selected_model_id || ''}
                onModelChange={(value) => handleConfigChange('selected_model_id', value)}
                availableModels={availableModels} 
                disabled={loading}
                tooltip={imageGenProp.tooltip}
            />
        );
     }

     return configurableFields.map(([key, prop]) => {
       if (key === 'max_results' && tool.name === 'live-search') {
         const min = prop.minimum || 1; 
         const max = prop.maximum || 10; 
         const currentVal = configValues[key] !== undefined ? configValues[key] : prop.default;
         const handleResultsChange = (e) => {
            let val = parseInt(e.target.value, 10);
            val = isNaN(val) ? prop.default : Math.max(min, Math.min(max, val));
            handleConfigChange(key, val);
         };
         return (
            <div key={key} className="mt-2 p-2 border dark:border-gray-600 rounded">
                <label htmlFor={`config-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{prop.description || "Max Results"}</label>
                <input id={`config-${key}`} type="number" min={min} max={max} value={currentVal} onChange={handleResultsChange}
                     className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" disabled={loading} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum search results to process (Min: {min}, Max: {max}).</p>
            </div>
         );
       }

       if (key === 'search_providers' && tool.name === 'live-search') {
         const currentProviders = Array.isArray(configValues[key]) ? configValues[key] : (prop.default || []);
         const schemaProviders = prop.items?.enum || [];
         const providerSchemaToServiceName = {
            'google': 'Google Search', 'bing': 'Bing Search', 'brave': 'Brave Search', 'courtlistener': 'CourtListener'
         };
         const renderableProviders = schemaProviders.filter(schemaKey => 
            schemaKey === 'openalex' || schemaKey === 'wikipedia' || schemaKey === 'duckduckgo' || 
            (providerSchemaToServiceName[schemaKey] && servicesWithUserKeys.includes(providerSchemaToServiceName[schemaKey]))
         );
         const getProviderDisplayName = (pk) => {
          if (pk === 'openalex') return 'OpenAlex';
          if (pk === 'google') return 'Google Search';
          if (pk === 'courtlistener') return 'CourtListener';
          return pk.charAt(0).toUpperCase() + pk.slice(1);
        };

         return (
           <div key={key} className="mt-2 p-2 border dark:border-gray-600 rounded">
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{prop.description || "Search Providers"}</label>
             <div className="mt-1 space-y-2">
               {renderableProviders.length > 0 ? renderableProviders.map(pKey => (
                 <label key={pKey} className="flex items-center space-x-2">
                   <input type="checkbox" checked={currentProviders.includes(pKey)}
                     onChange={(e) => handleConfigChange(key, e.target.checked ? [...currentProviders, pKey] : currentProviders.filter(p => p !== pKey))}
                     className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-500 dark:bg-gray-700" disabled={loading} />
                   <span className="text-sm text-gray-700 dark:text-gray-300">{getProviderDisplayName(pKey)}</span>
                 </label>
               )) : <p className="text-xs text-gray-500 dark:text-gray-400">No API keys for web search. Live Search uses DuckDuckGo.</p>}
             </div>
           </div>
         );
       }

       if (key === 'max_iterations' && tool.name === 'live-search') {
         const min = prop.minimum || 1; const max = prop.maximum || 30; 
         const currentVal = configValues[key] !== undefined ? configValues[key] : prop.default;
         const handleIterChange = (e) => {
            let val = parseInt(e.target.value, 10);
            val = isNaN(val) ? prop.default : Math.max(min, Math.min(max, val));
            handleConfigChange(key, val);
         };
         return (
            <div key={key} className="mt-2 p-2 border dark:border-gray-600 rounded">
                <label htmlFor={`config-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{prop.description || "Max Iterations"}</label>
                <input id={`config-${key}`} type="number" min={min} max={max} value={currentVal} onChange={handleIterChange}
                     className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" disabled={loading} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Max search/reasoning cycles (Min: {min}, Max: {max}).</p>
            </div>
         );
       }
       if (tool.name !== 'live-search' && tool.name !== 'image_gen') {
         return (
           <div key={key} className="mt-2 p-2 border dark:border-gray-600 rounded">
             <label htmlFor={`config-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{prop.description || key} (Type: {prop.type})</label>
             <input id={`config-${key}`} type="text" value={configValues[key] === undefined ? (prop.default !== undefined ? prop.default : '') : configValues[key]}
                onChange={(e) => handleConfigChange(key, e.target.value)} placeholder={`Enter value for ${key}`}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
             {prop.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{prop.description}</p>}
           </div>
         );
       }
       return null; 
     });
   };

   return (
      <Dialog as="div" className="relative z-50" onClose={onClose}>
          <div className="fixed inset-0 bg-black bg-opacity-25 dark:bg-opacity-50" />
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-dark-primary p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-secondary">
                  Configure {tool?.name === 'live-search' ? 'Scalytics Live Search' : (tool?.name === 'image_gen' ? 'Image Generation' : tool?.name?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Tool')}
                 </Dialog.Title>
                   {loading && <div className="mt-4 text-center text-gray-700 dark:text-gray-300">Loading configuration...</div>}
                   {error && <div className="mt-4 text-red-500 dark:text-red-400 text-sm">{error}</div>}
                   {!loading && !error && tool && <div className="mt-4 space-y-4">{renderConfigFields()}</div>}
                <div className="mt-6 flex justify-end space-x-3">
                  <button type="button" className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none" onClick={onClose}>Cancel</button>
                  <button type="button" className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 dark:bg-blue-800 px-4 py-2 text-sm font-medium text-blue-900 dark:text-dark-text-primary hover:bg-blue-200 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50" onClick={handleSave} disabled={loading || isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </Dialog.Panel>
          </div>
        </div>
      </Dialog>
  );
};

ToolConfigModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  tool: PropTypes.object, 
};

export default ToolConfigModal;
