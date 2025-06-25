import { useState, useEffect, useCallback } from 'react';
import adminService from '../../../services/adminService';
import apiService from '../../../services/apiService';

/**
 * Custom hook to manage fetching and state for models, providers, GPUs, and pool status.
 */
const useModelData = () => {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [availableGpuIds, setAvailableGpuIds] = useState([]);
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providersAvailable, setProvidersAvailable] = useState(true); // Keep this state local to the hook

  // TODO: Move fetchModelsAndProviders logic here
  const fetchModelsAndProviders = useCallback(async () => {
    // Placeholder - Logic will be moved from ModelManager.jsx
    console.log('Fetching models and providers...');
    setLoading(true);
    // ... implementation ...
    setLoading(false);
  }, []);

  // TODO: Move fetchGpuIndices logic here
  const fetchGpuIndices = useCallback(async () => {
    // Placeholder - Logic will be moved from ModelManager.jsx
    console.log('Fetching GPU indices...');
    // ... implementation ...
  }, []);

  // TODO: Move fetchPoolStatus logic here
  const fetchPoolStatus = useCallback(async () => {
    // Placeholder - Logic will be moved from ModelManager.jsx
    console.log('Fetching pool status...');
    // ... implementation ...
  }, []);

  // Initial data load and periodic refresh
  useEffect(() => {
    // Placeholder - Logic will be moved from ModelManager.jsx
    console.log('useModelData initial load effect running...');
    fetchModelsAndProviders();
    fetchGpuIndices();
    fetchPoolStatus();

    const intervalId = setInterval(fetchPoolStatus, 15000); // Keep periodic refresh for pool status
    return () => clearInterval(intervalId);
  }, [fetchModelsAndProviders, fetchGpuIndices, fetchPoolStatus]);

  // Function to manually trigger a refresh if needed
  const refreshData = useCallback(() => {
    fetchModelsAndProviders();
    fetchGpuIndices();
    fetchPoolStatus();
  }, [fetchModelsAndProviders, fetchGpuIndices, fetchPoolStatus]);

  return {
    models,
    providers,
    providersAvailable,
    availableGpuIds,
    poolStatus,
    loading,
    error,
    refreshData, // Expose refresh function
  };
};

export default useModelData;
