import React from 'react';
import { formatBytes } from './utils';

const StorageInfo = ({ storageInfo, loading }) => {
  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg mb-6">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Storage Information</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-500 dark:text-gray-400">Loading storage information...</p>
        </div>
      </div>
    );
  }

  if (!storageInfo || !storageInfo.diskInfo) {
    return (
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg mb-6">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Storage Information</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-red-500 dark:text-red-400">Could not load storage information.</p>
        </div>
      </div>
    );
  }

  const { diskInfo = {}, modelsDirectory, modelsSize, modelCount } = storageInfo;
  const { total = 0, used = 0, available = 0 } = diskInfo;

  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Storage Information</h3>
      </div>
      <div className="px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Disk Space</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{formatBytes(total)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Used Disk Space</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{formatBytes(used)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Free Disk Space</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{formatBytes(available)}</p>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-dark-border pt-4">
          <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-2">Models Directory</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Path: {modelsDirectory || 'N/A'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Size: {formatBytes(modelsSize || 0)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Directories: {modelCount || 0}
          </p>
        </div>
      </div>
    </div>
  );
};

export default StorageInfo;
