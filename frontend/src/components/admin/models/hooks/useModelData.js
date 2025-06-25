import { useState, useEffect, useCallback } from 'react';
import adminService from '../../../../services/adminService'; 
import apiService from '../../../../services/apiService';

/**
 * Custom hook to manage fetching and state for models, providers, and GPUs.
 * Pool status is now handled by ModelStatusContext.
 */
const useModelData = () => {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [availableGpuIds, setAvailableGpuIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providersAvailable, setProvidersAvailable] = useState(true);
  const [preferredEmbeddingModelId, setPreferredEmbeddingModelId] = useState(null); 

  const fetchModelsAndProviders = useCallback(async () => {
    try {
      // Fetch Models
      let modelsArray = [];
      try {
        // Add cache-busting query parameter
        const cacheBuster = `_=${Date.now()}`;
        const endpoint = `/admin/available?${cacheBuster}`;
        const rawResponse = await apiService.get(endpoint); // Use endpoint with cache buster

        let parsedResponse;
        if (typeof rawResponse === 'string') {
          try {
            parsedResponse = JSON.parse(rawResponse);
            
          } catch (parseError) {
            console.error('[useModelData] Failed to parse modelsResponse string:', parseError, 'Raw string:', rawResponse);
            throw new Error('Received invalid JSON format for models.');
          }
        } else if (typeof rawResponse === 'object' && rawResponse !== null) {
          parsedResponse = rawResponse; 
          
        } else {
          console.error('[useModelData] Unexpected response type:', typeof rawResponse);
          throw new Error('Received unexpected data type for models.');
        }

        // Now check the parsed object structure more carefully
        if (parsedResponse && parsedResponse.success === true && Array.isArray(parsedResponse.data)) {
          
          modelsArray = parsedResponse.data;
        } else if (Array.isArray(parsedResponse)) { 
          
          modelsArray = parsedResponse;
        } else {
          console.warn('[useModelData] Models response is not in expected {success: true, data: []} format after parsing:', parsedResponse);
        }
        setModels(modelsArray); 

      } catch (modelErr) { 
        console.error('Error fetching models:', modelErr);
        setError(prev => prev ? `${prev}\nFailed to load models.` : 'Failed to load models.');
        setModels([]);
      }

      // Fetch Providers
      let providersArray = [];
      try {
        const providersResponse = await adminService.getApiProviders();
        if (Array.isArray(providersResponse)) {
          providersArray = providersResponse;
        } else if (providersResponse?.data && Array.isArray(providersResponse.data)) {
          providersArray = providersResponse.data;
        } else if (providersResponse?.data?.data && Array.isArray(providersResponse.data.data)) {
          providersArray = providersResponse.data.data;
        } else if (providersResponse?.providers && Array.isArray(providersResponse.providers)) {
          providersArray = providersResponse.providers;
        } else {
          console.warn('Providers response is not in expected format:', providersResponse);
        }
        setProviders(providersArray);
        setProvidersAvailable(providersArray.length > 0);
      } catch (providerErr) {
        console.warn('Unable to load providers, continuing without them:', providerErr);
        setProvidersAvailable(false);
        setProviders([]);
      }

    } catch (err) {
      console.error('Error in fetchModelsAndProviders hook:', err);
      setError(prev => prev ? `${prev}\nFailed to load initial data.` : 'Failed to load initial data.');
      setModels([]);
      setProviders([]);
    } 
  }, []);

  const fetchPreferredEmbeddingModel = useCallback(async () => {
    try {
      const response = await adminService.getPreferredEmbeddingModel();
      
      if (response?.success && response?.data) {
        const fetchedId = response.data.preferred_local_embedding_model_id;
        setPreferredEmbeddingModelId(fetchedId); 
      } else {
        setPreferredEmbeddingModelId(null); 
      }
    } catch (err) {
      console.error('Error fetching preferred embedding model setting:', err);
      setError(prev => prev ? `${prev}\nFailed to load preferred embedding model setting.` : 'Failed to load preferred embedding model setting.');
      setPreferredEmbeddingModelId(null);
    }
  }, [setPreferredEmbeddingModelId]); 

  const fetchGpuIndices = useCallback(async () => {
    try {
      const response = await adminService.getGpuIndices();
      let gpuIds = [];
      if (response && Array.isArray(response)) {
          gpuIds = response;
      } else if (response?.data && Array.isArray(response.data)) {
          gpuIds = response.data;
      } else {
          console.warn('Received unexpected format for GPU indices:', response);
      }
      setAvailableGpuIds(gpuIds);
    } catch (err) {
      console.error('Error fetching GPU indices:', err);
      setError(prev => prev ? `${prev}\nFailed to load GPU indices.` : 'Failed to load GPU indices.');
      setAvailableGpuIds([]);
    }
  }, []);

  // Initial data load effect (without pool status)
  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetchModelsAndProviders(),
      fetchGpuIndices(),
      fetchPreferredEmbeddingModel() 
    ]).finally(() => {
      setLoading(false);
    });
  }, [fetchModelsAndProviders, fetchGpuIndices, fetchPreferredEmbeddingModel]);

  // Function to manually trigger a refresh of data (without pool status)
  const refreshData = useCallback(() => {
    setLoading(true);
    setError(''); 
    Promise.all([
      fetchModelsAndProviders(),
      fetchGpuIndices(),
      fetchPreferredEmbeddingModel() 
    ]).finally(() => {
      setLoading(false);
    });
  }, [fetchModelsAndProviders, fetchGpuIndices, fetchPreferredEmbeddingModel]); 

  return {
    models,
    providers,
    providersAvailable,
    availableGpuIds,
    preferredEmbeddingModelId, 
    loading,
    error,
    refreshData,
  };
};

export default useModelData;
