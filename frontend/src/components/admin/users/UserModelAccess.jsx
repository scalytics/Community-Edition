import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import apiService from '../../../services/apiService';

const UserModelAccess = ({ userId, username }) => {
  const [loading, setLoading] = useState(true);
  const [modelAccess, setModelAccess] = useState({});
  const [error, setError] = useState('');

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const modelAccessResponse = await apiService.get(`/admin/users/${userId}/models`);
      
      setModelAccess(modelAccessResponse.data || {});

    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to load user model access: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchUserData();
    }
  }, [userId, fetchUserData]);

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const providerNames = Object.keys(modelAccess);

  return (
    <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Model Access for {username}</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            View model access.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {providerNames.length === 0 ? (
        <div className="px-4 py-5 sm:p-6 text-center text-gray-500 dark:text-gray-400">
          No models available for access control
        </div>
      ) : (
        <div>
          {providerNames.map(provider => (
            <div key={provider} className="border-t border-gray-200 dark:border-dark-border">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{provider} Enabled Models</h4>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.isArray(modelAccess[provider]) ? (
                    modelAccess[provider].map(model => (
                      <div
                        key={model.id}
                        className={`
                          relative rounded-lg px-6 py-5 shadow-sm flex items-center space-x-3
                          ${model.can_access
                            ? 'border-2 border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                            : 'border-2 border-red-300 bg-white dark:bg-dark-primary dark:border-red-700'
                          }
                        `}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{model.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {model.can_access ? 'Access Granted' : 'No Access'}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center text-gray-500 dark:text-gray-400">
                      No models enabled for {username} from this provider
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

UserModelAccess.propTypes = {
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  username: PropTypes.string.isRequired
};

export default UserModelAccess;
