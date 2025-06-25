import React from 'react';
import PropTypes from 'prop-types';

const StatusMessage = ({ message, type, onDismiss }) => {
  if (!message) return null;

  const isSuccess = type === 'success';
  const bgColor = isSuccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
  const borderColor = isSuccess ? 'border-green-400 dark:border-green-600' : 'border-red-400 dark:border-red-600';
  const textColor = isSuccess ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300';
  const iconColor = isSuccess ? 'text-green-400 dark:text-green-500' : 'text-red-400 dark:text-red-500';
  const hoverColor = isSuccess ? 'hover:bg-green-100 dark:hover:bg-green-800/30' : 'hover:bg-red-100 dark:hover:bg-red-800/30';
  const ringColor = isSuccess ? 'focus:ring-green-500 dark:focus:ring-green-600' : 'focus:ring-red-500 dark:focus:ring-red-600';

  return (
    <div className={`mb-4 ${bgColor} border-l-4 ${borderColor} p-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className={`h-5 w-5 ${iconColor}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            {isSuccess ? (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            )}
          </svg>
        </div>
        <div className="ml-3">
          <p className={`text-sm ${textColor}`}>{message}</p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              onClick={onDismiss}
              className={`inline-flex rounded-md p-1.5 ${iconColor} ${hoverColor} focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${ringColor}`}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

StatusMessage.propTypes = {
  message: PropTypes.string,
  type: PropTypes.oneOf(['success', 'error']).isRequired,
  onDismiss: PropTypes.func.isRequired
};

export default StatusMessage;
