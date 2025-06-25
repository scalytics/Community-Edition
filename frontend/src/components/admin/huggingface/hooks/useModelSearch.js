import { useState, useEffect, useCallback, useRef } from 'react';
import debounce from 'lodash.debounce';
import adminService from '../../../../services/adminService';

/**
 * Extract search results from various response formats
 * @param {Object} response - The API response
 * @param {string} selectedFamily - The currently selected model family ('embedding' or other ID)
 * @returns {Array} - The mapped search results array
 */
const extractSearchResults = (response, selectedFamily) => { 
  let rawResults = [];

  // Check all possible response formats to find the raw array
  if (Array.isArray(response?.data)) {
    rawResults = response.data;
  } else if (Array.isArray(response)) {
    rawResults = response;
  } else if (Array.isArray(response?.data?.data)) {
    rawResults = response.data.data;
  } else if (Array.isArray(response?.data?.models)) {
    rawResults = response.data.models;
  } else if (Array.isArray(response?.models)) {
    rawResults = response.models;
  } else if (Array.isArray(response?.data?.results)) {
    rawResults = response.data.results;
  } else if (Array.isArray(response?.results)) {
    rawResults = response.results;
  } else if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
    rawResults = [response.data];
  }

  // With vLLM, we no longer filter for GGUF/GGML. We look for base torch models.
  // The search API without specific library filters tends to return these.
  const resultsToProcess = rawResults;

  // Map the results
  const mappedResults = resultsToProcess.map(model => ({
      ...model,
      modelId: model.id || model.modelId,
      description: model.description || '',
      stars: model.likes || model.stars || 0,
      downloads: model.downloads || 0,
      tags: model.tags || [],
      lastModified: model.lastModified || null,
      createdAt: model.createdAt || model.created_at || null,
      pipeline_tag: model.pipeline_tag,
    }));

    // Add date information during mapping (if needed, HF API often provides it directly now)
    mappedResults.forEach(model => {
      if (!model.lastModified && !model.createdAt) {
        model.lastModified = model.lastModified || model.last_modified || null;
        model.createdAt = model.createdAt || model.created_at || null;
      }
    });

    return mappedResults;
};

/**
 * Sort models by date (lastModified or createdAt)
 */
const sortModelsByDate = (models, order) => {
  return [...models].sort((a, b) => {
    const getDateValue = (model) => {
      const dateStr = model.lastModified || model.createdAt;
      if (dateStr) {
        try { return new Date(dateStr).getTime(); } catch (e) { return 0; }
      }
      return 0;
    };
    const dateValueA = getDateValue(a);
    const dateValueB = getDateValue(b);
    const validA = !isNaN(dateValueA) ? dateValueA : 0;
    const validB = !isNaN(dateValueB) ? dateValueB : 0;
    return order === 'desc' ? validB - validA : validA - validB;
  });
};


/**
 * Custom hook to handle Hugging Face model search functionality
 */
const useModelSearch = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('');
  const [sortBy, setSortBy] = useState('downloads');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchModels = useCallback(async () => {
    if (!selectedFamily) {
      setSearchResults([]); setError(''); setSearching(false); return;
    }

    try {
      setSearching(true); setError(''); setSearchResults([]);

      const params = {
        sort: sortBy === 'lastModified' ? 'downloads' : sortBy,
        direction: sortOrder === 'desc' ? -1 : 1,
        limit: 50 
      };

      const response = await adminService.searchHuggingFaceModels(selectedFamily, params);
      let searchResultsArray = extractSearchResults(response, selectedFamily);

      // Date sorting logic remains the same
      if (sortBy === 'lastModified' && searchResultsArray.length > 0) {
        setError('Fetching model dates...');
        const batchSize = 5;
        for (let i = 0; i < searchResultsArray.length; i += batchSize) {
          const batch = searchResultsArray.slice(i, i + batchSize);
          await Promise.all(batch.map(async (model) => {
            try {
              const modelDetailResponse = await fetch(`https://huggingface.co/api/models/${model.modelId}`);
              const modelDetail = await modelDetailResponse.json();
              model.lastModified = modelDetail.lastModified || null;
              model.createdAt = modelDetail.createdAt || null;
            } catch (err) { /* Ignore fetch errors for individual dates */ }
          }));
        }
        searchResultsArray = sortModelsByDate(searchResultsArray, sortOrder);
        setError('');
      }

      setSearchResults(searchResultsArray);

      // Update error message based on filtered results
      if (searchResultsArray.length === 0) {
         if (selectedFamily === 'embedding') {
             setError(`No embedding models found matching the criteria.`);
         } else {
             setError(`No suitable models found for the '${selectedFamily}' family. Try a different search.`);
         }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to search Hugging Face models';
      setError(`Error searching for ${selectedFamily}: ${errorMessage}`);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [selectedFamily, sortBy, sortOrder]); 

  const debouncedFetchModelsRef = useRef();

  useEffect(() => {
    debouncedFetchModelsRef.current = debounce(() => { fetchModels(); }, 500);
    return () => { debouncedFetchModelsRef.current?.cancel(); };
  }, [fetchModels]);

  useEffect(() => {
    debouncedFetchModelsRef.current?.();
    return () => { debouncedFetchModelsRef.current?.cancel(); };
  }, [selectedFamily, sortBy, sortOrder]);

  const handleFamilyChange = (newFamily) => { setSelectedFamily(newFamily); };
  const handleSortByChange = (newSortBy) => { setSortBy(newSortBy); };
  const handleSortOrderChange = (newSortOrder) => { setSortOrder(newSortOrder); };
  const clearSearchResults = () => { setSearchResults([]); setError(''); };

  return {
    searchResults, setSearchResults, searching, error,
    selectedFamily, sortBy, sortOrder,
    handleFamilyChange, handleSortByChange, handleSortOrderChange,
    clearSearchResults
  };
};

export default useModelSearch;
