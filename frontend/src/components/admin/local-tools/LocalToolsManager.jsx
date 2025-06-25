import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom'; 
import apiService from '../../../services/apiService'; 
import adminService from '../../../services/admin'; 
import { toast } from 'react-toastify';
import ToggleSwitch from '../../common/ToggleSwitch'; 
import { InformationCircleIcon } from '@heroicons/react/24/solid'; 

const LocalToolsManager = () => {
  const [localTools, setLocalTools] = useState({});
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState(''); 

  const [hasEmbeddingModel, setHasEmbeddingModel] = useState(false);
  const [embeddingModelLoading, setEmbeddingModelLoading] = useState(true);
  const [embeddingModelError, setEmbeddingModelError] = useState('');

  const fetchToolStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiService.get('/mcp/local-tools/status');
      if (response.success && response.data) {
        setLocalTools(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch local tool status');
      }
    } catch (err) {
      console.error("Error fetching local tool status:", err);
      setError(err.message || 'Could not load local tool statuses.');
      setLocalTools({}); 
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToolStatus();
  }, [fetchToolStatus]);

  useEffect(() => {
    const fetchEmbeddingStatus = async () => {
      setEmbeddingModelLoading(true);
      setEmbeddingModelError('');
      try {
        const response = await adminService.getPreferredEmbeddingModel();
        if (response.success && response.data?.preferredEmbeddingModel) {
          setHasEmbeddingModel(true);
        } else {
          setHasEmbeddingModel(false);
          if (!response.success) {
             setEmbeddingModelError(response.message || 'Could not verify embedding model status.');
          }
        }
      } catch (err) {
        console.error("Error fetching preferred embedding model:", err);
        setHasEmbeddingModel(false);
        setEmbeddingModelError(err.message || 'Failed to load embedding model configuration.');
      } finally {
        setEmbeddingModelLoading(false);
      }
    };
    fetchEmbeddingStatus();
  }, []); 

  const handleToggleChange = async (toolName, isActive) => {
    setError('');

    try {
      const response = await apiService.put(`/admin/mcp/local-tools/${toolName}/status`, { isActive });
      if (response.success) {
        toast.success(`Tool '${getToolDisplayName(toolName)}' status updated successfully.`); 
        fetchToolStatus();
      } else {
        throw new Error(response.message || `Failed to update status for tool '${toolName}'.`);
      }
    } catch (err) {
      console.error(`Error updating status for tool ${toolName}:`, err);
      setError(err.message || `Could not update status for tool '${toolName}'.`);
      fetchToolStatus();
    }
  };

  const getToolDisplayName = (toolName) => {
    switch (toolName) {
      case 'live-search':
        return 'Scalytics Live Search';
      case 'image_gen': 
        return 'Image Generation';
      default:
        return toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getToolDescription = (toolName) => {
    switch (toolName) {
      case 'live-search':
        return 'Performs iterative web research using multiple search engines and LLM reasoning/synthesis to answer a query. Requires a preferred embedding model to be configured.';
      case 'image_gen': 
        return 'Allows users to generate images from text prompts using a configured AI model. Users select their preferred image model in AI Agents Settings.';
      default:
        return `Manages the ${getToolDisplayName(toolName)} tool.`;
    }
  };

  if (loading) {
    return <div className="text-center p-4">Loading local tool statuses...</div>;
  }

  const toolNames = Object.keys(localTools);

  return (
    <div className="bg-white dark:bg-dark-primary shadow-sm rounded-lg p-4 sm:p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">Local MCP Tool Management</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Enable or disable internal tools provided by this Scalytics Connect instance.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md border dark:border-red-800">
          {error}
        </div>
      )}

      {toolNames.length === 0 && !loading && !error && (
        <p className="text-gray-500 dark:text-gray-400">No locally defined MCP tools found or status could not be retrieved.</p>
      )}

      {toolNames.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {toolNames.map((toolName) => {
            const isEnabled = localTools[toolName];
            const boxBgColor = isEnabled ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
            const borderColor = isEnabled ? 'border-green-200 dark:border-green-700' : 'border-red-200 dark:border-red-700';
            const hoverBorderColor = isEnabled ? 'hover:border-green-400 dark:hover:border-green-500' : 'hover:border-red-400 dark:hover:border-red-500';

            const isSearchTool = toolName === 'live-search'; 
            const isSearchToolToggleDisabled = isSearchTool && (embeddingModelLoading || !hasEmbeddingModel || !!embeddingModelError);
            const showEmbeddingWarning = isSearchTool && !embeddingModelLoading && !hasEmbeddingModel && !embeddingModelError;
            const showEmbeddingError = isSearchTool && embeddingModelError;

            return (
              <div key={toolName} className={`p-4 border ${borderColor} ${boxBgColor} rounded-lg shadow-sm transition-all hover:shadow-md ${hoverBorderColor}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-semibold text-gray-900 dark:text-dark-text-primary">{getToolDisplayName(toolName)}</h3>
                  <ToggleSwitch
                    enabled={isEnabled}
                    onChange={(enabled) => handleToggleChange(toolName, enabled)}
                    label={`Enable ${getToolDisplayName(toolName)}`}
                    disabled={isSearchToolToggleDisabled && toolName === 'live-search'} 
                  />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {getToolDescription(toolName)}
                </p>
                 {showEmbeddingWarning && toolName === 'live-search' && (
                    <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md text-xs text-yellow-700 dark:text-yellow-300 flex items-start space-x-2">
                       <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                       <span>
                         This tool requires a preferred embedding model. Please configure one in <Link to="/admin/models" className="font-medium underline hover:text-yellow-800 dark:hover:text-yellow-200">Model Management</Link>.
                       </span>
                    </div>
                 )}
                 {showEmbeddingError && toolName === 'live-search' && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-xs text-red-700 dark:text-red-300 flex items-start space-x-2">
                       <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                       <span>
                         Error checking embedding model status: {embeddingModelError}
                       </span>
                    </div>
                 )}
                 <p className={`text-sm font-medium mt-3 ${isEnabled ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LocalToolsManager;
