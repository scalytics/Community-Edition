import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
  setPrimaryModel,
  getPrimaryModelStatus,
  unsetPrimaryModel 
} from '../../../services/persistentModelService';
import { formatBytes } from '../../../utils/dateUtils';

/**
 * Component for managing the primary model (which stays loaded in memory)
 * 
 * @param {Object} props - Component props
 * @param {Object} props.model - The current model data (when displayed in a model view)
 * @param {Function} props.onStatusChange - Callback when primary model status changes
 */
const PrimaryModelCard = ({ model, onStatusChange }) => {
  const [loading, setLoading] = useState(true);
  const [primaryModelData, setPrimaryModelData] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [intervalId, setIntervalId] = useState(null);
  const [error, setError] = useState(null);
  const [isSettingPrimary, setIsSettingPrimary] = useState(false);
  const [isUnsettingPrimary, setIsUnsettingPrimary] = useState(false);

  // Load current primary model status 
  const loadPrimaryModelStatus = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    }
    
    try {
      const result = await getPrimaryModelStatus();
      setPrimaryModelData(result.data);
      setError(null);
      
      // If callback provided, call it with the updated status
      if (onStatusChange) {
        onStatusChange(result.data);
      }
    } catch (err) {
      console.error('Error loading primary model status:', err);
      setError('Failed to load primary model status');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [onStatusChange]);
  
  const isMounted = React.useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    
    loadPrimaryModelStatus();
    
    const interval = setInterval(() => {
      if (isMounted.current) {
        loadPrimaryModelStatus(false);
      }
    }, 10000); // Poll every 10 seconds
    
    setIntervalId(interval);
    
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [loadPrimaryModelStatus]);
  
  const handleSetPrimary = async () => {
    if (!model || !model.id) return;
    
    setIsSettingPrimary(true);
    setError(null);
    
    try {
      await setPrimaryModel(model.id);
      await loadPrimaryModelStatus();
    } catch (err) {
      console.error('Error setting primary model:', err);
      setError(`Failed to set model as primary: ${err.message}`);
    } finally {
      setIsSettingPrimary(false);
    }
  };
  
  const handleUnsetPrimary = async () => {
    setIsUnsettingPrimary(true);
    setError(null);
    
    try {
      await unsetPrimaryModel();
      await loadPrimaryModelStatus();
    } catch (err) {
      console.error('Error unsetting primary model:', err);
      setError(`Failed to unset primary model: ${err.message}`);
    } finally {
      setIsUnsettingPrimary(false);
    }
  };
  
  // Format uptime from milliseconds
  const formatUptime = (ms) => {
    if (!ms) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };
  
  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'loading':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };
  
  // Common header component to ensure consistent display
  const PrimaryModelHeader = () => (
    <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-gray-700">
      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
        Primary Model Status
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Keeps model loaded in memory for faster responses & better streaming
      </p>
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden mb-4">
        <PrimaryModelHeader />
        <div className="px-4 py-5 sm:px-6 flex justify-center">
          <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </div>
    );
  }
  
  // No primary model set
  if (!primaryModelData?.has_primary_model) {
    return (
      <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden mb-4">
        <PrimaryModelHeader />
        <div className="px-4 py-5 sm:px-6">
          {error && (
            <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 dark:bg-red-200 dark:text-red-800 rounded-lg">
              {error}
            </div>
          )}
          
          {/* Determine if this is a sample model */}
          {(() => {
            // Stable check for sample model - evaluated just once (Path check removed)
            const isSampleModel = model && model.id && 
              (String(model.name).toLowerCase().includes('sample')); 
               // String(model.model_path).includes('sample_model')); // Removed path check
            
            return (
              <>
                {/* Only show the Set as Primary button for non-sample models */}
                {!isSampleModel && model && model.id && (
                  <div className="flex justify-end">
                    <button 
                      type="button"
                      onClick={handleSetPrimary}
                      disabled={isSettingPrimary}
                      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50"
                    >
                      {isSettingPrimary ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Setting as Primary...
                        </>
                      ) : "Set as Primary Model"}
                    </button>
                  </div>
                )}
                
                {/* Show explanation message for sample models */}
                {isSampleModel && (
                  <div className="mt-2 text-sm text-blue-700">
                    <p>Sample models cannot be set as primary. Please use a real model for persistent loading.</p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    );
  }
  
  // Primary model is set
  return (
    <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden mb-4">
      <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
            Primary Model Status
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Keeps model loaded in memory for faster responses & better streaming
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(primaryModelData.status)}`}>
          {primaryModelData.status}
        </span>
      </div>
      <div className="px-4 py-5 sm:px-6">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 dark:bg-red-200 dark:text-red-800 rounded-lg">
            {error}
          </div>
        )}
        
        {/* Primary model information */}
        <div className="mb-4">
          <div className="flex items-center mb-2">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-dark-text-primary">
              {primaryModelData.model?.name || 'Unknown Model'}
            </h4>
            {primaryModelData.is_ready && (
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Ready
              </span>
            )}
          </div>
          
          {/* Model ID and path if available */}
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            ID: {primaryModelData.model?.id || 'N/A'}
            {primaryModelData.model?.model_path && (
              <div className="mt-1 truncate">
                Path: {primaryModelData.model.model_path}
              </div>
            )}
          </div>
        </div>
        
        {/* Status information */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</h5>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              {primaryModelData.status === 'ready' ? 'Active' : primaryModelData.status}
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Uptime</h5>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              {formatUptime(primaryModelData.uptime)}
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Load Time</h5>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              {primaryModelData.load_time_ms ? `${primaryModelData.load_time_ms}ms` : 'N/A'}
            </div>
          </div>
        </div>
        
        {/* Memory usage */}
        {primaryModelData.memory_usage && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
            <h5 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Memory Usage</h5>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <span className="block text-xs text-gray-500 dark:text-gray-400">RSS</span>
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  {formatBytes(primaryModelData.memory_usage.rss)}
                </span>
              </div>
              
              <div>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Heap Total</span>
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  {formatBytes(primaryModelData.memory_usage.heapTotal)}
                </span>
              </div>
              
              <div>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Heap Used</span>
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  {formatBytes(primaryModelData.memory_usage.heapUsed)}
                </span>
              </div>
              
              <div>
                <span className="block text-xs text-gray-500 dark:text-gray-400">External</span>
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  {formatBytes(primaryModelData.memory_usage.external)}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Active requests */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Requests</h5>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              {primaryModelData.active_requests || 0}
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Queue Length</h5>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
              {primaryModelData.queue_length || 0}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex justify-between items-center mt-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {primaryModelData.status === 'ready' ? 'Model is currently active and serving requests' : 'Model is in ' + primaryModelData.status + ' state'}
          </div>
          
          <button 
            type="button"
            onClick={handleUnsetPrimary}
            disabled={isUnsettingPrimary}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-primary hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50"
          >
            {isUnsettingPrimary ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700 dark:text-gray-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Releasing...
              </>
            ) : "Release From Memory"}
          </button>
        </div>
      </div>
    </div>
  );
};

PrimaryModelCard.propTypes = {
  model: PropTypes.object,
  onStatusChange: PropTypes.func
};

export default PrimaryModelCard;
