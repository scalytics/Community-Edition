import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import authService from '../../services/authService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext'; 

const ThemeSettings = ({ user: initialUser }) => { 
  const { theme, updateTheme } = useTheme();
  const { user, updateUser } = useAuth(); 
  const [currentTheme, setCurrentTheme] = useState(user?.settings?.theme || initialUser?.settings?.theme || theme);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Update state when user prop changes
  useEffect(() => {
    if (user?.settings) {
      setCurrentTheme(user.settings.theme || theme);
    }
  }, [user, theme]);

  const themes = [
    { id: 'light', name: 'Light', icon: SunIcon },
    { id: 'dark', name: 'Dark', icon: MoonIcon },
    { id: 'system', name: 'System', icon: ComputerIcon }
  ];

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await authService.updateSettings({
        theme: currentTheme
      });

      if (response.success && response.data?.user) {
        setSuccess('Settings saved successfully');

        updateUser(response.data.user);
        updateTheme(currentTheme);

      } else if (response.success) {
        setSuccess('Settings saved successfully');
        setSuccess('Settings saved successfully');
        updateTheme(currentTheme); 

        if (user) { 
            const updatedUser = {
                ...user, 
                settings: {
                    ...user.settings, 
                    theme: currentTheme 
                }
            };
            updateUser(updatedUser); 
        } else {
        }
      } else {
        throw new Error(response.message || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err.message || 'An error occurred while saving settings');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Theme selection */}
      <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Appearance</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            <p>Choose how Scalytics Connect looks to you. Select a theme or use your system settings.</p>
          </div>
          
          <div className="mt-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleThemeChange(theme.id)}
                  className={`
                    flex items-center px-4 py-3 border rounded-md focus:outline-none
                    ${currentTheme === theme.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-600 dark:border-blue-500 text-blue-700 dark:text-blue-400'
                      : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}
                  `}
                >
                  <theme.icon
                    className={`h-6 w-6 mr-2 ${
                      currentTheme === theme.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  />
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save button and status messages */}
      <div className="flex justify-end">
        {success && (
          <div className="mr-4 flex items-center text-sm text-green-600 dark:text-green-400">
            <svg className="h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </div>
        )}
        
        {error && (
          <div className="mr-4 flex items-center text-sm text-red-600 dark:text-red-400">
            <svg className="h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500 ${
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
            'Save settings'
          )}
        </button>
      </div>
    </div>
  );
};

ThemeSettings.propTypes = {
  // Use initialUser prop name
  initialUser: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    settings: PropTypes.shape({
      theme: PropTypes.string
      // private_mode removed since it's been replaced by admin global privacy mode
    })
  })
};

// Theme icons
function SunIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function ComputerIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

export default ThemeSettings;
