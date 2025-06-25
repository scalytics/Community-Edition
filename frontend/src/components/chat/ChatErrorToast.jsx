import React from 'react';
import PropTypes from 'prop-types';

const ChatErrorToast = ({ inlineError, onDismiss }) => {
  if (!inlineError) {
    return null;
  }

  return (
    <div 
      className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-down"
      style={{
        maxWidth: '90%',
        width: '500px',
      }}
    >
      <div className={`
        relative rounded-lg shadow-lg p-4 ${
          inlineError.type === 'api_key' ? 'bg-yellow-50 border border-yellow-200' :
          inlineError.type === 'network' ? 'bg-blue-50 border border-blue-200' :
          inlineError.type === 'rate_limit' ? 'bg-yellow-50 border border-yellow-200' :
          inlineError.type === 'model_unavailable' ? 'bg-orange-50 border border-orange-200' :
          inlineError.type === 'content_policy' ? 'bg-orange-50 border border-orange-200' :
          inlineError.type === 'server' ? 'bg-red-50 border border-red-200' :
          'bg-red-50 border border-red-200'
        }`}
      >
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {inlineError.type === 'api_key' && (
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v-1l2-2H7a6 6 0 110-12h6a6 6 0 011 12zm-6-4a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            )}
            {inlineError.type === 'network' && (
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            )}
            {inlineError.type === 'rate_limit' && (
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            )}
            {inlineError.type === 'server' && (
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
            )}
            {(inlineError.type === 'model_unavailable' || inlineError.type === 'content_policy') && (
              <svg className="h-5 w-5 text-orange-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
            {inlineError.type === 'general' && (
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className={`text-sm font-medium ${
              inlineError.type === 'api_key' ? 'text-yellow-800' : 
              inlineError.type === 'network' ? 'text-blue-800' : 
              inlineError.type === 'rate_limit' ? 'text-yellow-800' : 
              inlineError.type === 'model_unavailable' ? 'text-orange-800' : 
              inlineError.type === 'content_policy' ? 'text-orange-800' : 
              inlineError.type === 'server' ? 'text-red-800' : 
              'text-red-800'
            }`}>{inlineError.message}</p>
            <p className={`mt-1 text-sm ${
              inlineError.type === 'api_key' ? 'text-yellow-700' : 
              inlineError.type === 'network' ? 'text-blue-700' : 
              inlineError.type === 'rate_limit' ? 'text-yellow-700' : 
              inlineError.type === 'model_unavailable' ? 'text-orange-700' : 
              inlineError.type === 'content_policy' ? 'text-orange-700' : 
              inlineError.type === 'server' ? 'text-red-700' : 
              'text-red-700'
            }`}>{inlineError.detail}</p>
            
            {inlineError.actionUrl && (
              <div className="mt-3">
                <a
                  href={inlineError.actionUrl}
                  className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {inlineError.type === 'api_key' ? 'Add API Key' : 'Fix issue'}
                </a>
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="bg-transparent rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={onDismiss}
            >
              <span className="sr-only">Close</span>
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

ChatErrorToast.propTypes = {
  inlineError: PropTypes.shape({
    message: PropTypes.string.isRequired,
    detail: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    actionUrl: PropTypes.string,
    timestamp: PropTypes.number
  }),
  onDismiss: PropTypes.func.isRequired
};

export default ChatErrorToast;
