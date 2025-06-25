import React from 'react';
import PropTypes from 'prop-types';

const ChatScrollButton = ({ show, onClick }) => {
  if (!show) {
    return null;
  }
  
  return (
    <button
      onClick={onClick}
      className="absolute bottom-40 right-8 bg-blue-600 text-white rounded-full p-2 shadow-lg hover:bg-blue-700 focus:outline-none z-10"
      aria-label="Scroll to bottom"
    >
      <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </button>
  );
};

ChatScrollButton.propTypes = {
  show: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};

export default ChatScrollButton;
