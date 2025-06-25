import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../../services/apiService';
import { toast } from 'react-toastify';

const HuggingFaceLogin = () => {
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const checkTokenStatus = useCallback(async () => {
    try {
      const response = await apiService.get('/admin/huggingface/token-status');
      if (response.success) {
        setHasToken(response.hasToken);
      }
    } catch (error) {
      console.error("Failed to check token status", error);
    }
  }, []);

  useEffect(() => {
    checkTokenStatus();
  }, [checkTokenStatus]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error('Please enter a Hugging Face API token.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await apiService.post('/admin/huggingface/login', { token });
      if (response.success) {
        toast.success('Successfully logged in to Hugging Face!');
        setToken('');
        checkTokenStatus();
      } else {
        throw new Error(response.message || 'Failed to login.');
      }
    } catch (error) {
      toast.error(`Login failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteToken = async () => {
    setIsLoading(true);
    try {
      const response = await apiService.delete('/admin/huggingface/token');
      if (response.success) {
        toast.success('Hugging Face token deleted successfully.');
        checkTokenStatus();
      } else {
        throw new Error(response.message || 'Failed to delete token.');
      }
    } catch (error) {
      toast.error(`Failed to delete token: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg mt-6">
      <h3 className="text-lg font-semibold text-white mb-4">Hugging Face Hub Login</h3>
      {hasToken ? (
        <div>
          <p className="text-green-400 mb-4">
            A Hugging Face token is currently stored. You can now download gated models.
          </p>
          <button
            onClick={handleDeleteToken}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-500"
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete Token'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-gray-400 mb-4">
            For gated models, you need to be logged in. Please provide your Hugging Face API token with at least read access.
          </p>
          <form onSubmit={handleLogin}>
            <div className="flex items-center">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your Hugging Face Token"
                className="flex-grow bg-gray-700 text-white rounded-l-md p-2 border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-r-md disabled:bg-gray-500"
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default HuggingFaceLogin;
