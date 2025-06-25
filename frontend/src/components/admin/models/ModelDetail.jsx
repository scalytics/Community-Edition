import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

/**
 * Component to display detailed information about a model
 */
const ModelDetail = ({ model, onDownload, isLoading, downloadProgress, downloadId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modelDetails, setModelDetails] = useState(null);
  const [config, setConfig] = useState({
    name: model ? model.name || model.modelId.split('/').pop() : '',
    description: model ? model.description || `HuggingFace model: ${model.modelId}` : '',
    context_window: 4096,
    is_active: true,
    autoInstallDeps: true
  });

  // Fetch additional model details from Hugging Face
  useEffect(() => {
    if (!model || !model.modelId) return;

    const fetchModelDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Call Hugging Face API directly to get more details
        const response = await axios.get(`https://huggingface.co/api/models/${model.modelId}`);
        setModelDetails(response.data);
        
        // Update model name and description if available
        if (response.data) {
          setConfig(prev => ({
            ...prev,
            name: model.name || response.data.modelId?.split('/').pop() || prev.name,
            description: model.description || response.data.description || prev.description
          }));
        }
      } catch (err) {
        console.error('Error fetching model details:', err);
        setError('Could not load additional model details');
      } finally {
        setLoading(false);
      }
    };

    fetchModelDetails();
  }, [model]);

  // Handle input change
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle download button click
  const handleDownload = () => {
    onDownload(model.modelId, config);
  };

  if (!model) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden">
      <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
              {model.modelId}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              {loading ? (
                <span className="inline-flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading details...
                </span>
              ) : error ? (
                <span className="text-red-500 dark:text-red-400">Error: {error}</span>
              ) : (
                model.description || 'No description available'
              )}
            </p>
          </div>
          <div className="flex space-x-2">
            {model.tags && model.tags.includes('text-generation') && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                Text Generation
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Model stats section */}
      <div className="px-4 py-4 sm:px-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Downloads</h4>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">{modelDetails?.downloads.toLocaleString() || model.downloads?.toLocaleString() || 'N/A'}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stars</h4>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">{modelDetails?.likes.toLocaleString() || model.stars?.toLocaleString() || 'N/A'}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Author</h4>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">{modelDetails?.author || model.modelId.split('/')[0]}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Updated</h4>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
            {modelDetails?.lastModified 
              ? new Date(modelDetails.lastModified).toLocaleDateString() 
              : 'Unknown'}
          </p>
        </div>
      </div>

      {/* Full model description panel */}
      {modelDetails && modelDetails.description && (
        <div className="px-4 py-4 sm:px-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-2">About this model</h4>
          <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-md max-h-60 overflow-y-auto">
            {modelDetails.description.split('\n').map((paragraph, i) => (
              paragraph ? <p key={i}>{paragraph}</p> : <br key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Model configuration form */}
      <div className="px-4 py-5 sm:px-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-4">Download Configuration</h4>
        
        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Model Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              value={config.name}
              onChange={handleInputChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
              required
            />
          </div>
          
          <div className="sm:col-span-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              value={config.description}
              onChange={handleInputChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
            />
          </div>

          <div className="sm:col-span-6">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <div className="flex">
                <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
        <input 
          type="hidden" 
          name="context_window" 
          id="context_window" 
          value={config.context_window} 
        />
      </div>

      <div className="sm:col-span-3 flex items-center">
        <input
          id="autoInstallDeps"
              name="autoInstallDeps"
              type="checkbox"
              checked={config.autoInstallDeps}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="autoInstallDeps" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Auto-install dependencies
            </label>
          </div>
        </div>

        {/* Download button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download & Install
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

ModelDetail.propTypes = {
  model: PropTypes.object,
  onDownload: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
};

export default ModelDetail;
