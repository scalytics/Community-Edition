import React from 'react';

/**
 * Simple footer component for the chat interface
 */
const ChatFooter = () => {
  return (
    <div className="bg-white dark:bg-dark-primary border-t border-gray-200 dark:border-gray-800 py-4 px-6 h-[50px] mb-0">
      <div className="max-w-3xl mx-auto flex items-center justify-center">
        {/* Powered by text - centered */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Powered by <a href='https://www.scalytics.io' target='_blank' rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">Scalytics</a>
        </div>
      </div>
    </div>
  );
};

export default ChatFooter;
