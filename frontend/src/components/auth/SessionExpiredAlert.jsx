import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component that displays authentication-related alerts
 * Handles different types of session issues based on URL params
 */
const SessionExpiredAlert = () => {
  const location = useLocation();
  const sessionParam = new URLSearchParams(location.search).get('session');
  const errorParam = new URLSearchParams(location.search).get('error');
  
  // Determine the type of message to display
  let title = 'Session expired';
  let message = 'Your session has expired. Please sign in again.';
  let alertColor = 'yellow'; // Default color
  
  // Handle specific error types
  if (sessionParam === 'invalid') {
    title = 'Invalid session';
    message = 'Your authentication token is invalid. Please sign in again.';
    alertColor = 'orange';
  } else if (errorParam === 'account_deleted') {
    title = 'Account not found';
    message = 'Your account could not be found. Please contact your administrator.';
    alertColor = 'red';
  } else if (errorParam === 'token_size') {
    title = 'Authentication token error';
    message = 'Your authentication token has exceeded the size limit. Please sign in again.';
    alertColor = 'orange';
  }
  
  // Skip rendering if no relevant parameter is present
  if (!sessionParam && !errorParam) {
    return null;
  }
  
  // Define color classes based on the alert type
  const bgColorClass = `bg-${alertColor}-50 dark:bg-${alertColor}-900/20`;
  const textColorClass = `text-${alertColor}-800 dark:text-${alertColor}-300`;
  const textDescClass = `text-${alertColor}-700 dark:text-${alertColor}-200`;
  const iconClass = `text-${alertColor}-400 dark:text-${alertColor}-300`;
  
  return (
    <div className={`rounded-md ${bgColorClass} p-4 mb-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className={`h-5 w-5 ${iconClass}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className={`text-sm font-medium ${textColorClass}`}>{title}</h3>
          <p className={`mt-2 text-sm ${textDescClass}`}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredAlert;
