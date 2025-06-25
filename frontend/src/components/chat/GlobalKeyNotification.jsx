import React, { useState, useEffect } from 'react';
import apiService from '../../services/apiService';

const GlobalKeyNotification = () => {
  const [overriddenKeys, setOverriddenKeys] = useState([]);
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    const checkForOverriddenKeys = async () => {
      try {
        // First get user's personal keys
        const userKeysResponse = await apiService.get('/apikeys');
        const userKeys = userKeysResponse.data || [];
        
        if (userKeys.length === 0) return; 
        
        // Then get global keys to check for overrides
        const globalKeysResponse = await apiService.get('/admin/global/api-keys'); // Corrected endpoint
        let globalKeys = [];
        // The backend route /api/admin/global/api-keys returns { success: true, data: [...] }
        // So we need to access globalKeysResponse.data.data if success is true, or just globalKeysResponse.data
        if (globalKeysResponse.success && Array.isArray(globalKeysResponse.data)) {
          globalKeys = globalKeysResponse.data;
        } else if (Array.isArray(globalKeysResponse?.data)) { // Fallback for older structures if any
           globalKeys = globalKeysResponse.data;
        } else if (globalKeysResponse.data && Array.isArray(globalKeysResponse.data.data)) { // Common pattern
            globalKeys = globalKeysResponse.data.data;
        } else {
          console.warn("Received non-array or unexpected response structure for global keys:", globalKeysResponse);
        }

        if (globalKeys.length === 0) return; 

        // Find providers where both user and global keys exist
        const overridden = [];
        
        for (const userKey of userKeys) {
          const matchingGlobalKey = globalKeys.find(
            globalKey => 
              globalKey.provider_id === userKey.provider_id && 
              globalKey.is_active
          );
          
          if (matchingGlobalKey) {
            overridden.push({
              provider: userKey.provider_name,
              userKeyId: userKey.id,
              globalKeyId: matchingGlobalKey.id
            });
          }
        }
        
        setOverriddenKeys(overridden);
        
        // Show notification if there are overridden keys
        if (overridden.length > 0) {
          const dismissedNotifications = JSON.parse(
            localStorage.getItem('dismissedGlobalKeyNotifications') || '{}'
          );
          
          // Generate a unique key based on the overridden providers
          const notificationKey = overridden
            .map(item => item.provider)
            .sort()
            .join(',');
          
          // Show notification if it hasn't been dismissed
          if (!dismissedNotifications[notificationKey]) {
            setVisible(true);
          }
        }
      } catch (error) {
        console.error('Error checking for overridden keys:', error);
      }
    };
    
    checkForOverriddenKeys();
  }, []);
  
  const handleDismiss = () => {
    const dismissedNotifications = JSON.parse(
      localStorage.getItem('dismissedGlobalKeyNotifications') || '{}'
    );
    
    // Generate notification key
    const notificationKey = overriddenKeys
      .map(item => item.provider)
      .sort()
      .join(',');
    
    // Add to dismissed notifications
    dismissedNotifications[notificationKey] = true;
    localStorage.setItem(
      'dismissedGlobalKeyNotifications',
      JSON.stringify(dismissedNotifications)
    );
    
    setVisible(false);
  };
  
  // If no overridden keys or notification dismissed, don't render anything
  if (!visible || overriddenKeys.length === 0) {
    return null;
  }
  
  return (
    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-700 flex justify-between items-center">
      <div className="flex items-start">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {overriddenKeys.length === 1 
              ? `Using global API key for ${overriddenKeys[0].provider}`
              : `Using global API keys for ${overriddenKeys.length} providers`
            }
          </h3>
          <div className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            <p>
              {overriddenKeys.length === 1
                ? `Your personal API key for ${overriddenKeys[0].provider} is being overridden by a global key set by an administrator.`
                : `Your personal API keys for ${overriddenKeys.map(k => k.provider).join(', ')} are being overridden by global keys set by an administrator.`
              }
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="ml-3 flex-shrink-0 p-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 focus:outline-none"
        onClick={handleDismiss}
      >
        <span className="sr-only">Dismiss</span>
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

export default GlobalKeyNotification;
