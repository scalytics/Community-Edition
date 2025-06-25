import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import modelService from '../../services/modelService';

const ModelSelector = ({ 
  selectedModelId, 
  onModelSelect,
  onStartChat,
  disabled = false
}) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  
  useEffect(() => {
    const fetchModelsAndSettings = async () => {
      try {
        setLoading(true);
        
        const modelData = await modelService.getActiveModels();
        
        const privacyModeEnabled = (modelData?.privacyModeEnabled === true);
        
        setPrivacyModeEnabled(privacyModeEnabled);
        
        let fetchedModels = Array.isArray(modelData) ? modelData :
                          (modelData?.data && Array.isArray(modelData.data)) ? modelData.data : [];

        // Filter for models suitable for general chat:
        // - Not an embedding model (is_embedding_model is 0 or false)
        // - Not an image generation model (can_generate_images is 0 or false)
        let suitableChatModels = fetchedModels.filter(model => {
          const isEmbedding = model.is_embedding_model === 1 || model.is_embedding_model === true;
          const canGenerateImages = model.can_generate_images === 1 || model.can_generate_images === true;
          
          // Only include if it's NOT an embedding model AND NOT an image generation model
          return !isEmbedding && !canGenerateImages;
        });
        
        if (privacyModeEnabled) {
          suitableChatModels = suitableChatModels.filter(model => !model.external_provider_id);
        } else {
          suitableChatModels = suitableChatModels.map(model => {
            if (model.external_provider_id && !model.can_use) {
              return { ...model, is_disabled: true };
            }
            return model;
          });
        }
        
        setModels(suitableChatModels);
        
        if (!selectedModelId && suitableChatModels.length > 0 && onModelSelect) { // Corrected to use suitableChatModels
          onModelSelect(suitableChatModels[0].id);
        }
        
        setError('');
      } catch (err) {
        console.error('Error fetching models or settings:', err);
        setError('Failed to load models');
      } finally {
        setLoading(false);
      }
    };

    fetchModelsAndSettings();
  }, [selectedModelId, onModelSelect]);

  const handleModelChange = (e) => {
    const modelId = Number(e.target.value);
    if (onModelSelect) {
      onModelSelect(modelId);
    }
  };

  const groupedModels = models.reduce((acc, model) => {
    if (model.provider_name === 'Scalytics MCP') {
      if (!acc['scalytics']) {
        acc['scalytics'] = [];
      }
      acc['scalytics'].push(model);
    } 
    else if (model.external_provider_id) {
      if (!acc['external']) {
        acc['external'] = [];
      }
      acc['external'].push(model);
    } else {
      if (!acc['local']) {
        acc['local'] = [];
      }
      acc['local'].push(model);
    }
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="animate-pulse h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 dark:text-red-400 text-sm p-2 border border-red-200 dark:border-red-900 rounded bg-red-50 dark:bg-red-900/20">
        {error}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-yellow-700 dark:text-yellow-400 text-sm p-2 border border-yellow-200 dark:border-yellow-900 rounded bg-yellow-50 dark:bg-yellow-900/20">
        No models available. You may need to be added to a group with model access.
      </div>
    );
  }

  return (
    <div className="w-full">
      <label htmlFor="model-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Select Model
      </label>
      <div className="flex space-x-2 w-full">
        <select
          id="model-selector"
          value={selectedModelId || ''}
          onChange={handleModelChange}
          disabled={disabled}
          className={`
            w-3/5 pl-3 pr-10 py-2 text-sm border-gray-300 dark:border-gray-600
            focus:outline-none focus:ring-blue-500 focus:border-blue-500 
            rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary shadow-sm
            ${disabled ? 'bg-gray-100 dark:bg-dark-primary cursor-not-allowed' : ''}
            truncate
          `}
        >
        <option value="" disabled>Select a model</option>
        
        {groupedModels.scalytics && groupedModels.scalytics.length > 0 && (
          <>
            <optgroup label="Scalytics MCP Models">
              {groupedModels.scalytics.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          </>
        )}
        
        {/* Local models group (other specific local models, if any) */}
        {/* Filter out the generic "local" if it was somehow fetched as a named model */}
        {groupedModels.local && groupedModels.local.filter(m => m.id !== 'local').length > 0 && (
          <>
            <optgroup label="Specific Local Models">
              {groupedModels.local.filter(m => m.id !== 'local').map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          </>
        )}
        
        {/* External models group */}
        {groupedModels.external && groupedModels.external.length > 0 && (
          <>
            <optgroup label="External API Models">
              {groupedModels.external.map((model) => (
                <option 
                  key={model.id} 
                  value={model.id}
                  disabled={model.is_disabled}
                  className={model.is_disabled ? 'text-gray-400' : ''}
                >
                  {model.provider_name ? `${model.provider_name}: ` : ''}
                  {model.name} {model.is_disabled ? '(API key inactive)' : ''}
                </option>
              ))}
            </optgroup>
          </>
        )}
        </select>
        
        {onStartChat && !disabled && (
          <button
            onClick={() => onStartChat()}
            disabled={!selectedModelId}
            className={`
              w-2/5 whitespace-nowrap py-2 px-3 border border-transparent text-sm font-medium 
              rounded-md text-white bg-blue-600 hover:bg-blue-700 
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              flex items-center justify-center shadow-sm
              ${!selectedModelId ? 'opacity-70 cursor-not-allowed' : ''}
            `}
          >
            <span className="mr-1">
              <svg className="h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
              </svg>
            </span>
            Start Chat
          </button>
        )}
      </div>
      
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {disabled 
          ? "You can't change models in an existing chat" 
          : "Select the AI model you want to chat with"}
      </p>
      
      {/* Privacy mode notification for users */}
      {privacyModeEnabled && (
        <div className="mt-2 text-xs text-blue-600 dark:text-dark-text-primary bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-200 dark:border-blue-800">
          <span className="font-semibold">Privacy Mode Active:</span> Your administrator has enabled Privacy Mode. 
          Only local models are available to ensure data privacy.
        </div>
      )}
      
      {/* API Key Status - only show when privacy mode is NOT enabled AND there are disabled models */}
      {!privacyModeEnabled && models.some(model => model.external_provider_id && !model.can_use) && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
          <span className="font-semibold">Note:</span> External models that appear disabled have inactive API keys.
          <span> Your administrator has disabled one or more API keys.</span>
        </div>
      )}
      
      {/* Add a note about Scalytics MCP models not requiring API keys */}
      {groupedModels.scalytics && groupedModels.scalytics.length > 0 && (
        <div className="mt-2 text-xs text-blue-600 dark:text-dark-text-primary bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-200 dark:border-blue-800">
          <span className="font-semibold">Note:</span> Scalytics MCP models don't require an API key and are ready to use immediately.
        </div>
      )}
    </div>
  );
};

ModelSelector.propTypes = {
  selectedModelId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onModelSelect: PropTypes.func,
  onStartChat: PropTypes.func,
  disabled: PropTypes.bool
};

export default ModelSelector;
