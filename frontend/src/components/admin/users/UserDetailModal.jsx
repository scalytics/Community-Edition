import React, { useState } from 'react';
import UserModelAccess from './UserModelAccess';
import UserPermissions from './UserPermissions';
import ResetPasswordModal from './ResetPasswordModal';

const UserDetailModal = ({ 
  selectedUser,
  showModelAccess,
  handleToggleModelAccess,
  formatDate,
  setShowUserModal,
  setRegistrationLink,
  setShowCopyLinkModal,
  setSuccess,
  setSelectedUser,
  setLoading,
  setError,
  loading,
  adminService
}) => {
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [isPowerUser, setIsPowerUser] = useState(Boolean(selectedUser.is_power_user));
  
  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl w-full relative">
          <div className="bg-white dark:bg-dark-primary px-6 pt-6 pb-4 sm:p-8">
            <div className="flex items-start">
              <div className="w-full">
                <h3 className="text-2xl leading-6 font-bold text-gray-900 dark:text-dark-text-primary mb-6" id="modal-title">
                  User Details
                </h3>

                {selectedUser.loading ? (
                  <div className="animate-pulse mt-4 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                      <div className="flex flex-col items-center">
                        <div className="h-24 w-24 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white text-4xl mb-4">
                          {selectedUser.username ? selectedUser.username.charAt(0).toUpperCase() : '?'}
                        </div>
                        <h4 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary">{selectedUser.username || 'No Name'}</h4>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">{selectedUser.email || 'No Email'}</p>
                        
                        <div className="flex flex-col gap-2 items-center">
                          {selectedUser.status === 'pending' ? (
                            <span className="px-3 py-1 rounded-full text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                              Pending Activation
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <span className={`px-3 py-1 rounded-full text-sm ${selectedUser.isAdmin ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
                                {selectedUser.isAdmin ? 'Admin' : 'User'}
                              </span>
                              
                              {isPowerUser && !selectedUser.isAdmin && (
                                <span className="px-3 py-1 rounded-full text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                                  Power User
                                </span>
                              )}
                            </div>
                          )}
                          
                          {selectedUser.status === 'pending' && selectedUser.token_expiry && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <p>Registration link sent:</p>
                              <p className="font-medium dark:text-gray-300">{formatDate(selectedUser.token_created || selectedUser.created_at)}</p>
                              <p className="mt-1">Expires:</p>
                              <p className="font-medium dark:text-gray-300">{formatDate(selectedUser.token_expiry)}</p>
                            </div>
                          )}
                          
                          <div className="flex flex-col gap-2 mt-3">
                            {selectedUser.status === 'pending' && (
                              <button
                                onClick={async () => {
                                  try {
                                    setLoading(true);
                                    // Call the service function directly
                                    const response = await adminService.resendRegistrationLink(selectedUser.id);

                                    // Service handles response parsing, link extraction, email content, and needsFallbackUI flag
                                    if (response.success) {
                                      setSuccess(response.message || `Registration link resent to ${selectedUser.email}`);
                                      
                                      // Use the link provided by the service
                                      const registrationLink = response.data?.registrationLink;
                                      if (registrationLink) {
                                        setRegistrationLink(registrationLink);
                                      } else {
                                        // Fallback if service didn't provide link - construct dynamically
                                        const baseUrl = window.location.origin; // Use current origin
                                        const fallbackLink = `${baseUrl}/set-password?email=${encodeURIComponent(selectedUser.email)}`;
                                        setRegistrationLink(fallbackLink);
                                        console.warn("Service didn't return registrationLink on resend, using dynamic fallback.");
                                      }

                                      // Show copy modal if service indicates it's needed
                                      if (response.needsFallbackUI) {
                                        setShowCopyLinkModal(true);
                                      }

                                      // Refresh user data to show updated token expiry etc.
                                      try {
                                        const updatedUser = await adminService.getUser(selectedUser.id);
                                        if (updatedUser) {
                                          setSelectedUser(updatedUser);
                                        }
                                      } catch (updateErr) {
                                        console.error('Error updating user data after resend:', updateErr);
                                        // Non-critical, proceed without updated data
                                      }
                                    } else {
                                      // Handle failure based on service response
                                      const errorMessage = response.message || response.error || 'Failed to resend link';
                                      console.error('Resend link failed:', errorMessage, response);
                                      setError(errorMessage);
                                    }
                                  } catch (err) {
                                    console.error('Error resending link:', err);
                                    const errorMessage = err.message || (err.response?.data?.message) || 'Failed to resend registration link';
                                    setError(errorMessage);
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                                disabled={loading} // Disable button while loading
                              >
                                {loading ? 'Resending...' : 'Resend Invitation'}
                              </button>
                            )}
                            
                            <button
                              onClick={() => setShowResetPasswordModal(true)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-yellow-600 dark:bg-yellow-700 hover:bg-yellow-700 dark:hover:bg-yellow-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 dark:focus:ring-offset-gray-800"
                            >
                              Reset Password
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      {/* Tabs navigation */}
                      <div className="border-b border-gray-200 dark:border-dark-border">
                        <nav className="-mb-px flex space-x-8">
                            <button
                              onClick={() => setActiveTab('profile')}
                              className={`
                                ${activeTab === 'profile'
                                  ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                            >
                              Profile & Statistics
                            </button>
                            
                            <button
                              onClick={() => setActiveTab('model-access')}
                              className={`
                                ${activeTab === 'model-access'
                                  ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                            >
                              Model Access
                            </button>
                            
                            {selectedUser.isAdmin === false && (
                              <button
                                onClick={() => setActiveTab('permissions')}
                                className={`
                                  ${activeTab === 'permissions'
                                    ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                  } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
                                >
                                  Permissions
                                </button>
                          )}
                        </nav>
                      </div>
                      
                      {/* Tab content */}
                      <div className="mt-6 space-y-6">
                      {activeTab === 'profile' && (
                        <>
                          <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-5">
                            <h5 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Usage Statistics</h5>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Chats</p>
                                <p className="text-2xl font-bold text-gray-800 dark:text-dark-text-primary">{selectedUser.statistics?.chatCount || 0}</p>
                              </div>
                              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tokens</p>
                                <p className="text-2xl font-bold text-gray-800 dark:text-dark-text-primary">
                                  {(selectedUser.statistics?.tokensInput || 0) + (selectedUser.statistics?.tokensOutput || 0)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {selectedUser.modelUsage && selectedUser.modelUsage.length > 0 && (
                            <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-5">
                              <h5 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Model Usage</h5>
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr className="bg-gray-50 dark:bg-dark-secondary text-gray-500 dark:text-gray-400">
                                      <th className="py-3 px-4 text-left">Model</th>
                                      <th className="py-3 px-4 text-right">Tokens</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedUser.modelUsage.map((usage, index) => (
                                      <tr key={index} className="border-b dark:border-dark-border last:border-b-0 hover:bg-gray-50 dark:hover:bg-dark-secondary">
                                        <td className="py-3 px-4 dark:text-gray-300">{usage.name}</td>
                                        <td className="py-3 px-4 text-right font-medium dark:text-gray-300">
                                          {usage.tokens_output + usage.tokens_input}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-5">
                            <h5 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Recent Activity</h5>
                            {selectedUser.recentActivity && selectedUser.recentActivity.length > 0 ? (
                              <ul className="divide-y dark:divide-dark-border">
                                {selectedUser.recentActivity.slice(0, 5).map((activity, index) => (
                                  <li key={index} className="py-3 hover:bg-gray-50 dark:hover:bg-dark-secondary px-2 -mx-2 rounded">
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-300">{activity.action}</h3>
                                        {activity.details && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activity.details}</p>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(activity.created_at)}</p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity found</p>
                            )}
                          </div>
                        </>
                      )}
                      
                      {activeTab === 'model-access' && (
                        <UserModelAccess 
                          userId={selectedUser.id} 
                          username={selectedUser.username} 
                        />
                      )}
                      
                      {activeTab === 'permissions' && !selectedUser.isAdmin && (
                        <UserPermissions 
                          userId={selectedUser.id}
                          username={selectedUser.username}
                          isPowerUser={isPowerUser}
                          onStatusChange={setIsPowerUser}
                        />
                      )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 sm:px-8 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setShowUserModal(false)}
              className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      
      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => setShowResetPasswordModal(false)}
          onSuccess={(message, response) => { // Updated signature
            setSuccess(message);
            setShowResetPasswordModal(false);
            
            // Use link and fallback flag from the service response object
            const registrationLink = response?.data?.registrationLink;
            if (registrationLink) {
              setRegistrationLink(registrationLink);
            } else {
               // Fallback if service didn't provide link - construct dynamically
               const baseUrl = window.location.origin; // Use current origin
               const fallbackLink = `${baseUrl}/set-password?email=${encodeURIComponent(selectedUser.email)}`;
               setRegistrationLink(fallbackLink);
               console.warn("Service didn't return registrationLink on password reset, using dynamic fallback.");
            }

            // Show copy modal if service indicates it's needed
            if (response?.needsFallbackUI) {
              setShowCopyLinkModal(true);
            }
          }}
          onError={setError}
        />
      )}
    </div>
  );
};

export default UserDetailModal;
