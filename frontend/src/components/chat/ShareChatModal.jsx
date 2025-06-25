import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../services/apiService';
import eventBus from '../../utils/eventBus'; // Import eventBus
import { debounce } from 'lodash'; // Using lodash for debouncing search input

// Basic Modal structure (Replace with your actual common Modal component if available)
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-primary rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close modal"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};


const ShareChatModal = ({ isOpen, onClose, chatId, chatTitle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch current shares when modal opens or chatId changes
  useEffect(() => {
    if (isOpen && chatId) {
      const fetchShares = async () => {
        setIsLoadingShares(true);
        setError('');
        setSuccess('');
        try {
          const response = await apiService.getChatShares(chatId);
          setSharedUsers(response.data || []);
        } catch (err) {
          console.error('Error fetching chat shares:', err);
          setError(err.message || 'Failed to load current shares.');
          setSharedUsers([]);
        } finally {
          setIsLoadingShares(false);
        }
      };
      fetchShares();
      // Reset search when modal opens
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [isOpen, chatId]);

  // Debounced search function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!query || query.trim().length < 2) { // Minimum 2 chars to search
        setSearchResults([]);
        setIsLoadingSearch(false);
        return;
      }
      setIsLoadingSearch(true);
      setError('');
      try {
        const response = await apiService.searchUsers(query.trim());
        // Filter out users already shared with or pending
        const currentSharedIds = sharedUsers.map(u => u.id);
        const filteredResults = (response.data || []).filter(user => !currentSharedIds.includes(user.id));
        setSearchResults(filteredResults);
      } catch (err) {
        console.error('Error searching users:', err);
        setError(err.message || 'Failed to search users.');
        setSearchResults([]);
      } finally {
        setIsLoadingSearch(false);
      }
    }, 500), // 500ms debounce delay
    [sharedUsers] // Recreate debounce function if sharedUsers changes
  );

  const handleSearchChange = (e) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    setIsLoadingSearch(true); // Show loading immediately
    debouncedSearch(newSearchTerm);
  };

  // Invite a user
  const handleInviteUser = async (targetUserId) => {
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      // Send the user ID in the request body with the correct key
      await apiService.createShareInvitation(chatId, { shared_with_user_id: targetUserId });
      setSuccess('Share invitation sent successfully.');
      // Refresh shared users list
      const response = await apiService.getChatShares(chatId);
      setSharedUsers(response.data || []);
      // Clear search results for the invited user
      setSearchResults(prev => prev.filter(u => u.id !== targetUserId));
    } catch (err) {
      console.error('Error sending share invitation:', err);
      setError(err.message || 'Failed to send invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove a share (pending or active)
  const handleRemoveShare = async (targetUserId) => {
    if (!window.confirm('Are you sure you want to remove access for this user?')) {
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiService.removeShare(chatId, targetUserId);
      setSuccess('User access removed successfully.');
      // Publish event so ChatList can update the specific chat's shared status
      eventBus.publish('share:removed', { chatId }); 
      // Refresh shared users list locally in this modal
      setSharedUsers(prev => prev.filter(u => u.shared_with_user_id !== targetUserId)); // Ensure correct ID field is used for filtering local state
    } catch (err) {
      console.error('Error removing share:', err);
      setError(err.message || 'Failed to remove access.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share "${chatTitle || 'Chat'}"`}>
      {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md border dark:border-red-800">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md border dark:border-green-800">{success}</div>}

      {/* Search Section */}
      <div className="mb-6">
        <label htmlFor="userSearch" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Invite User
        </label>
        <input
          type="text"
          id="userSearch"
          placeholder="Search by username or email..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-dark-text-primary"
          disabled={isSubmitting}
        />
        {isLoadingSearch && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Searching...</div>}
        {/* Search Results */}
        {!isLoadingSearch && searchTerm.length > 1 && (
          <ul className="mt-2 border dark:border-gray-600 rounded-md max-h-40 overflow-y-auto">
            {searchResults.length > 0 ? (
              searchResults.map(user => (
                <li key={user.id} className="flex justify-between items-center p-2 border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div>
                    <span className="font-medium dark:text-dark-text-primary">{user.username}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">({user.email})</span>
                  </div>
                  <button
                    onClick={() => handleInviteUser(user.id)}
                    className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Invite
                  </button>
                </li>
              ))
            ) : (
              <li className="p-2 text-sm text-gray-500 dark:text-gray-400">No users found matching "{searchTerm}".</li>
            )}
          </ul>
        )}
      </div>

      {/* Shared Users List */}
      <div>
        <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-2">Shared With</h4>
        {isLoadingShares ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        ) : sharedUsers.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Not shared with anyone yet.</div>
        ) : (
          <ul className="space-y-2">
            {sharedUsers.map(user => (
              <li key={user.id} className="flex justify-between items-center p-2 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50">
                <div>
                  <span className="font-medium dark:text-dark-text-primary">{user.username}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">({user.email})</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {user.status}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveShare(user.shared_with_user_id)} // Use the correct user ID field
                  className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded disabled:opacity-50"
                  disabled={isSubmitting}
                  title={user.status === 'pending' ? 'Cancel Invitation' : 'Remove Access'}
                >
                  {user.status === 'pending' ? 'Cancel' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default ShareChatModal;
