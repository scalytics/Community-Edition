import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

const RecentChats = ({ loading = false, chats = [] }) => {
  if (loading) {
    return (
      <div className="animate-pulse px-4 py-5 sm:px-6 space-y-4">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        {Array(3).fill().map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <div className="rounded-full bg-gray-200 dark:bg-gray-700 h-10 w-10"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    
    // If today, show time only
    const isToday = new Date().toDateString() === date.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If this year, show month and day
    const isThisYear = new Date().getFullYear() === date.getFullYear();
    
    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    
    // Otherwise show date with year
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="px-4 py-5 sm:px-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary">Recent chats</h3>
      
      {chats.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center py-6 text-center text-gray-500 dark:text-dark-text-secondary">
          <svg className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
          <p>You don't have any chats yet.</p>
          <p className="text-sm mt-1">Start a new conversation to get started!</p>
        </div>
      ) : (
        <div className="mt-4 flow-root">
          <ul className="-my-5 divide-y divide-gray-200 dark:divide-dark-border">
            {chats.map((chat) => (
              <li key={chat.id} className="py-4">
                <Link 
                  to={`/chat/${chat.id}`}
                  className="block hover:bg-gray-50 dark:hover:bg-dark-secondary transition duration-150 ease-in-out rounded-md -m-2 p-2"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white">
                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                        {chat.title || 'New Chat'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-dark-text-secondary truncate">
                        {chat.model_name ? `Using ${chat.model_name}` : 'Chat'}
                        {chat.message_count ? ` • ${chat.message_count} message${chat.message_count !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-dark-text-primary">
                        {formatTime(chat.updated_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {chats.length > 0 && (
        <div className="mt-6">
        <Link
          to="/chat"
          className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-dark-text-primary bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          View All Chats
        </Link>
        </div>
      )}
    </div>
  );
};

RecentChats.propTypes = {
  loading: PropTypes.bool,
  chats: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      model_name: PropTypes.string,
      message_count: PropTypes.number,
      updated_at: PropTypes.string
    })
  )
};

export default RecentChats;
