import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import githubService from '../services/githubService';

const GitHubCallback = () => {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const connectGitHub = async () => {
      try {
        // Get code from URL search params
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get('code');
        
        if (!code) {
          throw new Error('No authorization code provided');
        }
        
        // Connect GitHub account using the code
        const response = await githubService.connectAccount(code);
        
        if (response.success) {
          setStatus('success');
          
          // Redirect back after a short delay
          // Notify the opener window about successful authentication
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              type: 'github-auth-success',
              message: 'GitHub authentication successful'
            }, window.location.origin);
          }
          
          setTimeout(() => {
            // Try to extract return path from state or go to dashboard
            const returnPath = localStorage.getItem('githubReturnPath') || '/dashboard';
            localStorage.removeItem('githubReturnPath'); // Clean up
            
            // If opened in a popup, close it after success
            if (window.opener) {
              window.close();
            } else {
              // Otherwise navigate
              navigate(returnPath);
            }
          }, 2000);
        } else {
          throw new Error(response.message || 'Failed to connect GitHub account');
        }
      } catch (err) {
        console.error('GitHub connection error:', err);
        setStatus('error');
        setError(err.message || 'An error occurred while connecting your GitHub account');
      }
    };

    connectGitHub();
  }, [location, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            GitHub Integration
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {status === 'processing' && 'Connecting your GitHub account...'}
            {status === 'success' && 'Successfully connected your GitHub account!'}
            {status === 'error' && 'Failed to connect your GitHub account.'}
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <div className="flex flex-col items-center justify-center text-center">
            {status === 'processing' && (
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
            )}
            
            {status === 'success' && (
              <div className="text-green-500 mb-4">
                <svg className="h-16 w-16 mx-auto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-lg font-medium">GitHub account connected successfully!</p>
                <p className="text-sm text-gray-500 mt-2">You will be redirected automatically...</p>
              </div>
            )}
            
            {status === 'error' && (
              <div className="text-red-500 mb-4">
                <svg className="h-16 w-16 mx-auto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-lg font-medium">Connection Error</p>
                <p className="text-sm text-gray-700 mt-2">{error}</p>
              </div>
            )}
            
            {status === 'error' && (
              <button
                onClick={() => navigate('/chat')}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Return to Chats
              </button>
            )}
          </div>
        </div>
        
        {/* GitHub logo at bottom */}
        <div className="mt-10 flex justify-center">
          <svg className="h-10 w-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default GitHubCallback;
