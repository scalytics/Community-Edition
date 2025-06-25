import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import apiService from '../services/apiService'; 
import { AUTH_ENDPOINTS } from '../services/auth/constants';
import socketService from '../services/socketService'; 

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]); 
  const [loading, setLoading] = useState(true); 

  // Function to initialize user state from localStorage or fetch profile
  const initializeAuth = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (token) {
      // Also try to load permissions from localStorage
      const storedPermissions = localStorage.getItem('permissions');
      
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          if (storedPermissions) {
            setPermissions(JSON.parse(storedPermissions));
          }
        } catch (e) {
          console.error("Failed to parse stored user/permissions:", e);
          localStorage.removeItem('user');
          localStorage.removeItem('permissions'); 
        }
      } else {
        try {
          // Fetch profile which includes permissions
          const response = await apiService.get(AUTH_ENDPOINTS.PROFILE);
          if (response.success && response.data) {
            const userData = response.data;
            localStorage.setItem('user', JSON.stringify(userData)); 
            localStorage.setItem('permissions', JSON.stringify(userData.permissions || [])); 
            setUser(userData);
            setPermissions(userData.permissions || []);
          } else {
            console.warn("Token found but profile fetch failed. Logging out.");
            logout(); 
          }
        } catch (error) {
          console.error("Error fetching profile on init:", error);
          logout(); 
        }
      }
    } else {
      setUser(null);
      setPermissions([]); 
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]); 

  // Login function updates context state and localStorage, then fetches full profile for permissions
  const login = useCallback(async (userData, token) => {
    localStorage.setItem('token', token); 
    localStorage.setItem('user', JSON.stringify(userData)); 
    setUser(userData); 
    setPermissions([]); 

    // Fetch full profile to get permissions
    try {
      const response = await apiService.get(AUTH_ENDPOINTS.PROFILE);
      if (response.success && response.data) {
        const fullUserData = response.data;
        localStorage.setItem('user', JSON.stringify(fullUserData)); 
        localStorage.setItem('permissions', JSON.stringify(fullUserData.permissions || []));
        setUser(fullUserData); 
        setPermissions(fullUserData.permissions || []);

        // Notify backend about user association
        if (fullUserData && fullUserData.id && socketService.isConnected) {
          socketService.send('auth:associate_user', { userId: fullUserData.id });
        }
      } else {
        console.warn("Logged in, but failed to fetch full profile post-login.");
      }
    } catch (error) {
      console.error("Error fetching profile post-login:", error);
    }
  }, []);

  // Logout function clears context state and localStorage
  const logout = useCallback(() => {
    // Notify backend about user disassociation
    if (socketService.isConnected && user && user.id) { 
      socketService.send('auth:disassociate_user', { userId: user.id });
    }
    localStorage.removeItem('token'); 
    localStorage.removeItem('user');
    localStorage.removeItem('permissions'); 
    setUser(null);
    setPermissions([]); 
  }, [user]);

  // Function to update user data (e.g., after profile update or avatar change)
  // Also ensures permissions are updated if they are part of the updatedUserData
  const updateUser = useCallback((updatedUserData) => {
     localStorage.setItem('user', JSON.stringify(updatedUserData));
     setUser(updatedUserData);
     if (updatedUserData.hasOwnProperty('permissions')) {
       localStorage.setItem('permissions', JSON.stringify(updatedUserData.permissions || []));
       setPermissions(updatedUserData.permissions || []);
     }
  }, []);

  // Memoize the context value
  const value = React.useMemo(() => ({
    user,
    permissions, 
    isAuthenticated: !!user,
    isAdmin: user ? user.isAdmin : false,
    isPowerUser: user ? (user.isPowerUser || user.isAdmin) : false,
    loading,
    login,
    logout,
    updateUser,
    initializeAuth 
  }), [user, permissions, loading, login, logout, updateUser, initializeAuth]); 

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  if (context === null) {
      return { 
          user: null, 
          isAuthenticated: false, 
          isAdmin: false, 
          isPowerUser: false, 
          permissions: [], 
          loading: true, 
          login: () => {}, 
          logout: () => {}, 
          updateUser: () => {},
          initializeAuth: () => {}
      };
  }
  return context;
};
