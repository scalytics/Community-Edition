import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import modelService from '../../services/modelService'; 
import authService from '../../services/authService.js'; 

const TransparencySettings = ({ userSettings, isScalaPromptEnforced, onSettingsChange, onError }) => { 
  const [isEnabled, setIsEnabled] = useState(userSettings?.summarization_enabled || false);
  const [selectedModelId, setSelectedModelId] = useState(userSettings?.summarization_model_id || ''); 
  const [temperaturePreset, setTemperaturePreset] = useState(userSettings?.summarization_temperature_preset || 'strict');
  const [displayNotice, setDisplayNotice] = useState(userSettings?.display_summarization_notice === undefined ? true : Boolean(userSettings.display_summarization_notice)); 
  const [customPrompt, setCustomPrompt] = useState(userSettings?.custom_system_prompt || ''); 
  const [localModels, setLocalModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch available local models for the dropdown
  useEffect(() => {
    const fetchLocalModels = async () => {
      setIsLoadingModels(true);
      try {
        const allModels = await modelService.getModels();
        const modelsArray = allModels?.data?.data || allModels?.data || allModels || [];
        if (!Array.isArray(modelsArray)) {
            console.error("Received non-array response for models:", modelsArray);
            throw new Error("Invalid format for models list");
        }
        const local = modelsArray.filter(m => !m.external_provider_id && m.is_active);
        setLocalModels(local);
      } catch (error) {
        console.error("Error fetching local models:", error);
        onError("Failed to load available local models for summarization.");
        setLocalModels([]); // Clear models on error
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchLocalModels();
  }, [onError]);

  // Update local state if userSettings prop changes (e.g., after saving)
  useEffect(() => {
    setIsEnabled(userSettings?.summarization_enabled || false);
    setSelectedModelId(userSettings?.summarization_model_id || '');
    setTemperaturePreset(userSettings?.summarization_temperature_preset || 'strict');
    setDisplayNotice(userSettings?.display_summarization_notice === undefined ? true : Boolean(userSettings.display_summarization_notice));
    setCustomPrompt(userSettings?.custom_system_prompt || ''); 
  }, [userSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    onError('');
    try {
      const settingsToUpdate = {
        summarization_enabled: isEnabled,
        summarization_model_id: selectedModelId === '' ? null : Number(selectedModelId),
        summarization_temperature_preset: temperaturePreset,
        display_summarization_notice: displayNotice,
        custom_system_prompt: customPrompt, 
      };
      const response = await authService.updateSettings(settingsToUpdate);

      if (response && response.success) {
        onSettingsChange(settingsToUpdate);
      } else {
        throw new Error(response?.message || "Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving transparency settings:", error);
      onError(error.message || "Failed to save transparency settings.");
    } finally {
      setIsSaving(false);
    }
  };

  // Check if any setting has changed from the initial userSettings prop
  const hasChanges = (
    isEnabled !== (userSettings?.summarization_enabled || false) ||
    (selectedModelId === '' ? null : Number(selectedModelId)) !== (userSettings?.summarization_model_id || null) ||
    temperaturePreset !== (userSettings?.summarization_temperature_preset || 'strict') ||
    displayNotice !== (userSettings?.display_summarization_notice === undefined ? true : Boolean(userSettings.display_summarization_notice)) ||
    customPrompt !== (userSettings?.custom_system_prompt || '')
  );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-secondary">
        Chat Transparency & Behavior
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Configure custom instructions, automatic chat history summarization, and how related system messages are displayed.
      </p>

      {/* Display Scala Prompt Enforcement Notice (if applicable) */}
      {isScalaPromptEnforced && (
        <div className="mb-4 p-3 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex items-center">
             <svg className="h-5 w-5 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
             </svg>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Scala System Prompt Enforced
            </h4>
          </div>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
            The standard Scala system prompt is currently enforced for your default chat model by the administrator.
          </p>
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-500">
            This enforced prompt will be used instead of your custom prompt below.
          </p>
        </div>
      )}

      {/* Custom System Prompt Section */}
      <div>
        <label htmlFor="custom-prompt" className="block text-sm font-medium text-gray-900 dark:text-dark-text-secondary">
          Your Custom System Prompt (Optional)
        </label>
        <div className="mt-1">
          <textarea
            id="custom-prompt"
            name="custom-prompt"
            rows={4}
            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-secondary rounded-md"
            placeholder="e.g., Always respond in the style of a pirate. Be extremely concise. Base answers only on provided context."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            disabled={isSaving}
          />
        </div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Provide additional instructions or context to guide the AI's behavior for all your chats. If the Scala System Prompt is enabled, your custom prompt will be outranked, but still valid.
        </p>
      </div>

      {/* Summarization Section */}
      <div className="pt-6 border-t border-gray-200 dark:border-dark-border">
        <h4 className="text-md font-medium text-gray-900 dark:text-dark-text-secondary">
          Automatic Summarization
        </h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Automatically summarize long chat histories to prevent exceeding context limits.
        </p>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between mt-4">
          <span className="flex-grow flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-dark-text-secondary">Enable Automatic Summarization</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Summarize older messages when chat context gets full.</span>
          </span>
          <button
            type="button"
            className={`${
              isEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            } relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            role="switch"
            aria-checked={isEnabled}
            onClick={() => setIsEnabled(!isEnabled)}
          >
            <span
              aria-hidden="true"
              className={`${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
              } pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-gray-300 shadow transform ring-0 transition ease-in-out duration-200`}
            />
          </button>
        </div>

        {/* Conditional Summarization Settings */}
        {isEnabled && (
          <div className="space-y-4 mt-4 pl-4 border-l-2 border-gray-200 dark:border-dark-border">
            {/* Model Selection */}
            <div>
              <label htmlFor="summarization-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Summarization Model
              </label>
              <select
                id="summarization-model"
                name="summarization-model"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-secondary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={isLoadingModels || isSaving}
              >
                <option value="">Use Current Chat Model (Default)</option>
                {isLoadingModels ? (
                  <option disabled>Loading local models...</option>
                ) : (
                  localModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select a local model to perform summarization. If none is selected or the selected model is unavailable, the model used in the current chat will be used.</p>
            </div>

            {/* Temperature Preset */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Summarization Style (Temperature)
              </label>
              <fieldset className="mt-1">
                <legend className="sr-only">Summarization Style</legend>
                <div className="space-y-2">
                  {[
                    { value: 'strict', label: 'Strict (0.1)', description: 'Most factual, concise. May lose nuance.' },
                    { value: 'balanced', label: 'Balanced (0.4)', description: 'Good balance of factuality and coherence. (Recommended)' },
                    { value: 'detailed', label: 'Detailed (0.7)', description: 'More verbose, better context retention, slightly higher token use.' },
                  ].map((option) => (
                    <div key={option.value} className="flex items-center">
                      <input
                        id={`temp-${option.value}`}
                        name="temperature-preset"
                        type="radio"
                        value={option.value}
                        checked={temperaturePreset === option.value}
                        onChange={(e) => setTemperaturePreset(e.target.value)}
                        disabled={isSaving}
                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:checked:bg-blue-500"
                      />
                      <label htmlFor={`temp-${option.value}`} className="ml-3 block text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{option.label}</span>
                        <span className="text-gray-500 dark:text-gray-400"> - {option.description}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>

            {/* Display Notice Setting */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Summarization Notice
              </label>
              <fieldset className="mt-1">
                <legend className="sr-only">Display Summarization Notice</legend>
                <div className="space-y-2 sm:flex sm:items-center sm:space-y-0 sm:space-x-10">
                  {[
                    { value: true, label: 'Always', description: 'Show the "Summary of earlier conversation..." system message.' },
                    { value: false, label: 'Never', description: 'Hide the system message (summarization still occurs if enabled).' },
                  ].map((option) => (
                    <div key={String(option.value)} className="flex items-center">
                      <input
                        id={`display-${option.value}`}
                        name="display-notice"
                        type="radio"
                        checked={displayNotice === option.value}
                        onChange={() => setDisplayNotice(option.value)}
                        disabled={isSaving}
                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:checked:bg-blue-500"
                      />
                      <label htmlFor={`display-${option.value}`} className="ml-3 block text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{option.label}</span>
                        <span className="text-gray-500 dark:text-gray-400 hidden sm:inline"> - {option.description}</span>
                      </label>
                    </div>
                  ))}
                </div>
                 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:hidden">Always: Show system message. Never: Hide system message.</p>
              </fieldset>
            </div>

          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-6 border-t border-gray-200 dark:border-dark-border flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving || isLoadingModels}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Transparency Settings'}
        </button>
      </div>
    </div>
  );
};

TransparencySettings.propTypes = {
  userSettings: PropTypes.object,
  isScalaPromptEnforced: PropTypes.bool, 
  onSettingsChange: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
};

export default TransparencySettings;
