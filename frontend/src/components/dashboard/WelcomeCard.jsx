import React from 'react';
import PropTypes from 'prop-types';

const WelcomeCard = ({ username }) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 rounded-lg shadow-lg overflow-hidden mb-4">
      <div className="px-4 py-5 sm:p-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl leading-6 font-medium text-white">
              {getGreeting()}, {username || 'there'}!
            </h3>
            <p className="mt-2 max-w-xl text-sm text-blue-100">
              Welcome to Scalytics Connect - your enterprise-grade AI collaboration hub.
              Access state-of-the-art language models through a secure, unified interface designed for teams.
            </p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-6">
            <svg
              className="h-24 w-24 text-white opacity-25"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <path d="M13 8l2 2l4-4"></path>
              <path d="M9 12l2 2l4-4"></path>
            </svg>
          </div>
        </div>
      </div>
      <div className="bg-blue-700 dark:bg-blue-800 px-4 py-3 sm:px-6">
        <div className="text-sm flex justify-between">
          <p className="text-blue-100">
            Seamlessly integrate local models, cloud APIs, and custom agents with enterprise-level security and governance.
          </p>
          <p className="font-medium text-blue-100">
            <a href="https://www.scalytics.io" target="_new" className="hover:text-white flex items-center">
              <svg className="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Learn more
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

WelcomeCard.propTypes = {
  username: PropTypes.string
};

export default WelcomeCard;
