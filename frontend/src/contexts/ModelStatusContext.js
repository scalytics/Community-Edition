import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import adminService from '../services/adminService';
import socketService from '../services/socketService';

const ModelStatusContext = createContext(null);

export const useModelStatus = () => useContext(ModelStatusContext);

export const ModelStatusProvider = ({ children }) => {
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPoolStatus = useCallback(async () => {
    try {
      const statusData = await adminService.getWorkerPoolStatus(); 
      setPoolStatus(statusData || null); 
    } catch (err) {
      console.error('Error fetching worker pool status in Context:', err);
      setError('Failed to fetch worker pool status.');
      setPoolStatus(null); 
    } finally {
       if (loading) setLoading(false);
    }
  }, [loading]); 

  useEffect(() => {
    fetchPoolStatus();

    const handleActiveModelChange = (data) => {
        setPoolStatus(prevStatus => ({
            ...prevStatus,
            activeModelId: data.modelId,
        }));
    };

    const handleWorkerStatusChange = (data) => {
        setPoolStatus(prevStatus => ({
            ...prevStatus,
            workers: data.workers,
        }));
    };

    socketService.on('active-model-changed', handleActiveModelChange);
    socketService.on('worker-status-changed', handleWorkerStatusChange);

    const intervalId = setInterval(fetchPoolStatus, 15000); 

    return () => {
      clearInterval(intervalId);
      const unsubscribeActiveModel = socketService.on('active-model-changed', handleActiveModelChange);
      const unsubscribeWorkerStatus = socketService.on('worker-status-changed', handleWorkerStatusChange);
      unsubscribeActiveModel();
      unsubscribeWorkerStatus();
    }; 
  }, [fetchPoolStatus]); 

  const value = {
    poolStatus,
    loading, 
    error,  
    refreshPoolStatus: fetchPoolStatus 
  };

  return (
    <ModelStatusContext.Provider value={value}>
      {children}
    </ModelStatusContext.Provider>
  );
};
