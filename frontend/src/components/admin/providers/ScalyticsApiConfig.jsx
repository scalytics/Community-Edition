import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types'; 

const ScalyticsApiConfig = ({ 
  initialIsEnabled, 
  initialWindowMs, 
  initialMaxRequests, 
  onSettingsChange, 
  saving, 
  error, 
  success 
}) => {
  const [rateLimitSettings, setRateLimitSettings] = useState({
    windowMs: initialWindowMs || 900000,
    maxRequests: initialMaxRequests || 100,
  });
  const isEnabled = initialIsEnabled; 

  useEffect(() => {
    setRateLimitSettings({
      windowMs: initialWindowMs || 900000,
      maxRequests: initialMaxRequests || 100,
    });
  }, [initialWindowMs, initialMaxRequests]);


  const handleRateLimitInputChange = (e) => {
    const { name, value } = e.target;
    setRateLimitSettings(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleChange = (e) => {
    const newEnabledState = e.target.checked;
    onSettingsChange({ 
      enabled: newEnabledState 
    });
  };

  const handleSaveRateLimits = (e) => { 
    e.preventDefault();

    const windowMinutes = rateLimitSettings.windowMs / 60000;
    if (isNaN(windowMinutes) || windowMinutes <= 0) {
        console.warn("Rate limit window must be a positive number of minutes.");
        return; 
    }
     if (isNaN(rateLimitSettings.maxRequests) || rateLimitSettings.maxRequests < 0) {
        console.warn("Max requests must be a non-negative number.");
        return;
    }
    
    onSettingsChange({
      windowMs: rateLimitSettings.windowMs,
      maxRequests: rateLimitSettings.maxRequests
    });
  };

  return (
    <div className="bg-white dark:bg-dark-primary shadow-sm rounded-lg p-4 sm:p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Scalytics API Configuration</h2>
        <a 
          href="/api-docs" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm text-blue-600 dark:text-dark-link hover:underline"
        >
          View API Docs (Swagger UI)
        </a>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">{error}</div>}
      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">{success}</div>}

      <div className="space-y-6"> 
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md border dark:border-gray-600">
          <div>
            <label htmlFor="enabled" className="block text-sm font-medium text-gray-900 dark:text-dark-text-secondary">
              Enable Scalytics API Access
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Globally enables or disables the `/v1/chat/completions` endpoint for all users with generated keys.
            </p>
          </div>
          <label htmlFor="enabled" className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              className="sr-only peer"
              checked={isEnabled} 
              onChange={handleToggleChange} 
              disabled={saving} 
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <fieldset className="border dark:border-gray-600 p-4 rounded-md">
          <legend className="text-md font-medium text-gray-800 dark:text-gray-200 px-2">Rate Limiting</legend>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 px-2">
            Configure limits per user API key. Applied after authentication.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="windowMs" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Time Window (Minutes)
              </label>
              <input
                type="number"
                id="windowMs"
                name="windowMs"
                value={rateLimitSettings.windowMs / 60000} 
                onChange={(e) => handleRateLimitInputChange({ target: { name: 'windowMs', value: parseInt(e.target.value, 10) * 60000 } })}
                min="1"
                step="1"
                className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving} 
              />
            </div>
            <div>
              <label htmlFor="maxRequests" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Requests per Window
              </label>
              <input
                type="number"
                id="maxRequests"
                name="maxRequests"
                value={rateLimitSettings.maxRequests} 
                onChange={handleRateLimitInputChange}
                min="0"
                step="1"
                className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving} 
              />
            </div>
          </div> {/* End of grid div */}
           <div className="pt-4 flex justify-end">
             <button
               type="button" 
               onClick={handleSaveRateLimits} 
               className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50"
               disabled={saving} 
             >
               {saving ? 'Saving...' : 'Save Rate Limit Settings'} 
             </button>
           </div>
        </fieldset>

      </div> 
    </div>
  );
};

ScalyticsApiConfig.propTypes = {
  initialIsEnabled: PropTypes.bool.isRequired,
  initialWindowMs: PropTypes.number.isRequired,
  initialMaxRequests: PropTypes.number.isRequired,
  onSettingsChange: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  error: PropTypes.string,
  success: PropTypes.string,
};


export default ScalyticsApiConfig;
