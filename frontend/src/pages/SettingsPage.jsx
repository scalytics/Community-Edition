import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import ProfileSettings from '../components/settings/ProfileSettings';
import ApiKeyManager from '../components/settings/ApiKeyManager';
import ThemeSettings from '../components/settings/ThemeSettings';
import TransparencySettings from '../components/settings/TransparencySettings'; 
import authService from '../services/auth'; 
import modelService from '../services/modelService'; 

const SettingsPage = () => {
  const { section = 'profile' } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isScalaPromptEnforcedForDefault, setIsScalaPromptEnforcedForDefault] = useState(false); 
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        setIsScalaPromptEnforcedForDefault(false); 

        const profileResponse = await authService.getProfile();
        let currentUser = null;
        if (profileResponse && profileResponse.data) {
          currentUser = profileResponse.data;
        } else if (profileResponse && profileResponse.success && profileResponse.user) {
          currentUser = profileResponse.user;
        } else if (profileResponse && typeof profileResponse === 'object' && !Array.isArray(profileResponse)) {
          currentUser = profileResponse;
        } else {
          throw new Error('Failed to load user profile');
        }
        setUser(currentUser);

        const defaultModelId = currentUser?.settings?.default_model_id;
        if (defaultModelId) {
          try {
            const modelDetails = await modelService.getModelById(defaultModelId);
            if (modelDetails && typeof modelDetails.enable_scala_prompt === 'boolean') {
              setIsScalaPromptEnforcedForDefault(modelDetails.enable_scala_prompt);
            }
          } catch (modelErr) {
            console.warn(`Could not fetch details for default model ${defaultModelId}:`, modelErr.message);
          }
        }

      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const tabs = [
    { name: 'Profile', id: 'profile' },
    { name: 'API Keys', id: 'api-keys' },
    { name: 'Appearance', id: 'appearance' },
    { name: 'Transparency', id: 'transparency' } 
  ];

  const handleTabChange = (tabId) => {
    navigate(`/settings/${tabId}`);
  };

  // Callback for when settings are updated in child components
  const handleSettingsUpdate = (partialSettingsUpdate) => {
    setUser(prevUser => {
      if (!prevUser) return null; 
      return {
        ...prevUser,
        settings: {
          ...(prevUser.settings || {}), 
          ...partialSettingsUpdate 
        }
      };
    });
  };


  return (
    <Sidebar>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-text-primary">Settings</h1>
          
          <div className="py-4">
            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`
                      whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                      ${section === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                        : 'border-transparent text-gray-500 dark:text-dark-text-secondary hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-gray-600'}
                    `}
                  >
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>
            
            {/* Error display */}
            {error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Content based on selected tab */}
            <div className="mt-4">
              {loading ? (
                <div className="animate-pulse p-4 space-y-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                  </div>
                </div>
              ) : (
                <>
                  {section === 'profile' && (
                    <ProfileSettings 
                      user={user} 
                      onProfileUpdated={setUser} 
                    />
                  )}
                  
                  {section === 'api-keys' && user && ( // Ensure user data is loaded
                    <ApiKeyManager canGenerate={user.canGenerateApiKeys} />
                  )}
                  
                  {section === 'appearance' && (
                    // Pass user settings and update handler to ThemeSettings if needed
                    <ThemeSettings
                      user={user}
                      onSettingsChange={handleSettingsUpdate} // Assuming ThemeSettings might also update settings
                      onError={setError}
                     />
                  )}

                  {section === 'transparency' && user?.settings && ( // Check for correct section ID
                    <TransparencySettings // Use correct component name
                      userSettings={user.settings} // Pass the settings object
                      isScalaPromptEnforced={isScalaPromptEnforcedForDefault} // Pass the enforcement status
                      onSettingsChange={handleSettingsUpdate} // Pass the update handler
                      onError={setError} // Pass the error handler
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default SettingsPage;
