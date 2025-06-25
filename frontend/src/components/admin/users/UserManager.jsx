import React, { useState, useEffect } from 'react'; 
import adminService from '../../../services/adminService';
import integrationService from '../../../services/integrationService';
import { useDebounce } from '../../../hooks/useDebounce';
// eslint-disable-next-line no-unused-vars
import UserModelAccess from './UserModelAccess';
import UserTable from './UserTable';
import UserDetailModal from './UserDetailModal';
import UserRegistrationModal from './UserRegistrationModal';
import CopyLinkModal from './CopyLinkModal';
import PermissionErrorMessage from '../common/PermissionErrorMessage';
import ModernAlert from '../../common/ModernAlert';

const UserManager = () => {
  const [users, setUsers] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [activeOAuthProvider, setActiveOAuthProvider] = useState(null);
  const [/*loadingProviders*/, setLoadingProviders] = useState(true);
  const [showModelAccess, setShowModelAccess] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [creatingUser, setCreatingUser] = useState(false); 
  const [registrationStatus, setRegistrationStatus] = useState('idle'); 
  const [registrationLink, setRegistrationLink] = useState('');
  const [emailContent, setEmailContent] = useState({ subject: '', body: '' });
  const [showCopyLinkModal, setShowCopyLinkModal] = useState(false); 
  const [linkCopied, setLinkCopied] = useState(false);
  const [inputSearchTerm, setInputSearchTerm] = useState(''); 
  const debouncedInputSearchTerm = useDebounce(inputSearchTerm, 500); 
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 10,
    offset: 0,
    searchTerm: '', 
  });
  
  useEffect(() => {
    setPagination(prev => ({
      ...prev,
      searchTerm: debouncedInputSearchTerm,
      offset: 0 
    }));
  }, [debouncedInputSearchTerm]);

  // Single Effect for fetching users based on pagination state
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError('');

        const params = {
          limit: pagination.limit,
          offset: pagination.offset, 
        };
        if (pagination.searchTerm) { 
          params.search = pagination.searchTerm;
        }

        const response = await adminService.getUsers(params);
        const usersArray = response?.data || [];
        const totalCount = response?.total || 0;

        setUsers(usersArray);
        setPagination(prev => ({
          ...prev,
          total: totalCount,
        }));
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    // This effect runs whenever limit, offset, search term, or the trigger changes
  }, [pagination.limit, pagination.offset, pagination.searchTerm, refreshTrigger]);


  // Fetch active OAuth providers on component mount
  useEffect(() => {
    const fetchOAuthProviders = async () => {
      try {
        setLoadingProviders(true);
        const response = await integrationService.getAuthConfig();

        if (response && Object.keys(response).length > 0) {
          // Find the first enabled provider
          // Priority order: GitHub, Google, Microsoft, Azure AD, Okta
          const providerPriority = ['github', 'google', 'microsoft', 'azure_ad', 'okta'];
          let firstEnabledProvider = null;
          for (const provider of providerPriority) {
            if (response[provider]) {
              firstEnabledProvider = provider;
              break;
            }
          }

          // If we found a provider, set it as active
          if (firstEnabledProvider) {
            setActiveOAuthProvider({
              provider: firstEnabledProvider,
              displayName: getProviderDisplayName(firstEnabledProvider)
            });
          } else {
            setActiveOAuthProvider(null);
          }
        } else {
          setActiveOAuthProvider(null);
        }
      } catch (error) {
        console.error('Error fetching OAuth providers:', error);
        setActiveOAuthProvider(null);
      } finally {
        setLoadingProviders(false);
      }
    };

    fetchOAuthProviders();
  }, []);

  // Convert provider ID to display name
  const getProviderDisplayName = (provider) => {
    const displayNames = {
      github: 'GitHub',
      google: 'Google',
      microsoft: 'Microsoft',
      azure_ad: 'Azure AD',
      okta: 'Okta'
    };

    return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const handleToggleModelAccess = () => {
    setShowModelAccess(!showModelAccess);
  };

  // Handle user selection for details view
  const handleUserSelect = async (userId) => {
    try {
      setSelectedUser({ id: userId, loading: true });

      const response = await adminService.getUser(userId);

      let userData;

      if (response?.data && typeof response.data === 'object') {
        userData = response.data.data || response.data;
      } else if (typeof response === 'object') {
        userData = response;
      } else {
        throw new Error('Unexpected response format');
      }

      // Ensure we have a valid user object
      if (!userData || typeof userData !== 'object') {
        throw new Error('Invalid user data received');
      }

      setSelectedUser(userData);
      setShowUserModal(true);
    } catch (err) {
      console.error('Error fetching user details:', err);
      setError(`Failed to load details for user ID ${userId}: ${err.message}`);
      setSelectedUser(null);
    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user ${username}? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await adminService.deleteUser(userId);

      // Close modal if the deleted user was selected
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(null);
        setShowUserModal(false);
      }
      // Explicit refetch block removed - refresh is handled by trigger

      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(null);
        setShowUserModal(false);
      }

      setSuccess(`User ${username} deleted successfully`);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(`Failed to delete user ${username}`);
    } finally {
      // setLoading(false) is handled within the explicit refetch block which should be removed now
    }
  };

  const handleToggleAdmin = async (userId, username, currentStatus) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await adminService.updateUser(userId, {
        isAdmin: !currentStatus
      });

      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({
          ...selectedUser,
          isAdmin: !currentStatus
        });
      }
      // Explicit refetch block removed - refresh is handled by trigger

      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({
          ...selectedUser,
          isAdmin: !currentStatus 
        });
      }

      setSuccess(`User ${username} admin status updated successfully`);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh
    } catch (err) {
      console.error('Error updating user admin status:', err);
      setError(`Failed to update admin status for ${username}`);
    } finally {
      // setLoading(false) is handled within the explicit refetch block which should be removed now
    }
  };

  const copyRegistrationLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      const textArea = document.createElement('textarea');
      textArea.value = registrationLink;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (e) {
        console.error('Fallback: Could not copy text: ', e);
      }
      document.body.removeChild(textArea);
    }
  };

  const copyEmailContent = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (e) {
        console.error('Fallback: Could not copy text: ', e);
      }
      document.body.removeChild(textArea);
    }
  };

  // Pagination controls
  const handlePreviousPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit) 
    }));
  };

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit 
    }));
  };

  const handleSearchChange = (e) => {
    setInputSearchTerm(e.target.value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000); 

      return () => clearTimeout(timer);
    }
  }, [error]);

  // Function to reset registration state, called when closing the modal after success/error
  const resetRegistrationState = () => {
    setRegistrationStatus('idle');
    setNewUserEmail('');
    setNewUsername('');
    setError('');
  };

  const handleRegisterUser = async () => {
    setError(''); 
    setSuccess(''); 
    if (!newUserEmail || !newUsername) {
      setError('Email and username are required');
      setRegistrationStatus('error'); 
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      setError('Please enter a valid email address');
      setRegistrationStatus('error'); 
      return;
    }

    setCreatingUser(true);
    setRegistrationStatus('sending'); 
    try {
      const rawResponse = await adminService.registerUser({
        email: newUserEmail,
        username: newUsername
      });

      let response;

      if (rawResponse?.data) {
        response = rawResponse.data;
      } else {
        response = rawResponse;
      }

      // Check if registration was successful
      // Look for success indicator in different possible locations
      const isSuccess = response.success ||
                        response.status === 'success' ||
                        response.status === 200 ||
                        rawResponse.status === 200 ||
                        Boolean(response.registrationLink) || 
                        (response.data && Boolean(response.data.registrationLink)) || 
                        Boolean(rawResponse.registrationLink) || 
                        (rawResponse.data && Boolean(rawResponse.data.registrationLink)); 

      if (isSuccess) {
        let link = '';
        let email = { subject: '', body: '' };

        // Check common locations based on isSuccess logic and potential structures
        if (response?.data?.registrationLink) {
          link = response.data.registrationLink;
        } else if (response?.registrationLink) {
          link = response.registrationLink;
        } else if (rawResponse?.data?.registrationLink) {
           link = rawResponse.data.registrationLink;
        } else if (rawResponse?.registrationLink) {
           link = rawResponse.registrationLink;
        }

        // Similar safe access for emailContent
        if (response?.emailContent) {
           email = response.emailContent;
        } else if (rawResponse?.emailContent) {
           email = rawResponse.emailContent;
        } else if (response?.data?.emailContent) {
           email = response.data.emailContent;
        } else if (rawResponse?.data?.emailContent) {
           email = rawResponse.data.emailContent;
        }

        if (link) {
          setRegistrationLink(link);
          setEmailContent(email);
          setSuccess(`User ${newUsername} registered successfully. Registration link sent to ${newUserEmail}.`);
          setRegistrationStatus('success');
          setRefreshTrigger(prev => prev + 1); // Trigger refresh
        } else {
           console.error('Registration reported success, but registrationLink not found in expected locations:', rawResponse);
           setError('Registration succeeded but failed to retrieve the link.');
           setRegistrationStatus('error'); 
         }

       } else { 
         const errorMessage = response.message ||
                             response.error ||
                            (response.data && response.data.message) ||
                            'Failed to register user';

        console.error('Registration failed:', errorMessage);
        setError(errorMessage);
        setRegistrationStatus('error'); 
      }
    } catch (err) {
      console.error('Error registering user:', err);
      const errorMessage = err.message ||
                          (err.response && err.response.data && err.response.data.message) ||
                          'An error occurred during registration';
      setError(errorMessage);
      setRegistrationStatus('error');
    } finally {
      setCreatingUser(false); 
    }
  };

  return (
    <div>
      {/* Status messages - only show if no modal is open */}
      {error && error === 'Failed to load users' ? (
        <PermissionErrorMessage resourceType="users" error={error} />
      ) : (error && !showRegisterModal && !showUserModal) ? (
        <div className="mb-4">
          <ModernAlert
            type="error"
            message={error}
            onDismiss={() => setError('')}
          />
        </div>
      ) : null}

      {success && (
        <div className="mb-4">
          <ModernAlert
            type="success"
            message={success}
            onDismiss={() => setSuccess('')}
          />
        </div>
      )}

      {/* Users table */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex justify-between items-start mb-4"> {/* Top row for title and buttons */}
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Users</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              {activeOAuthProvider
                ? `User management handled by ${activeOAuthProvider.displayName} authentication`
                : 'Manage system users and permissions'}
              </p>

              {activeOAuthProvider && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-dark-text-primary text-xs rounded-md">
                  <p className="flex items-center">
                    <svg className="h-4 w-4 mr-1 text-blue-500 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>
                      External authentication active. Users are managed through {activeOAuthProvider.displayName}.
                      New users will be automatically created on first login.
                    </span>
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center flex-shrink-0"> {/* Buttons aligned to the right */}
              {!activeOAuthProvider && (
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 mr-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Register User
                </button>
              )}
              <span className="ml-4 text-sm text-gray-700 dark:text-gray-300"> 
                {users.length > 0 ? (
                  `Showing ${pagination.offset + 1}-${Math.min(pagination.offset + users.length, pagination.total)} of ${pagination.total}`
                ) : (
                  'No users found'
                )}
              </span>
            </div>
          </div>

          {/* Search Input Row */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by username or email..."
              value={inputSearchTerm} 
              onChange={handleSearchChange} 
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-dark-text-secondary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Use user table component */}
          <UserTable
            users={users}
            loading={loading}
            formatDate={formatDate}
            handleUserSelect={handleUserSelect}
            handleToggleAdmin={handleToggleAdmin}
            handleDeleteUser={handleDeleteUser}
          />

          {/* Pagination */}
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-dark-border sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={handlePreviousPage}
                disabled={pagination.offset === 0}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md bg-white dark:bg-gray-700 ${pagination.offset === 0
                  ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md bg-white dark:bg-gray-700 ${pagination.offset + pagination.limit >= pagination.total
                  ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing{' '}
                  <span className="font-medium">{users.length > 0 ? pagination.offset + 1 : 0}</span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.offset + users.length, pagination.total)}
                  </span>{' '}
                  of <span className="font-medium">{pagination.total}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={handlePreviousPage}
                    disabled={pagination.offset === 0}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium ${pagination.offset === 0
                      ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={pagination.offset + pagination.limit >= pagination.total}
                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium ${pagination.offset + pagination.limit >= pagination.total
                      ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>

        {/* User Details Modal */}
        {showUserModal && selectedUser && (
          <UserDetailModal
            selectedUser={selectedUser}
            showModelAccess={showModelAccess}
            handleToggleModelAccess={handleToggleModelAccess}
            formatDate={formatDate}
            setShowUserModal={setShowUserModal}
            setRegistrationLink={setRegistrationLink}
            setShowCopyLinkModal={setShowCopyLinkModal}
            setSuccess={setSuccess}
            setSelectedUser={setSelectedUser}
            setLoading={setLoading}
            setError={setError}
            loading={loading}
            adminService={adminService}
          />
        )}

        {/* Register User Modal */}
        {showRegisterModal && (
          <UserRegistrationModal
            newUsername={newUsername}
            setNewUsername={setNewUsername}
            newUserEmail={newUserEmail}
            setNewUserEmail={setNewUserEmail}
            handleRegisterUser={handleRegisterUser}
            creatingUser={creatingUser}
            showRegisterModal={showRegisterModal}
            setShowRegisterModal={setShowRegisterModal} 
            error={error} 
            setError={setError} 
            success={success} 
            registrationStatus={registrationStatus} 
            resetRegistrationState={resetRegistrationState} 
            registrationLink={registrationLink} 
            emailContent={emailContent} 
          />
        )}

        {/* Modal for copying registration link */}
        {showCopyLinkModal && (
          <CopyLinkModal
            linkCopied={linkCopied}
            registrationLink={registrationLink}
            copyRegistrationLink={copyRegistrationLink}
            emailContent={emailContent}
            copyEmailContent={copyEmailContent}
            setShowCopyLinkModal={setShowCopyLinkModal}
          />
        )}
      </div> 
    </div> 
  );
};

export default UserManager;
