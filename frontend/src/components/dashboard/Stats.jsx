import React from 'react';
import PropTypes from 'prop-types';

const Stats = ({ loading = false, totalChats = 0, monthlyTokenUsage = 0 }) => { 
  if (loading) {
    return (
      <div className="animate-pulse px-4 py-5 sm:p-6 space-y-3">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        <div className="flex space-x-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div> 
        </div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }
  
  const formatNumber = (num, isTokenCount = false) => {
    if (num === undefined || num === null) return '0';

    if (isTokenCount) {
      if (num >= 1000000000) { 
        return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
      }
      if (num >= 1000000) { 
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      }
      if (num >= 1000) { 
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      }
      return num.toString(); 
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  return (
    <div className="px-4 py-5 sm:p-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary">Statistics</h3>
      <div className="mt-2 grid grid-cols-2 gap-5">
        <div>
          <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary truncate">Total Chats</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900 dark:text-dark-text-primary">{formatNumber(totalChats, false)}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary truncate">Tokens (Month)</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900 dark:text-dark-text-primary">{formatNumber(monthlyTokenUsage, true)}</dd>
        </div>
      </div>
      <div className="mt-5">
        <div className="relative">
          <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-200 dark:bg-blue-800">
            {totalChats > 0 ? (
              <div 
                style={{ width: `${Math.min(totalChats * 5, 100)}%` }} 
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 dark:bg-blue-500"
              ></div>
            ) : (
              <div 
                style={{ width: '5%' }} 
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gray-400 dark:bg-gray-600"
              ></div>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
            {totalChats === 0
              ? 'Start your first chat to see more statistics!'
              : totalChats === 1
              ? 'You\'ve started your first chat. Keep the conversation going!'
              : 'Your activity is building up. Great progress!'}
          </p>
        </div>
      </div>
    </div>
  );
};

Stats.propTypes = {
  loading: PropTypes.bool,
  totalChats: PropTypes.number,
  monthlyTokenUsage: PropTypes.number 
};

export default Stats;
