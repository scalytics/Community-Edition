import React from 'react';
import PropTypes from 'prop-types';
import MaintenanceSectionHeader from './MaintenanceSectionHeader';
import MaintenanceAlert from './MaintenanceAlert';

const DirectoryActions = ({ 
  modelDirectories, 
  loading, 
  error, 
  success, 
  cleanupConfirmOpen, 
  cleanupProcessing, 
  setCleanupConfirmOpen, 
  handleRefresh
}) => {
  return (
    <div className="mb-6">
      <MaintenanceSectionHeader title="Model Maintenance">
        {modelDirectories.length > 0 && (
          <button 
            onClick={() => setCleanupConfirmOpen(true)}
            disabled={loading || cleanupProcessing}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Cleanup All
          </button>
        )}
        
        <button 
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </MaintenanceSectionHeader>
      
      {/* Alerts */}
      {error && <MaintenanceAlert type="error" message={error} />}
      {success && <MaintenanceAlert type="success" message={success} />}
      
      {/* Loading indicator */}
      {loading && (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 dark:border-blue-400"></div>
        </div>
      )}
    </div>
  );
};

DirectoryActions.propTypes = {
  modelDirectories: PropTypes.array.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  success: PropTypes.string,
  cleanupConfirmOpen: PropTypes.bool.isRequired,
  cleanupProcessing: PropTypes.bool.isRequired,
  setCleanupConfirmOpen: PropTypes.func.isRequired,
  handleRefresh: PropTypes.func.isRequired
};

export default DirectoryActions;
