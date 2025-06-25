import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { huggingFaceService } from '../../../services/admin';

/**
 * Component to allow users to select specific model files to download
 * Shows available files for a model and allows selection
 */
const ModelFileSelector = ({ modelId, onFileSelect, onCancel }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
  });
  
  // Fetch available files when the component mounts
  useEffect(() => {
    const fetchModelFiles = async () => {
      try {
        setIsLoading(true);
        const response = await huggingFaceService.listModelFiles(modelId);
        
        if (response && response.files) {
          setFiles(response.files);
          
          if (response.files.length > 0) {
            // Default to selecting the first file in the list
            setSelectedFile(response.files[0]);
          }
        } else {
          setError('No files found for this model');
        }
      } catch (err) {
        console.error('Error fetching model files:', err);
        setError('Failed to fetch model files. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchModelFiles();
  }, [modelId]);
  
  const filteredFiles = files.filter(file => {
    return filters.search === '' || 
      file.name.toLowerCase().includes(filters.search.toLowerCase());
  });
  
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };
  
  const handleSelect = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };
  
  // File type icon based on extension
  const getFileTypeIcon = (fileName) => {
    if (fileName.endsWith('.bin')) return '📦'; 
    if (fileName.endsWith('.safetensors')) return '🔒'; 
    return '📄'; 
  };
  
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
          <p className="ml-3 text-gray-600 dark:text-gray-300">Loading available model files...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6">
        <div className="text-center">
          <div className="text-red-500 dark:text-red-400 text-xl">⚠️ {error}</div>
          <button
            onClick={onCancel}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
          Select a Model File to Download
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Choose a model file based on your hardware capabilities and needs.
        </p>
      </div>
      
      <div className="p-6">
        {/* File filters */}
        <div className="mb-4 flex flex-wrap gap-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Search</label>
            <input
              type="text"
              id="search"
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
              placeholder="Search files..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>
        </div>
        
        {/* File listing */}
        <div className="mt-4 overflow-hidden shadow border-b border-gray-200 dark:border-dark-border sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-secondary">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Select
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  File Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Size
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No files match your filters
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr 
                    key={file.name}
                    className={`${selectedFile?.name === file.name ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-dark-secondary'} cursor-pointer`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="radio"
                        checked={selectedFile?.name === file.name}
                        onChange={() => setSelectedFile(file)}
                        className="h-4 w-4 text-blue-600 dark:text-dark-link focus:ring-blue-500 dark:focus:ring-blue-400 border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {getFileTypeIcon(file.name)} {file.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {file.name.split('.').pop().toUpperCase()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Actions */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-primary hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSelect}
            disabled={!selectedFile}
            className={`px-4 py-2 shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 ${
              selectedFile ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800' : 'bg-blue-300 dark:bg-blue-800/50 cursor-not-allowed'
            }`}
          >
            Download Selected File
          </button>
        </div>
      </div>
    </div>
  );
};

ModelFileSelector.propTypes = {
  modelId: PropTypes.string.isRequired,
  onFileSelect: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

export default ModelFileSelector;
