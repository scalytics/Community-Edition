import React, { useEffect, useState, useCallback } from 'react';

/**
 * A modern, animated alert component with auto-dismiss functionality
 * 
 * @param {Object} props Component props
 * @param {string} props.type Alert type: 'error', 'success', 'warning', 'info'
 * @param {string} props.message The message to display
 * @param {Function} props.onDismiss Optional callback when alert is dismissed
 * @param {number} props.autoDismiss Time in ms to auto-dismiss (0 to disable)
 * @param {boolean} props.showIcon Whether to show the icon
 */
const ModernAlert = ({ 
  type = 'info', 
  message, 
  onDismiss,
  autoDismiss = 5000,
  showIcon = true
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onDismiss) onDismiss();
    }, 300); 
  }, [onDismiss]);
  
  useEffect(() => {
    if (autoDismiss && message) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoDismiss);
      
      return () => clearTimeout(timer);
    }
  }, [message, autoDismiss, handleDismiss]);
  
  if (!message || !isVisible) return null;
  
  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-400 dark:border-red-700',
          textColor: 'text-red-700 dark:text-red-300',
          iconColor: 'text-red-400 dark:text-red-300'
        };
      case 'success':
        return {
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-400 dark:border-green-700',
          textColor: 'text-green-700 dark:text-green-300',
          iconColor: 'text-green-400 dark:text-green-300'
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', 
          borderColor: 'border-yellow-400 dark:border-yellow-700', 
          textColor: 'text-yellow-700 dark:text-yellow-300', 
          iconName: 'warning', 
          iconColor: 'text-yellow-400 dark:text-yellow-300' 
        };
      default:
        return {
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-400 dark:border-blue-700',
          textColor: 'text-blue-700 dark:text-blue-300',
          iconColor: 'text-blue-400 dark:text-blue-300'
        };
    }
  };
  
  const styles = getTypeStyles();
  
  const getIcon = () => {
    switch (type) {
      case 'error':
        return (
          <svg className={`h-5 w-5 ${styles.iconColor}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'success':
        return (
          <svg className={`h-5 w-5 ${styles.iconColor}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg className={`h-5 w-5 ${styles.iconColor}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className={`h-5 w-5 ${styles.iconColor}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
          </svg>
        );
    }
  };
  
  return (
    <div className={`mb-4 ${styles.bgColor} shadow-sm rounded-lg transform transition-transform duration-300 ${isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
      <div className="p-4">
        <div className="flex">
          {showIcon && (
            <div className="flex-shrink-0">
              {getIcon()}
            </div>
          )}
          <div className="ml-3 flex-1">
            <p className={`text-sm font-medium ${styles.textColor}`}>{message}</p>
          </div>
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={handleDismiss}
                className={`inline-flex rounded-md p-1.5 ${styles.bgColor} ${styles.textColor} hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-opacity-50`}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernAlert;
