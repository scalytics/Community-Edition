import React, { useState } from 'react';
import PropTypes from 'prop-types';
import authService from '../../services/authService';
import UserAvatar from './UserAvatar';

const ProfileSettings = ({ user, onProfileUpdated }) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  
  // Handle avatar updates
  const handleAvatarUpdate = (updatedUser) => {
    if (onProfileUpdated) {
      onProfileUpdated(updatedUser);
    }
    setSuccess('Avatar updated successfully');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    if (formData.newPassword) {
      if (!formData.currentPassword) {
        newErrors.currentPassword = 'Current password is required to set a new password';
      }
      
      if (formData.newPassword.length < 6) {
        newErrors.newPassword = 'Password must be at least 6 characters long';
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setSuccess('');
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setSaving(true);
      
      // Prepare data to update - only send password if changed
      const updateData = {};
      
      // Username and Email are read-only, no need to check/send
      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.password = formData.newPassword;
      }
      
      // Only save if there are changes
      if (Object.keys(updateData).length === 0) {
        setSuccess('No changes to save');
        setSaving(false);
        return;
      }
      
      const response = await authService.updateSettings(updateData);
      
      if (response.success) {
        const profileResponse = await authService.getProfile();
        
        if (profileResponse.success && profileResponse.data) {
          if (onProfileUpdated) {
            onProfileUpdated(profileResponse.data);
          }
          
          setFormData(prev => ({
            ...prev,
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          }));
          
          setSuccess('Profile updated successfully');
        }
      } else {
        throw new Error(response.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setErrors({
        form: error.message || 'Failed to update profile'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Profile Settings</h3>
          </div>
          <div>
            <UserAvatar 
              user={user} 
              size="lg" 
              editable={true} 
              onAvatarUpdate={handleAvatarUpdate} 
            />
          </div>
        </div>
        
        {success && (
          <div className="mt-4 p-4 rounded-md bg-green-50 dark:bg-green-900/20 border dark:border-green-800">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-400">{success}</p>
              </div>
            </div>
          </div>
        )}
        
        {errors.form && (
          <div className="mt-4 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border dark:border-red-800">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-400">{errors.form}</p>
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-5 space-y-6" onSubmit={handleSubmit}>
          {/* Profile section */}
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                Username
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  name="username"
                  id="username"
                  value={formData.username}
                  onChange={handleChange}
                  readOnly // Make username read-only
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-primary rounded-md read-only:bg-gray-100 dark:read-only:bg-gray-800 read-only:cursor-not-allowed"
                />
                {/* Error display for username might be less relevant now */}
                {errors.username && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.username}</p>
                )}
              </div>
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleChange}
                  readOnly // Make email read-only
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-primary rounded-md read-only:bg-gray-100 dark:read-only:bg-gray-800 read-only:cursor-not-allowed"
                />
                {/* Error display for email might be less relevant now */}
                {errors.email && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Password section */}
          <div className="border-t border-gray-200 dark:border-dark-border pt-5">
            <h4 className="text-md font-medium text-gray-900 dark:text-dark-text-primary">Change Password</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
              Leave the fields blank if you don't want to change your password.
            </p>
            
            <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  Current Password
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    name="currentPassword"
                    id="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-primary rounded-md"
                  />
                  {errors.currentPassword && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.currentPassword}</p>
                  )}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  New Password
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    name="newPassword"
                    id="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-primary rounded-md"
                  />
                  {errors.newPassword && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.newPassword}</p>
                  )}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  Confirm New Password
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    name="confirmPassword"
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-dark-border dark:bg-gray-700 dark:text-dark-text-primary rounded-md"
                  />
                  {errors.confirmPassword && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5">
            <div className="flex justify-end">
              <button
                type="button"
                className="bg-white dark:bg-gray-700 py-2 px-4 border border-gray-300 dark:border-dark-border rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500"
                onClick={() => {
                  // Reset form to original values
                  setFormData({
                    username: user?.username || '',
                    email: user?.email || '',
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  });
                  setErrors({});
                  setSuccess('');
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500 ${
                  saving ? 'opacity-75 cursor-not-allowed' : ''
                }`}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

ProfileSettings.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    username: PropTypes.string,
    email: PropTypes.string,
    isAdmin: PropTypes.bool
  }),
  onProfileUpdated: PropTypes.func
};

export default ProfileSettings;
