import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Component to display search results with pagination
 */
const ModelSearchResults = ({ results = [], onSelectModel, selectedModelId, loading, selectedFamily }) => { 
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; 

  // Ensure results is always an array with defensive programming
  const rawResults = Array.isArray(results) ? results : [];

  // The backend now handles filtering, so we can use the results directly.
  const filteredResults = rawResults;

  // If no results or still loading initial search, show appropriate message
  if (filteredResults.length === 0) { 
    return (
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6 mt-4">
        {loading ? (
          <div className="text-center py-10">
            <svg className="mx-auto animate-spin h-8 w-8 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching for models...</p>
          </div>
        ) : (
          <div className="text-center py-10">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-dark-text-primary">No models found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try a different search term or check your filters.</p>
          </div>
        )}
      </div>
    );
  }
  
  // Pagination calculations based on filtered results
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredResults.slice(indexOfFirstItem, indexOfLastItem); 
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="bg-white dark:bg-dark-primary shadow sm:rounded-md mt-4">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-sm font-medium leading-6 text-gray-900 dark:text-dark-text-primary">
          Found {filteredResults.length} model{filteredResults.length === 1 ? '' : 's'}
        </h3>
        <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
          Click on a model to view details and download options.
        </p>
      </div>
      
      <ul className="divide-y divide-gray-200 dark:divide-dark-border">
        {currentItems.map((model) => (
          <li 
            key={model.modelId} 
            className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors duration-150 ${selectedModelId === model.modelId ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            onClick={() => onSelectModel(model)}
          >
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-blue-600 dark:text-dark-link">{model.modelId}</div>
                    {/* Removed description line from search results */}
                  </div>
                </div>
                <div className="flex flex-col ml-2 text-right">
                  <div className="flex justify-end space-x-1">
                    {model.tags?.includes('text-generation') && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-dark-text-primary">
                        Text Generation
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex text-sm text-gray-500 dark:text-gray-400 space-x-4 justify-end">
                    <span className="flex items-center">
                      <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {(model.stars || 0).toLocaleString()}
                    </span>
                    <span className="flex items-center">
                      <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      {(model.downloads || 0).toLocaleString()}
                    </span>
                    <span className="flex items-center">
                      <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      {model.lastModified ? 
                        new Date(model.lastModified).toLocaleDateString(navigator.language, { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        }) : 
                        (model.createdAt ? 
                          new Date(model.createdAt).toLocaleDateString(navigator.language, { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          }) : 'Unknown')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-dark-primary px-4 py-6 border-t border-gray-200 dark:border-dark-border sm:px-6">
          {/* Result count */}
          <div className="text-center mb-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {/* Use filtered results length for pagination display */}
              Showing <span className="font-medium">{filteredResults.length > 0 ? indexOfFirstItem + 1 : 0}</span> to{' '}
              <span className="font-medium">{Math.min(indexOfLastItem, filteredResults.length)}</span> of{' '}
              <span className="font-medium">{filteredResults.length}</span> results
            </p>
          </div>

          {/* Pagination controls */}
          <div className="flex justify-center w-full">
            <nav className="relative z-0 inline-flex rounded-md shadow-sm mx-auto w-full max-w-2xl" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center px-6 py-3 rounded-l-md border text-base font-medium shadow-sm ${
                  currentPage === 1
                    ? 'text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-primary hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="sr-only">Previous</span>
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              
              {/* Page buttons */}
              <div className="flex flex-grow">
                {[...Array(totalPages)].map((_, index) => (
                  <button
                    key={index}
                    onClick={() => handlePageChange(index + 1)}
                    className={`relative flex-grow inline-flex items-center justify-center px-6 py-3 border text-base font-medium shadow-sm ${
                      currentPage === index + 1
                        ? 'z-10 bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-700 text-blue-600 dark:text-dark-text-primary'
                        : 'bg-white dark:bg-dark-primary border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center px-6 py-3 rounded-r-md border text-base font-medium shadow-sm ${
                  currentPage === totalPages
                    ? 'text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-primary hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="sr-only">Next</span>
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};

ModelSearchResults.propTypes = {
  results: PropTypes.array.isRequired,
  onSelectModel: PropTypes.func.isRequired,
  selectedModelId: PropTypes.string,
  loading: PropTypes.bool,
  selectedFamily: PropTypes.string 
};

export default ModelSearchResults;
