import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { formatBytes } from './utils';

const ModelDirectories = ({ 
  modelDirectories, 
  loading, 
  openDeleteConfirm, 
  openPurgeConfirm,
}) => {
  if (loading) return null;
  
  if (!modelDirectories || modelDirectories.length === 0) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-700 text-blue-700 dark:text-blue-300 p-4 mt-4">
        <p>No stale model artefacts found! </p>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Installed Models</h3>
      </div>
      <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-secondary">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Directory Name
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Files
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Size
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Last Modified
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Config
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider tooltip-container">
                Active
                <span className="tooltip">
                  Models that contain model files or are referenced in the database
                </span>
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
            {modelDirectories && Array.isArray(modelDirectories) && modelDirectories.map((dir) => (
              <tr key={dir.name} className={`hover:bg-gray-50 dark:hover:bg-dark-secondary ${dir.type === 'stale_db_entry' ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">
                  <div className="flex items-center">
                    <span className="font-medium">{dir.name}</span>
                    {dir.type === 'stale_db_entry' && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Stale DB Entry
                      </span>
                    )}
                  </div>
                  {dir.staleReason && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {dir.staleReason}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-right">
                  {dir.fileCount}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-right">
                  {formatBytes(dir.totalSize)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-right">
                  {formatDistanceToNow(new Date(dir.modified), { addSuffix: true })}
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {format(new Date(dir.modified), 'MMM dd, yyyy HH:mm')}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  {dir.hasConfig ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 dark:text-green-400 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : ''}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex justify-center items-center relative tooltip-container">
                    {dir.isActive ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    {dir.isActive && (
                      <span className="tooltip">
                        {dir.containsModelFiles && dir.isReferencedInDB 
                          ? "Contains model files and referenced in database"
                          : dir.containsModelFiles 
                            ? "Contains model files"
                            : "Referenced in database"
                        }
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  <div className="flex justify-center space-x-2">
                    {/* Regular Delete Button */}
                    <button 
                      onClick={() => openDeleteConfirm(dir)}
                      disabled={dir.isActive}
                      className={`${dir.isActive ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'text-red-600 dark:text-red-500 hover:text-red-900 dark:hover:text-red-400'}`}
                      title={dir.isActive ? "Cannot delete active model directory" : "Delete directory"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {/* Purge Button - Show for directories with model files but not in DB OR stale DB entries */}
                    {((dir.containsModelFiles && !dir.isReferencedInDB) || dir.type === 'stale_db_entry') && (
                      <button 
                        onClick={() => openPurgeConfirm(dir)}
                        className="text-orange-600 dark:text-orange-500 hover:text-orange-900 dark:hover:text-orange-400 tooltip-container"
                        title={dir.type === 'stale_db_entry' ? "Purge stale database entry" : "Force delete directory with model files"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="tooltip">
                          {dir.type === 'stale_db_entry' ? "Purge stale database entry" : "Purge - Force delete directory with model files"}
                        </span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ModelDirectories;
