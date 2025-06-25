import React, { useState } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';

const ResetPasswordModal = ({ user, onClose, onSuccess, onError }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    try {
      setIsResetting(true);
      
      // Check if OAuth is enabled first using integrationService
      let isOAuthEnabled = false;
      try {
        const integrationService = (await import('../../../services/integrationService')).default;
        const authConfig = await integrationService.getAuthConfig();
        
        // Check for entries in authConfig (this now directly contains OAuth providers as keys)
        isOAuthEnabled = Object.keys(authConfig).length > 0;
        // console.log('[ResetPasswordModal] Auth config:', authConfig);
        // console.log('[ResetPasswordModal] OAuth enabled?', isOAuthEnabled);
      } catch (err) {
        console.warn('Failed to check OAuth status, continuing anyway:', err);
        // Continue as if OAuth is not enabled
      }
      
      // Special handling for non-admin users when OAuth is enabled
      if (isOAuthEnabled && !user.isAdmin) {
        onError('Password reset is not available for regular users when OAuth is enabled. Users should log in via OAuth provider.');
        setIsResetting(false);
        setIsConfirming(false);
        onClose();
        return;
      }
      
      // Call the service function directly
      const response = await adminService.resetUserPassword(user.id);
      
      // The service function now handles response parsing, link extraction, and email content generation.
      // It returns a consistent structure including success status, message, data (with link), and needsFallbackUI flag.
      
      if (response.success) {
        // Pass the success message and the entire response object back
        onSuccess(response.message || `Password reset for ${user.username}. Registration link has been sent.`, response);
        onClose(); // Close the modal on success
      } else {
        // Extract error message from the response
        const errorMessage = response.message || 
                            response.error || 
                            (response.data && response.data.message) ||
                            'Failed to reset password';
        
        console.error('Password reset failed:', errorMessage, response);
        onError(errorMessage);
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      // Extract error message from the caught error object
      const errorMessage = error.message || 
                          (error.response && error.response.data && error.response.data.message) ||
                          'An error occurred while resetting the password';
      onError(errorMessage);
    } finally {
      setIsResetting(false);
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed z-20 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 sm:mx-0 sm:h-10 sm:w-10">
                {/* Warning icon */}
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
                  {isConfirming ? 'Confirm Password Reset' : 'Reset User Password'}
                </h3>
                <div className="mt-2">
                  {isConfirming ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Are you sure you want to reset password for <strong className="dark:text-gray-300">{user.username}</strong>? 
                      This will invalidate their current password and send them a new registration link.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      This will reset the password for <strong className="dark:text-gray-300">{user.username}</strong> and send them a new registration link 
                      to set a new password. Their current password will no longer work.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${
                isConfirming ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
              } text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isConfirming ? 'focus:ring-red-500 dark:focus:ring-offset-gray-800' : 'focus:ring-blue-500 dark:focus:ring-offset-gray-800'
              } sm:ml-3 sm:w-auto sm:text-sm ${
                isResetting ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {isResetting ? 'Resetting...' : (isConfirming ? 'Yes, Reset Password' : 'Reset Password')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isResetting}
              className={`mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm ${
                isResetting ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

ResetPasswordModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    username: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired
};

export default ResetPasswordModal;
