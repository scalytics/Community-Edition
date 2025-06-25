import React from 'react';
import ModelSearch from '../ModelSearch'; 
import ModelSearchResults from '../ModelSearchResults'; 
/**
 * Component to handle model search functionality
 */
const ModelSearchSection = ({ 
  results,
  searching,
  error,
  selectedFamily,
  sortBy,
  sortOrder,
  onFamilyChange,
  onSortByChange,
  onSortOrderChange,
  onSelectModel,
  selectedModelId,
  isAirGapped = false
}) => {
  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-500 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="ml-3 text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Air-gapped warning for search section */}
      {isAirGapped && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400 dark:text-yellow-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">HuggingFace Search Disabled</h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-200">
                <p>
                  HuggingFace search is disabled because Air-Gapped Mode is enabled. You can still view and use locally installed models.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search form component - now uses dropdowns */}
      <ModelSearch 
        selectedFamily={selectedFamily}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onFamilyChange={onFamilyChange}
        onSortByChange={onSortByChange}
        onSortOrderChange={onSortOrderChange}
        isLoading={searching || isAirGapped} 
        isAirGapped={isAirGapped} 
      />

      {/* Filter information notice (conditional) */}
      {selectedFamily && selectedFamily !== 'embedding' && !isAirGapped && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md p-4 mt-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-dark-link">Search Results for vLLM</h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-dark-link">
                <p>
                  Results are not pre-filtered by format. Select models in PyTorch or SafeTensor format that are compatible with the vLLM inference server.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search results component */}
      <div className="mt-6 w-full">
        {isAirGapped ? (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-dark-border rounded-md">
            <div className="py-6">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="mt-2 text-lg font-medium">Model Search Unavailable</p>
              <p className="mt-1">Air-Gapped Mode prevents external network connections.</p>              
            </div>
          </div>
        ) : (
          <ModelSearchResults
            results={results}
            onSelectModel={onSelectModel}
            selectedModelId={selectedModelId}
            loading={searching}
            selectedFamily={selectedFamily} 
          />
        )}
      </div>
    </div>
  );
};

export default ModelSearchSection;
