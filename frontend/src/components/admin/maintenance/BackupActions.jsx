import React from 'react';
import PropTypes from 'prop-types';
import MaintenanceSectionHeader from './MaintenanceSectionHeader';
import MaintenanceAlert from './MaintenanceAlert';

const BackupActions = ({
  backupsLoading,
  backupProcessing,
  backupError,
  backupSuccess,
  createBackup,
  fetchBackups
}) => {
  return (
    <div className="mb-6">
      <MaintenanceSectionHeader title="Database Backups">
        <button 
          onClick={createBackup}
          disabled={backupProcessing}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h1a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h1v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
          </svg>
          Create Backup
        </button>
        
        <button 
          onClick={fetchBackups}
          disabled={backupsLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </MaintenanceSectionHeader>
      
      {/* Backup Alerts */}
      {backupError && <MaintenanceAlert type="error" message={backupError} />}
      {backupSuccess && <MaintenanceAlert type="success" message={backupSuccess} />}
      
      {/* Backup Loading indicator */}
      {backupsLoading && (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 dark:border-blue-400"></div>
        </div>
      )}
    </div>
  );
};

BackupActions.propTypes = {
  backupsLoading: PropTypes.bool.isRequired,
  backupProcessing: PropTypes.bool.isRequired,
  backupError: PropTypes.string,
  backupSuccess: PropTypes.string,
  createBackup: PropTypes.func.isRequired,
  fetchBackups: PropTypes.func.isRequired
};

export default BackupActions;
