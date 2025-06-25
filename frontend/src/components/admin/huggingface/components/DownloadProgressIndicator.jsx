import React, { useState } from 'react';
import { huggingFaceService } from '../../../../services/admin';

/**
 * Component to display download progress and status
 */
const DownloadProgressIndicator = ({ 
  progress, 
  downloadId, 
  onRefresh,
  onCancel 
}) => {
  const [cancelling, setCancelling] = useState(false);

  const handleCancelDownload = async () => {
    if (!downloadId || cancelling) return;
    
    try {
      setCancelling(true);
      await huggingFaceService.cancelDownload(downloadId);
      
      // Call the onCancel callback if provided
      if (onCancel) {
        onCancel(downloadId);
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      // You might want to show an error message to the user here
    } finally {
      setCancelling(false);
    }
  };

  if (!downloadId) return null;

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(2)} B/s`;
    if (bytesPerSecond < 1048576) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    return `${(bytesPerSecond / 1048576).toFixed(2)} MB/s`;
  };
  
  // Calculate remaining time
  const getRemainingTime = () => {
    if (!progress || !progress.speed || progress.speed === 0 || !progress.totalBytes || !progress.bytesDownloaded) {
      return 'Calculating...';
    }
    
    const remainingBytes = progress.totalBytes - progress.bytesDownloaded;
    const remainingSeconds = remainingBytes / progress.speed;
    
    if (remainingSeconds < 60) {
      return `${Math.ceil(remainingSeconds)} seconds`;
    } else if (remainingSeconds < 3600) {
      return `${Math.ceil(remainingSeconds / 60)} minutes`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.ceil((remainingSeconds % 3600) / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
  };

  return (
    <div className="mt-6">
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
            Download Progress
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            {progress?.status === 'completed' ? 'Download completed' : 'Downloading model files'}
          </p>
        </div>
        
        <div className="p-6">
          {/* Progress indicator */}
          {progress && (
            <div className="space-y-4">
              {progress.message && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {progress.message}
                </div>
              )}
              
              {progress.progress !== undefined && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{progress.progress}% Complete</span>
                    {progress.totalBytes && progress.bytesDownloaded && (
                      <span>
                        {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.totalBytes)}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                  
                  {/* Additional details */}
                  {progress.speed > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Speed: {formatSpeed(progress.speed)}</span>
                      <span>Remaining: {getRemainingTime()}</span>
                    </div>
                  )}
                </div>
              )}
              
              {progress.status === 'error' && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-500">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {progress.error || 'An error occurred during download'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Action buttons */}
          <div className="mt-6 flex justify-between">
            {/* Cancel button - only show if download is in progress */}
            {progress?.status !== 'completed' && progress?.status !== 'error' && (
              <button
                onClick={handleCancelDownload}
                disabled={cancelling}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel Download
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={onRefresh}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Refresh Model List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadProgressIndicator;
