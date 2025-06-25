import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import Logo from './Logo';
import { useAuth } from '../../contexts/AuthContext';
import { useDownloadStatus } from '../../contexts/DownloadStatusContext';
import { getBaseUrl } from '../../services/apiService'; 

// Simple Spinner
const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDownloading } = useDownloadStatus(); 
  const { user, isAdmin, permissions, logout, loading, isAuthenticated } = useAuth(); 
  const dropdownRef = useRef(null);
  const navigate = useNavigate(); 

  const canAccessAdmin = isAdmin || (permissions && permissions.includes('access_admin'));

  useEffect(() => {
    const handleClickOutside = (event) => {
      const toggleButton = document.getElementById('user-menu-button');
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        (!toggleButton || !toggleButton.contains(event.target))
       ) {
         setMenuOpen(false);
      }
    };

    if (menuOpen) {
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);


  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const handleLogout = () => {
    logout(); 
    navigate('/login');
  };

  const defaultAvatarPath = '/assets/default-robot-avatar.svg';
  const backendBaseUrl = getBaseUrl().replace('/api', ''); 
  const customAvatarSrc = user?.avatar ? `${backendBaseUrl}${user.avatar}` : null;
  const finalAvatarSrc = customAvatarSrc || defaultAvatarPath; 

  return (
    <nav className="bg-white dark:bg-dark-primary shadow-sm fixed top-0 w-full z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center">
                <div className="flex-shrink-0 flex items-center justify-center" style={{ height: '40px' }}>
                  <Link to="/" className="block">
                    <Logo size="sm" asLink={false} />
                  </Link>
                </div>
                <div className="ml-2 flex items-center">
                  <span className="text-lg font-bold text-[#DD6B20]">Scalytics</span>
                  <span className="ml-1 text-lg font-bold text-gray-800 dark:text-dark-text-secondary">Connect - Community Edition</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Show loading indicator or user section */}
          {loading ? (
             <div className="flex items-center justify-center h-full">
               <Spinner /> {/* Or some other placeholder */}
             </div>
          ) : isAuthenticated && user && ( // Check isAuthenticated and user
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              {/* Download Indicator with fade transition */}
              <div
                className={`mr-4 transition-opacity duration-500 ease-in-out ${isDownloading ? 'opacity-100' : 'opacity-0'}`} 
                title="Download in progress..."
              >
                <Spinner />
              </div>
              <div className="flex space-x-4">
                <Link
                  to="/dashboard"
                  className="text-gray-700 dark:text-dark-text-primary hover:text-gray-900 dark:hover:text-dark-text-primary px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </Link>
                
                {/* Use canAccessAdmin for conditional rendering */}
                {canAccessAdmin && (
                  <Link 
                    to="/admin" 
                    className="text-gray-700 dark:text-dark-text-primary hover:text-gray-900 dark:hover:text-dark-text-primary px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Admin
                  </Link>
                )}
              </div>
              
              <div className="ml-3 relative">
                <div>
                  <button
                    type="button"
                    className="flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                    id="user-menu-button"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                    onClick={toggleMenu}
                  >
                    <span className="sr-only">Open user menu</span>
                    {/* Always render img, src will be custom or default */}
                    <img
                      key={finalAvatarSrc} 
                      src={finalAvatarSrc} 
                      alt={`${user?.username || 'User'}'s avatar`}
                      className="h-8 w-8 rounded-full object-cover"
                        onError={(e) => { 
                          e.target.style.display = 'none';
                          const initialsDiv = e.target.nextElementSibling;
                          if(initialsDiv) initialsDiv.style.display = 'flex';
                        }}
                      />
                    {/* Always render initials span, control visibility with style */}
                    <div
                      className={`absolute inset-0 h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium`}
                      style={{ display: 'none' }} // Initially hidden, shown by onError
                    >
                      {user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  </button>
                </div>

                {menuOpen && (
                  <div
                    ref={dropdownRef} 
                    className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-dark-secondary ring-1 ring-black ring-opacity-5 focus:outline-none z-50 border dark:border-dark-border"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu-button"
                  >
                    <div className="px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary border-b dark:border-dark-border">
                      <p className="font-medium">{user?.username || 'User'}</p>
                    </div>
                    <Link
                      to="/settings"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Settings
                    </Link>
                    <button
                      className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded="false"
              onClick={toggleMenu}
            >
              <span className="sr-only">Open main menu</span>
              {menuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && user && (
        <div className="sm:hidden absolute w-full bg-white dark:bg-dark-primary shadow-md z-40">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/dashboard"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-dark-text-primary"
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </Link>
            
            {/* Use canAccessAdmin for conditional rendering in mobile menu */}
            {canAccessAdmin && (
              <Link
                to="/admin"
                className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-dark-text-primary"
                onClick={() => setMenuOpen(false)}
              >
                Admin
              </Link>
            )}
            
            <Link
              to="/settings"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-dark-text-primary"
              onClick={() => setMenuOpen(false)}
            >
              Settings
            </Link>
            
            <button
              onClick={handleLogout}
              className="w-full text-left block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-dark-text-primary"
            >
              Sign out
            </button>
          </div>
          
          <div className="pt-4 pb-3 border-t border-gray-200 dark:border-dark-border">
            <div className="flex items-center px-4">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              </div>
              <div className="ml-3">
                <div className="text-base font-medium text-gray-800 dark:text-dark-text-primary">{user?.username || 'User'}</div>
                <div className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary">{user?.email || ''}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
