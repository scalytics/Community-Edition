import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';
import githubService from '../../services/githubService';
import GitHubInfoBanner from './GitHubInfoBanner';
import GitHubPanel from './GitHubPanel';

/**
 * Component to handle GitHub integration in the chat view
 * @param {Object} props Component props
 * @param {Object} ref Reference for parent components to access functions
 * @returns {JSX.Element} GitHub integration component
 */
const GitHubIntegration = forwardRef(({ chatId, githubFiles, setGithubFiles }, ref) => {
  const [showGithubPanel, setShowGithubPanel] = useState(false);

  // Function to toggle GitHub panel
  const handleToggleGithubPanel = useCallback(() => {
    setShowGithubPanel(!showGithubPanel);
  }, [showGithubPanel]);

  // Handle GitHub authentication success
  const handleGitHubAuthSuccess = useCallback(() => {
    if (!chatId) return;
    
    githubService.getChatGithubFiles(chatId).then(response => {
      setGithubFiles(response.data || []);
    });
  }, [chatId, setGithubFiles]);

  // Handle refreshing GitHub files
  const handleRefreshFiles = useCallback(() => {
    if (!chatId) return;
    
    githubService.getChatGithubFiles(chatId).then(response => {
      setGithubFiles(response.data || []);
    });
  }, [chatId, setGithubFiles]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    showGithubPanel,
    handleToggleGithubPanel,
    handleGitHubAuthSuccess,
    // Add accessible methods here
    togglePanel: handleToggleGithubPanel
  }));

  return (
    <>
      {/* GitHub Banner - only shown when there are files */}
      {githubFiles.length > 0 && (
        <GitHubInfoBanner 
          githubFiles={githubFiles} 
          onViewFiles={() => setShowGithubPanel(true)} 
        />
      )}

      {/* GitHub Panel */}
      <GitHubPanel 
        show={showGithubPanel}
        onClose={() => setShowGithubPanel(false)}
        chatId={chatId}
        onAddFile={handleRefreshFiles}
      />
    </>
  );
});

GitHubIntegration.propTypes = {
  chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  githubFiles: PropTypes.array.isRequired,
  setGithubFiles: PropTypes.func.isRequired
};

export default GitHubIntegration;
