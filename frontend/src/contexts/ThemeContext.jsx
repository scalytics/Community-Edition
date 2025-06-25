import React, { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [theme, setTheme] = useState('system'); 
  const [themeInitialized, setThemeInitialized] = useState(false); 

  // Function to ONLY set the theme state
  const applyThemeState = (selectedTheme) => {
    setTheme(selectedTheme);
  };

  useEffect(() => {
    if (!authLoading && !themeInitialized) {
      let initialTheme = 'system'; 
      if (user && user.settings?.theme) {
        initialTheme = user.settings.theme; 
      } else {
      }
      applyThemeState(initialTheme); 
      setThemeInitialized(true); 
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]); 

  useEffect(() => {
    if (!themeInitialized) {
      return;
    }

    const htmlElement = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const systemThemeListener = (e) => {
       if (theme === 'system') {
           htmlElement.classList.remove('dark');
           if (e.matches) {
             htmlElement.classList.add('dark');
           }
       }
    };

    if (theme === 'light') {
      htmlElement.classList.remove('dark');
    } else if (theme === 'dark') {
      htmlElement.classList.add('dark');
    } else if (theme === 'system') {
      htmlElement.classList.remove('dark'); 
      if (mediaQuery.matches) {
        htmlElement.classList.add('dark');
      }
      mediaQuery.addEventListener('change', systemThemeListener);
    }

    
    return () => {
      mediaQuery.removeEventListener('change', systemThemeListener);
    };
  }, [theme, themeInitialized]); 

  // This function is called by the Settings UI
  const updateTheme = (newTheme) => {
    const htmlElement = document.documentElement;

    // Apply visual change directly when user updates via UI
    if (newTheme === 'light') {
      htmlElement.classList.remove('dark');
    } else if (newTheme === 'dark') {
      htmlElement.classList.add('dark');
    } else if (newTheme === 'system') {
      // Apply OS preference when switching TO system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      htmlElement.classList.remove('dark');
      if (prefersDark) {
        htmlElement.classList.add('dark');
      }
    }
    setTheme(newTheme);
  };

  const contextValue = {
    theme, 
    updateTheme
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
