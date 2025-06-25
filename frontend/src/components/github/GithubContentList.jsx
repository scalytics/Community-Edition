import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import githubService from '../../services/githubService';

const GithubContentList = ({ chatId, onAddFile }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [contents, setContents] = useState([]);
  const [addedFiles, setAddedFiles] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'root', path: '' }]);
  
  // Function to check GitHub connection status and fetch repositories
  const checkGithubConnection = useCallback(async () => {
    try {
      setLoading(true);
      const status = await githubService.getConnectionStatus();
      setIsConnected(status.connected);
      
      if (status.connected) {
        // Fetch repositories if connected
        const repos = await githubService.getRepositories();
        setRepositories(repos.data || []);
      }
    } catch (err) {
      console.error('Error checking GitHub connection:', err);
      setError('Failed to connect to GitHub');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if GitHub is connected on component mount
  useEffect(() => {
    checkGithubConnection();
  }, [checkGithubConnection]);

  // Load added files for the current chat
  useEffect(() => {
    const fetchAddedFiles = async () => {
      if (chatId) {
        try {
          const response = await githubService.getChatGithubFiles(chatId);
          setAddedFiles(response.data || []);
        } catch (err) {
          console.error('Error fetching added GitHub files:', err);
        }
      }
    };

    fetchAddedFiles();
  }, [chatId]);

  // Load repository contents when repo or path changes
  useEffect(() => {
    const fetchContents = async () => {
      if (selectedRepo) {
        try {
          setLoading(true);
          const [owner, repo] = selectedRepo.full_name.split('/');
          const response = await githubService.getRepositoryContent(owner, repo, currentPath);
          setContents(response.data || []);
          setError('');
        } catch (err) {
          console.error('Error fetching repository contents:', err);
          setError('Failed to load repository contents');
        } finally {
          setLoading(false);
        }
      }
    };

    if (selectedRepo) {
      fetchContents();
    }
  }, [selectedRepo, currentPath]);

  // Handle GitHub login
  const handleGithubLogin = () => {
    // Store current path for redirect after GitHub auth
    localStorage.setItem('githubReturnPath', window.location.pathname);
    
    // Get GitHub client ID from environment variable
    const clientId = process.env.REACT_APP_GITHUB_CLIENT_ID;
    if (!clientId) {
      alert('GitHub Client ID is not configured. Please add REACT_APP_GITHUB_CLIENT_ID to your environment variables.');
      return;
    }
    
    // Open GitHub OAuth in a popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const redirectUri = `${window.location.origin}/github/callback`;
    const scope = 'repo';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    
    // Open the popup and store the reference
    const popup = window.open(
      authUrl,
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      alert('Popup blocked! Please allow popups for this site to connect with GitHub.');
      return;
    }
    
    // Set up a listener for messages from the popup
    window.addEventListener('message', function(event) {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'github-auth-success') {
        // Refresh connection status and repositories
        checkGithubConnection();
      }
    }, { once: true });
  };

  // Handle repository selection
  const handleRepoSelect = (repo) => {
    setSelectedRepo(repo);
    setCurrentPath('');
    setBreadcrumbs([{ name: 'root', path: '' }]);
  };

  // Handle folder navigation
  const handleNavigate = (item) => {
    if (item.type === 'dir') {
      setCurrentPath(item.path);
      setBreadcrumbs([
        ...breadcrumbs,
        { name: item.name, path: item.path }
      ]);
    }
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = (index) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    setCurrentPath(newBreadcrumbs[index].path);
  };

  // Handle adding a file to chat context
  const handleAddFile = async (item) => {
    if (item.type !== 'file') return;
    
    try {
      const [owner, repo] = selectedRepo.full_name.split('/');
      await githubService.addFileToChatContext(chatId, owner, repo, item.path, item.name);
      
      // Refresh added files
      const response = await githubService.getChatGithubFiles(chatId);
      setAddedFiles(response.data || []);
      
      if (onAddFile) {
        onAddFile(item);
      }
    } catch (err) {
      console.error('Error adding file to chat:', err);
      alert('Failed to add file to chat');
    }
  };

  // Handle removing a file from chat context
  const handleRemoveFile = async (fileId) => {
    try {
      await githubService.removeFileFromChatContext(chatId, fileId);
      
      // Refresh added files
      setAddedFiles(prev => prev.filter(file => file.id !== fileId));
    } catch (err) {
      console.error('Error removing file from chat:', err);
      alert('Failed to remove file from chat');
    }
  };

  if (loading && !isConnected) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">GitHub Files</h3>
          <p className="mt-1 text-sm text-gray-500">Connect your GitHub account to add files to this chat.</p>
        </div>
        <button
          onClick={handleGithubLogin}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-700"
        >
          <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
          Connect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">GitHub Files</h3>
        <p className="text-sm text-gray-500">Add files from your repositories</p>
      </div>
      
      {/* Added files section */}
      {addedFiles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-blue-50">
          <h4 className="text-sm font-medium text-blue-800">Added to this chat</h4>
          <ul className="mt-1 space-y-1">
            {addedFiles.map((file) => (
              <li key={file.id} className="flex items-center justify-between text-xs">
                <span className="truncate flex-1" title={file.file_path}>
                  <span className="font-medium">{file.file_name}</span>
                </span>
                <button
                  onClick={() => handleRemoveFile(file.id)}
                  className="ml-2 text-red-500 hover:text-red-700"
                  title="Remove from chat"
                >
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Repository selector */}
      {!selectedRepo ? (
        <div className="p-4 flex-1 overflow-auto">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select a repository</label>
          <div className="space-y-1 max-h-full">
            {repositories.map((repo) => (
              <button
                key={repo.id}
                onClick={() => handleRepoSelect(repo)}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="font-medium">{repo.full_name}</div>
                {repo.description && (
                  <div className="text-xs text-gray-500 truncate">{repo.description}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumbs */}
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-sm flex items-center overflow-x-auto">
            <button
              onClick={() => setSelectedRepo(null)}
              className="text-blue-600 hover:text-blue-800 flex-shrink-0 mr-2"
              title="Back to repositories"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex items-center flex-shrink-0 overflow-x-auto">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  {index > 0 && <span className="mx-1 text-gray-500">/</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`hover:underline ${
                      index === breadcrumbs.length - 1 ? 'font-medium' : ''
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
          
          {/* File browser */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              </div>
            ) : error ? (
              <div className="text-center text-red-500 p-4">{error}</div>
            ) : contents.length === 0 ? (
              <div className="text-center text-gray-500 p-4">This directory is empty</div>
            ) : (
              <div className="space-y-1">
                {contents.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md group"
                  >
                    <button
                      onClick={() => handleNavigate(item)}
                      className="flex items-center flex-1 text-sm truncate"
                      disabled={item.type !== 'dir'}
                    >
                      {item.type === 'dir' ? (
                        <svg className="h-5 w-5 mr-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 mr-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="truncate">{item.name}</span>
                    </button>
                    
                    {item.type === 'file' && (
                      <button
                        onClick={() => handleAddFile(item)}
                        className="ml-2 text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Add to chat"
                      >
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

GithubContentList.propTypes = {
  chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onAddFile: PropTypes.func
};

export default GithubContentList;
