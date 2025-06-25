import React from 'react';
import PropTypes from 'prop-types';
import GithubContentList from '../github/GithubContentList';

const GitHubPanel = ({ show, onClose, chatId, onAddFile }) => {
  if (!show) {
    return null;
  }
  
  return (
    <div className="fixed top-0 right-0 bottom-0 w-72 bg-white dark:bg-dark-primary border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto z-10">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-medium text-gray-800 dark:text-dark-text-primary">GitHub Files</h3>
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          aria-label="Close GitHub panel"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="h-full">
        <GithubContentList 
          chatId={chatId} 
          onAddFile={onAddFile} 
        />
      </div>
    </div>
  );
};

GitHubPanel.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onAddFile: PropTypes.func.isRequired
};

export default GitHubPanel;
