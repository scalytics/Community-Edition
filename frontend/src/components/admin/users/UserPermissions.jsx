import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';

/**
 * Component for managing user permissions
 * 
 * @param {Object} props Component props
 * @param {string|number} props.userId The ID of the user
 * @param {string} props.username The name of the user
 * @param {boolean} [props.isPowerUser=false] Whether the user has power user status
 * @param {Function} [props.onStatusChange] Callback when power user status changes
 * @returns {JSX.Element} Rendered component
 */
const UserPermissions = ({ 
  userId, 
  username, 
  isPowerUser = false, 
  onStatusChange 
}) => {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [userPermissions, setUserPermissions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const allPermissionsResponse = await adminService.getAllPermissions();
        
        let availablePermissionsArray = [];
        
        const allPermissionsData = allPermissionsResponse?.data || allPermissionsResponse;
        
        if (Array.isArray(allPermissionsData)) {
          availablePermissionsArray = allPermissionsData;
        } else if (allPermissionsData?.data && Array.isArray(allPermissionsData.data)) {
          availablePermissionsArray = allPermissionsData.data;
        } else if (allPermissionsData?.permissions && Array.isArray(allPermissionsData.permissions)) {
          availablePermissionsArray = allPermissionsData.permissions;
        } else if (allPermissionsData?.items && Array.isArray(allPermissionsData.items)) {
          availablePermissionsArray = allPermissionsData.items;
        } else {
          console.error('Invalid permissions data format:', allPermissionsData);
          availablePermissionsArray = [];
        }
        
        setAvailablePermissions(availablePermissionsArray);
        
        const userPermissionsResponse = await adminService.getUserPermissions(userId);
        
        let userPermissionsArray = [];
        
        const userPermissionsData = userPermissionsResponse?.data || userPermissionsResponse;
        
        if (Array.isArray(userPermissionsData)) {
          userPermissionsArray = userPermissionsData;
        } else if (userPermissionsData?.data && Array.isArray(userPermissionsData.data)) {
          userPermissionsArray = userPermissionsData.data;
        } else if (userPermissionsData?.permissions && Array.isArray(userPermissionsData.permissions)) {
          userPermissionsArray = userPermissionsData.permissions;
        } else if (userPermissionsData?.items && Array.isArray(userPermissionsData.items)) {
          userPermissionsArray = userPermissionsData.items;
        } else {
          console.error('Invalid user permissions data format:', userPermissionsData);
          userPermissionsArray = [];
        }
        
        setUserPermissions(userPermissionsArray);
        
        if (userPermissionsResponse?.isPowerUser !== undefined && 
            userPermissionsResponse.isPowerUser !== isPowerUser && 
            onStatusChange) {
          onStatusChange(userPermissionsResponse.isPowerUser);
        }
        
        const permissionsList = availablePermissionsArray.map(permission => {
          const isGranted = userPermissionsArray.some(p => p.id === permission.id);
          
          return {
            ...permission,
            isGranted
          };
        });
        
        setPermissions(permissionsList);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError('Failed to load permissions data');
      } finally {
        setLoading(false);
      }
    };
    
    if (userId) {
      fetchData();
    }
  }, [userId, isPowerUser, onStatusChange]);

  const togglePermission = async (permissionId, isCurrentlyGranted) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      let response;
      
      if (isCurrentlyGranted) {
        response = await adminService.revokePermission(userId, permissionId);
        
        const isSuccess = 
          response?.success === true || 
          response?.data?.success === true ||
          (response?.status && [200, 201, 204].includes(response.status));
        
        if (isSuccess) {
          setSuccess(`Permission successfully revoked from ${username}`);
          
          // Update permissions state
          setPermissions(prevPermissions => 
            prevPermissions.map(p => p.id === permissionId ? {...p, isGranted: false} : p)
          );
          
          // Remove from user permissions
          setUserPermissions(prev => prev.filter(p => p.id !== permissionId));
        } else {
          const errorMsg = 
            response?.message || 
            response?.data?.message || 
            response?.error || 
            response?.data?.error ||
            'Failed to revoke permission';
          
          setError(errorMsg);
        }
      } else {
        // Grant permission
        response = await adminService.grantPermission(userId, permissionId);
        
        const isSuccess = 
          response?.success === true || 
          response?.data?.success === true ||
          (response?.status && [200, 201, 204].includes(response.status));
        
        if (isSuccess) {
          setSuccess(`Permission successfully granted to ${username}`);
          
          setPermissions(prevPermissions => 
            prevPermissions.map(p => p.id === permissionId ? {...p, isGranted: true} : p)
          );
          
          const permission = availablePermissions.find(p => p.id === permissionId);
          if (permission && !userPermissions.some(p => p.id === permissionId)) {
            setUserPermissions(prev => [...prev, {
              ...permission,
              granted_by_username: 'You', 
              granted_at: new Date().toISOString()
            }]);
          }
          
          try {
            const refreshResponse = await adminService.getUserPermissions(userId);
            
            let refreshedPermissions = [];
            
            if (Array.isArray(refreshResponse)) {
              refreshedPermissions = refreshResponse;
            } else if (refreshResponse?.data && Array.isArray(refreshResponse.data)) {
              refreshedPermissions = refreshResponse.data;
            } else if (refreshResponse?.data?.data && Array.isArray(refreshResponse.data.data)) {
              refreshedPermissions = refreshResponse.data.data;
            } else if (refreshResponse?.permissions && Array.isArray(refreshResponse.permissions)) {
              refreshedPermissions = refreshResponse.permissions;
            } else if (refreshResponse?.data?.permissions && Array.isArray(refreshResponse.data.permissions)) {
              refreshedPermissions = refreshResponse.data.permissions;
            }
            
            if (refreshedPermissions.length > 0) {
              setUserPermissions(refreshedPermissions);
            }
            
            if (refreshResponse.isPowerUser !== isPowerUser && onStatusChange) {
              onStatusChange(refreshResponse.isPowerUser);
            }
          } catch (refreshErr) {
            console.warn('Error refreshing permissions (non-fatal):', refreshErr);
          }
        } else {
          const errorMsg = 
            response?.message || 
            response?.data?.message || 
            response?.error || 
            response?.data?.error ||
            'Failed to grant permission';
          
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error('Error updating permission:', err);
      setError('Failed to update permission');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
          Permissions for {username}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Grant or revoke administrative capabilities
          </p>
        </div>
        
        <div className="flex items-center">
          <span className={`px-3 py-1 rounded-full text-sm ${
            isPowerUser 
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
          }`}>
            {isPowerUser ? 'Power User' : 'Regular User'}
          </span>
        </div>
      </div>
      
      {/* Status messages */}
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

      {success && (
        <div className="mx-4 mb-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400 dark:text-green-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Permissions List */}
      <div className="border-t border-gray-200 dark:border-dark-border">
        <ul className="divide-y divide-gray-200 dark:divide-dark-border">
          {permissions.map(permission => (
            <li key={permission.id} className={`px-4 py-4 sm:px-6 ${permission.isGranted ? 'bg-blue-50 dark:bg-blue-900/20' : ''} hover:bg-gray-50 dark:hover:bg-dark-secondary`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{permission.name}</h4>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{permission.description}</p>
                  {permission.isGranted && userPermissions.find(p => p.id === permission.id) && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Granted by {userPermissions.find(p => p.id === permission.id).granted_by_username} 
                      {' on '}
                      {new Date(userPermissions.find(p => p.id === permission.id).granted_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => togglePermission(permission.id, permission.isGranted)}
                    disabled={saving}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      permission.isGranted
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                    } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {permission.isGranted ? 'Revoke' : 'Grant'}
                  </button>
                </div>
              </div>
            </li>
          ))}
          
          {permissions.length === 0 && (
            <li className="px-4 py-5 sm:px-6 text-center text-gray-500 dark:text-gray-400">
              No permissions available.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

UserPermissions.propTypes = {
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  username: PropTypes.string.isRequired,
  isPowerUser: PropTypes.bool,
  onStatusChange: PropTypes.func
};

export default UserPermissions;
