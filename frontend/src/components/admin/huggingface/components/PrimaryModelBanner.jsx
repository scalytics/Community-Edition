import React, { useEffect, useState, useRef } from 'react';
import { getPrimaryModelStatus } from '../../../../services/persistentModelService';

/**
 * Banner that displays information about the currently active primary model
 * This is shown in the HuggingFace model manager to indicate when a model is
 * already loaded and persistent in memory
 */
const PrimaryModelBanner = () => {
  const [primaryModel, setPrimaryModel] = useState(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [error, setError] = useState(null);
  
  const isMounted = useRef(true);
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    isMounted.current = true;
    
    const fetchInitialPrimaryModel = async () => {
      if (!isMounted.current) return;
      
      try {
        setLoading(true); 
        const response = await getPrimaryModelStatus();
        
        if (!isMounted.current) return;
        
        if (response.data?.has_primary_model && response.data?.model) {
          setPrimaryModel(response.data);
          setVisible(true); 
        } else {
          setPrimaryModel(null);
          setVisible(false); 
        }
        setError(null);
      } catch (err) {
        if (!isMounted.current) return;
        
        console.error('Error checking primary model:', err);
        setError('Could not retrieve primary model status');
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };
    
    fetchInitialPrimaryModel();
    
    return () => {
      isMounted.current = false;
    };
  }, []); 
  
  const formatUptime = (ms) => {
    if (!ms) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };
  
  if (loading && !primaryModel) return null;
  
  return (
    <div 
      className={`mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg
        transition-opacity duration-300 ease-in-out ${visible ? 'opacity-100' : 'opacity-0 h-0 p-0 m-0 overflow-hidden'}`}
    >
      {primaryModel && (
        <>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1 md:flex md:justify-between">
              <p className="text-sm text-blue-700 dark:text-dark-text-primary">
                <span className="font-medium">Primary Model Active: </span>
                {primaryModel.model.name} 
                {primaryModel.status === 'ready' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                    Ready
                  </span>
                )}
                {primaryModel.status === 'loading' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-dark-text-primary rounded-full">
                    Loading
                  </span>
                )}
              </p>
              <p className="mt-3 text-sm md:mt-0 md:ml-6 text-blue-700 dark:text-dark-text-primary">
                <span className="font-medium">Uptime: </span>
                {formatUptime(primaryModel.uptime)}
              </p>
            </div>
          </div>
          <div className="mt-2 text-xs text-blue-600 dark:text-dark-link">
            Using persistent model loaded in memory for faster responses and better streaming
          </div>
        </>
      )}
    </div>
  );
};

export default PrimaryModelBanner;
