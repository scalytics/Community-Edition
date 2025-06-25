import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import authService from '../../services/authService';
import { getBaseUrl } from '../../services/apiService'; // Import getBaseUrl

/**
 * Component for displaying and managing a user's avatar
 * @param {Object} props - Component props
 * @param {Object} props.user - User data including avatar information
 * @param {boolean} props.editable - Whether the avatar can be changed
 * @param {Function} props.onAvatarUpdate - Callback when avatar is updated
 * @param {string} props.size - Size of the avatar (sm, md, lg)
 */
const UserAvatar = ({ user, editable = false, onAvatarUpdate, size = 'md' }) => {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false); // State for delete operation
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  
  // Size classes based on the size prop
  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-24 w-24',
    lg: 'h-32 w-32'
  };
  
  // Handle opening the file dialog
  const handleOpenFileDialog = () => {
    if (editable && !uploading) {
      fileInputRef.current?.click();
    }
  };
  
  // Handle avatar upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }
    
    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setError('Image must be smaller than 1MB');
      return;
    }
    
    try {
      setUploading(true);
      setError('');
      
      // Create FormData for the upload
      const formData = new FormData();
      formData.append('avatar', file);
      
      // Upload avatar via the auth service
      // Assuming authService.uploadAvatar returns { success: true, data: { avatarPath: '...' } }
      const response = await authService.uploadAvatar(formData);

      if (response.success && response.data?.avatarPath) {
        // Call the callback with the updated user data, specifically the new avatar path
        if (onAvatarUpdate) {
          onAvatarUpdate({
            ...user,
            avatar: response.data.avatarPath // Update the 'avatar' field
          });
        }
      } else {
        throw new Error(response.message || 'Failed to upload avatar');
      }
    } catch (err) {
      console.error('Error uploading avatar:', err); // Keep critical log
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // Generate initials from user's name or username
  const getInitials = () => {
    if (!user) return '?';
    
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    
    if (user.name) {
      // Split by spaces and get first letter of each part
      return user.name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    
    return '?';
  };

  // Handle image errors
  const handleImageError = (e) => {
    // Hide the image and show initials if loading fails
    e.target.style.display = 'none';
    const initialsSpan = e.target.nextElementSibling;
    if (initialsSpan) {
      initialsSpan.style.display = 'flex'; // Ensure initials are displayed
    }
  };

  // Handle avatar deletion
  const handleDeleteAvatar = async () => {
    if (!user?.avatar || deleting) return; // Only allow delete if avatar exists and not already deleting

    if (!window.confirm('Are you sure you want to delete your custom avatar?')) {
      return;
    }

    try {
      setDeleting(true);
      setError('');
      const response = await authService.deleteAvatar();

      if (response.success) {
        // The service function handles localStorage update and reload
        // Optionally update parent state if needed, though reload makes it less critical
        if (onAvatarUpdate) {
          onAvatarUpdate({ ...user, avatar: null });
        }
      } else {
        throw new Error(response.message || 'Failed to delete avatar');
      }
    } catch (err) {
      console.error('Error deleting avatar:', err);
      setError(err.message || 'Failed to delete avatar');
    } finally {
      setDeleting(false);
    }
  };

  // Define the path for the default avatar
  const defaultAvatarPath = '/assets/default-robot-avatar.svg';

  // Construct the full URL for custom avatar or use default path
  const backendBaseUrl = getBaseUrl().replace('/api', ''); // Remove /api suffix if present
  const customAvatarSrc = user?.avatar ? `${backendBaseUrl}${user.avatar}` : null;
  const finalAvatarSrc = customAvatarSrc || defaultAvatarPath; // Use custom if available, else default

  return (
    <div className="flex flex-col items-center">
      <div 
        className={`relative ${sizeClasses[size] || sizeClasses.md} rounded-full overflow-hidden ${
          editable ? 'cursor-pointer' : ''
        } bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center text-white font-medium border-2 border-white dark:border-gray-800 shadow-sm`}
        onClick={handleOpenFileDialog}
        title={editable ? "Click to change avatar" : ""}
      >
        {/* Always render img, src will be custom or default */}
        <img
          key={finalAvatarSrc} // Use final path as key
          src={finalAvatarSrc} // Use custom or default path
          alt={`${user?.username || 'User'}'s avatar`}
          className="h-full w-full object-cover"
          onError={handleImageError} // Use the simplified error handler
        />
        {/* Always render initials span, control visibility with style */}
        <span
          className={`absolute inset-0 flex items-center justify-center text-lg ${
            size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-xl'
          }`}
          // Show initials only if the final src (custom or default) fails to load (handled by onError)
          style={{ display: 'none' }} // Initially hidden, shown by onError
        >
          {getInitials()}
        </span>
        
        {editable && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-opacity flex items-center justify-center">
            <div className="hidden group-hover:block text-white text-xs font-medium">
              {uploading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
          disabled={uploading}
        />
      </div>
      
      {editable && (
        <button
          type="button"
          onClick={handleOpenFileDialog}
          disabled={uploading}
          className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {user?.avatar ? 'Change' : 'Change'}
        </button>
      )}
      {/* Add Delete button only if editable and a custom avatar exists */}
      {editable && user?.avatar && (
        <button
          type="button"
          onClick={handleDeleteAvatar}
          disabled={deleting || uploading}
          className={`mt-1 text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 ${deleting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      )}
      
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};

UserAvatar.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    username: PropTypes.string,
    email: PropTypes.string,
    avatar: PropTypes.string, // Changed from avatarUrl
    firstName: PropTypes.string,
    lastName: PropTypes.string,
    name: PropTypes.string
  }),
  editable: PropTypes.bool,
  onAvatarUpdate: PropTypes.func,
  size: PropTypes.oneOf(['sm', 'md', 'lg'])
};

export default UserAvatar;
