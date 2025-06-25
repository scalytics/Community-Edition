import React from 'react';
import PropTypes from 'prop-types';

const BackupUploadSection = ({
  uploadFile,
  uploadError,
  uploadValidationError,
  uploadProgress,
  handleFileChange,
  handleUploadBackup,
  formatFileSize
}) => {
  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6 mt-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Upload Backup</h3>
      </div>
      
      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 border-l-4 border-blue-500 dark:border-blue-600 text-gray-700 dark:text-gray-300 mb-4">
        <p className="text-sm flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span>
            Upload a database backup file (.db) created by this system. File must start with "mcp-db-backup-".
          </span>
        </p>
      </div>
      
      {uploadValidationError && (
        <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300 p-4 mb-4" role="alert">
          <p>{uploadValidationError}</p>
        </div>
      )}
      
      {uploadError && (
        <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-600 text-red-700 dark:text-red-300 p-4 mb-4" role="alert">
          <p>{uploadError}</p>
        </div>
      )}
      
      <div className="space-y-4">
        {/* File Input with Border */}
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <input
            id="backupFileInput"
            type="file"
            accept=".db"
            onChange={handleFileChange}
            disabled={uploadProgress}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300
              hover:file:bg-blue-100 dark:hover:file:bg-blue-800/30"
          />
          {uploadFile && !uploadValidationError && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              Selected file: {uploadFile.name} ({formatFileSize(uploadFile.size)})
            </p>
          )}
        </div>
        
        {/* Upload Button - Separate Row */}
        <div className="flex justify-start">
          <button
            onClick={handleUploadBackup}
            disabled={!uploadFile || uploadProgress || !!uploadValidationError}
            className={`px-6 py-2 rounded-md font-medium ${
              !uploadFile || uploadProgress || uploadValidationError
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800'
            }`}
          >
            {uploadProgress ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </span>
            ) : (
              'Upload Backup'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

BackupUploadSection.propTypes = {
  uploadFile: PropTypes.object,
  uploadError: PropTypes.string,
  uploadValidationError: PropTypes.string,
  uploadProgress: PropTypes.bool.isRequired,
  handleFileChange: PropTypes.func.isRequired,
  handleUploadBackup: PropTypes.func.isRequired,
  formatFileSize: PropTypes.func.isRequired
};

export default BackupUploadSection;
