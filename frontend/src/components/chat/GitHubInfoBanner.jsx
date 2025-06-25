import React from 'react';
import PropTypes from 'prop-types';

const GitHubInfoBanner = ({ githubFiles, onViewFiles }) => {
  if (githubFiles.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800 px-4 py-2 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between max-w-6xl mx-auto w-full">
      <div className="flex items-center">
        <svg className="h-5 w-5 mr-2 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>
          {githubFiles.length} GitHub file{githubFiles.length !== 1 ? 's' : ''} added to this chat
        </span>
      </div>
      <button
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
        onClick={onViewFiles}
      >
        View Files
      </button>
    </div>
  );
};

GitHubInfoBanner.propTypes = {
  githubFiles: PropTypes.array.isRequired,
  onViewFiles: PropTypes.func.isRequired
};

export default GitHubInfoBanner;
