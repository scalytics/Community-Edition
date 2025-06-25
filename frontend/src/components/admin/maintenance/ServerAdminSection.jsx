import React from 'react';
import PropTypes from 'prop-types';

const ServerAdminSection = ({ 
  restartServerProcessing, 
  restartError, 
  openRestartConfirm 
}) => {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-dark-text-primary">Server Administration</h2>
        <div className="flex space-x-2">
          <button 
            onClick={openRestartConfirm}
            disabled={restartServerProcessing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-gray-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Restart Server
          </button>
        </div>
      </div>
      
      {/* Restart server alerts */}
      {restartError && (
        <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300 p-4 mb-4" role="alert">
          <p>{restartError}</p>
        </div>
      )}
      
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6 mb-6">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0 pt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Server Management</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Use these controls to manage the server. Restarting the server will temporarily disconnect all users and may take a few seconds to complete.
            </p>
          </div>
        </div>
        
        <div className="mt-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400 dark:text-yellow-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-200">
                  <strong>Important:</strong> After restoring a database backup, you should restart the server for the changes to take full effect.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

ServerAdminSection.propTypes = {
  restartServerProcessing: PropTypes.bool.isRequired,
  restartError: PropTypes.string,
  openRestartConfirm: PropTypes.func.isRequired
};

export default ServerAdminSection;
