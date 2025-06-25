import React from 'react'; 
import PropTypes from 'prop-types';
import { SUPPORTED_FAMILIES } from '../huggingface/utils/modelFamilies'; 

/**
 * Reusable ModelSearch component for selecting HuggingFace models by family and sort order
 */
const ModelSearch = ({
  selectedFamily,
  sortBy,
  sortOrder,
  onFamilyChange,
  onSortByChange,
  onSortOrderChange,
  isLoading = false, 
  isAirGapped = false 
}) => {

  // Combined handler for all select changes
  const handleSelectChange = (e) => {
    const { name, value } = e.target;
    if (name === 'family') {
      onFamilyChange(value);
    } else if (name === 'sortBy') {
      onSortByChange(value);
    } else if (name === 'sortOrder') {
      onSortOrderChange(value);
    }
  };

  return (
    <div className="space-y-4">

      {/* Filter/Sort options */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 bg-gray-50 dark:bg-dark-secondary p-4 rounded-md border border-gray-200 dark:border-dark-border">
          {/* Model Family Dropdown */}
          <div>
            <label htmlFor="family" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Model Family
            </label>
            <select
              id="family"
              name="family"
              value={selectedFamily}
              onChange={handleSelectChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-dark-border bg-white dark:bg-dark-primary text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm rounded-md"
              disabled={isLoading || isAirGapped} 
            >
              {/* Add default non-selectable option */}
              <option value="" disabled>Select Family...</option>
              {SUPPORTED_FAMILIES.map(family => (
                <option key={family.id} value={family.id}>
                  {family.name} ({family.id}) {/* Optionally show ID */}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sort Results By
            </label>
            <select
              id="sortBy"
              name="sortBy"
              value={sortBy}
              onChange={handleSelectChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-dark-border bg-white dark:bg-dark-primary text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm rounded-md"
              disabled={isLoading || isAirGapped} 
            >
              <option value="downloads">Downloads</option>
              <option value="likes">Stars</option>
              <option value="lastModified">Last Updated</option>
            </select>
          </div>

          {/* Sort Order Dropdown */}
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Order
            </label>
            <select
              id="sortOrder"
              name="sortOrder"
              value={sortOrder}
              onChange={handleSelectChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-dark-border bg-white dark:bg-dark-primary text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm rounded-md"
              disabled={isLoading || isAirGapped} 
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

      {/* Removed Search tips */}
    </div>
  );
};

ModelSearch.propTypes = {
  selectedFamily: PropTypes.string.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortOrder: PropTypes.string.isRequired,
  onFamilyChange: PropTypes.func.isRequired,
  onSortByChange: PropTypes.func.isRequired,
  onSortOrderChange: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  isAirGapped: PropTypes.bool
};

export default ModelSearch;
