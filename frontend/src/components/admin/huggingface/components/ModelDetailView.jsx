import React from 'react';
import HuggingFaceModelDetail from '../HuggingFaceModelDetail';

/**
 * Component to display model details and download options
 */
const ModelDetailView = ({ 
  model, 
  onDownload, 
  isLoading,
  downloadProgress,
  downloadId,
  onRefreshModels,
  updateDownloadProgress, 
  onDismiss, 
  onCancel, 
  isAirGapped = false 
}) => {
  if (!model) return null;

  return (
    <div className="w-full mt-8" id="model-details-section">
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
            Model Details
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Review and download options for {model.modelId}
          </p>
        </div>
        <div className="p-6">
          <HuggingFaceModelDetail 
            model={model}
            onDownload={onDownload}
            isLoading={isLoading}
            downloadProgress={downloadProgress}
            downloadId={downloadId}
            onRefreshModels={onRefreshModels}
            onProgress={updateDownloadProgress} 
            onDismiss={onDismiss} 
            onCancel={onCancel} 
          />
        </div>
      </div>
    </div>
  );
};

export default ModelDetailView;
