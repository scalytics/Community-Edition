import React from 'react';
import PropTypes from 'prop-types';

/**
 * Component to display different error states in the chat
 * @param {Object} props Component props
 * @returns {JSX.Element} Error display component
 */
const ChatError = ({ error, onDismiss }) => {
  if (!error) return null;
  
  // Handle both string errors (for backward compatibility) and object errors
  const isErrorObject = typeof error === 'object' && error !== null;
  const errorMessage = isErrorObject ? error.message : 'Error';
  const errorDetail = isErrorObject ? error.detail : error;
  const errorType = isErrorObject ? error.type : 'general';
  const actionUrl = isErrorObject ? error.actionUrl : null;
  
  // Determine icon and colors based on error type
  let iconPath;
  let bgColor = 'bg-red-50';
  let borderColor = 'border-red-200';
  let iconColor = 'text-red-400';
  let headerColor = 'text-red-800';
  let textColor = 'text-red-700';
  
  switch (errorType) {
    case 'api_key':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />;
      bgColor = 'bg-yellow-50';
      borderColor = 'border-yellow-200';
      iconColor = 'text-yellow-400';
      headerColor = 'text-yellow-800';
      textColor = 'text-yellow-700';
      break;
    case 'deleted':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />;
      bgColor = 'bg-blue-50';
      borderColor = 'border-blue-200';
      iconColor = 'text-blue-400';
      headerColor = 'text-blue-800';
      textColor = 'text-blue-700';
      break;
    case 'rate_limit':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />;
      bgColor = 'bg-yellow-50';
      borderColor = 'border-yellow-200';
      iconColor = 'text-yellow-400';
      headerColor = 'text-yellow-800';
      textColor = 'text-yellow-700';
      break;
    case 'network':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7m-7-7v14" />;
      bgColor = 'bg-blue-50';
      borderColor = 'border-blue-200';
      iconColor = 'text-blue-400';
      headerColor = 'text-blue-800';
      textColor = 'text-blue-700';
      break;
    case 'server':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />;
      bgColor = 'bg-red-50';
      borderColor = 'border-red-200';
      iconColor = 'text-red-400';
      headerColor = 'text-red-800';
      textColor = 'text-red-700';
      break;
    case 'model_unavailable':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />;
      bgColor = 'bg-orange-50';
      borderColor = 'border-orange-200';
      iconColor = 'text-orange-400';
      headerColor = 'text-orange-800';
      textColor = 'text-orange-700';
      break;
    case 'content_policy':
      iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />;
      bgColor = 'bg-orange-50';
      borderColor = 'border-orange-200';
      iconColor = 'text-orange-400';
      headerColor = 'text-orange-800';
      textColor = 'text-orange-700';
      break;
    default:
      // Default error icon
      iconPath = <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />;
  }
  
  return (
    <div className="flex flex-col h-full items-center justify-center p-4">
      <div className={`w-full max-w-md ${bgColor} border ${borderColor} p-4 rounded-lg shadow-sm`}>
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className={`h-6 w-6 ${iconColor}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {iconPath}
            </svg>
          </div>
          <div className="ml-3">
            <h3 className={`text-lg font-medium ${headerColor}`}>{errorMessage}</h3>
            <div className={`mt-2 text-sm ${textColor}`}>
              <p>{errorDetail}</p>
            </div>
            
            {actionUrl && (
              <div className="mt-4">
                <a 
                  href={actionUrl} 
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {errorType === 'api_key' ? 'Go to Settings' : 'Resolve Issue'}
                </a>
              </div>
            )}
            
            {onDismiss && (
              <div className="mt-3">
                <button
                  onClick={onDismiss}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

ChatError.propTypes = {
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      message: PropTypes.string,
      detail: PropTypes.string,
      type: PropTypes.string,
      actionUrl: PropTypes.string
    })
  ]),
  onDismiss: PropTypes.func
};

export default ChatError;
