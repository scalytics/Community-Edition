import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { systemService } from '../../../services/admin';

const DatabaseBackups = ({
  backups,
  backupsLoading,
  backupProcessing,
  restoreProcessing,
  openDeleteBackupConfirm,
  openRestoreBackupConfirm,
  handleDownloadBackup
}) => {
  if (backupsLoading) return null;
  
  if (!backups || backups.length === 0) {
    return (
      <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4 mt-4">
        <p>No database backups found. Click "Create Backup" to create your first backup.</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Available Backups</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          System automatically keeps up to 5 most recent backups
        </p>
        <div className="mt-2 p-2 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700">
          <p className="text-sm flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>
              <strong>Security Note:</strong> Database backups contain sensitive information. While user passwords are securely hashed, these backups should be stored in a secure location.
            </span>
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-secondary">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Backup File
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
            {backups && Array.isArray(backups) && backups.map((backup) => (
              <tr key={backup.fileName} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-dark-text-primary">
                  <span className="font-medium">{backup.fileName}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-right">
                  {systemService.formatFileSize(backup.size)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-right">
                  {formatDistanceToNow(new Date(backup.created), { addSuffix: true })}
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {format(new Date(backup.created), 'MMM dd, yyyy HH:mm')}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  <div className="flex justify-center space-x-4">
                    <button 
                      onClick={() => handleDownloadBackup(backup.fileName)}
                      disabled={backupProcessing || restoreProcessing}
                      className="text-blue-600 dark:text-dark-link hover:text-blue-900 dark:hover:text-blue-500"
                      title="Download backup"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => openRestoreBackupConfirm(backup)}
                      disabled={restoreProcessing || backupProcessing}
                      className="text-green-600 hover:text-green-900"
                      title="Restore backup"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => openDeleteBackupConfirm(backup)}
                      disabled={backupProcessing}
                      className="text-red-600 hover:text-red-900"
                      title="Delete backup"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
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

export default DatabaseBackups;
