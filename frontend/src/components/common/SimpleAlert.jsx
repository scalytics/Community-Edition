import React from 'react';

const SimpleAlert = ({ message, type, onClose }) => {
  if (!message) return null;

  const baseClasses = "px-4 py-3 rounded relative mb-4 border";
  const typeClasses = {
    error: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400",
    success: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400",
  };

  // Ensure message is a string before rendering
  const displayMessage = typeof message === 'string' ? message : 'An unexpected error occurred.';

  return (
    <div className={`${baseClasses} ${typeClasses[type] || typeClasses.error}`} role="alert">
      <span className="block sm:inline">{displayMessage}</span>
      {onClose && (
        <button onClick={onClose} className="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close">
           {/* Simple X icon */}
           <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.03a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
        </button>
      )}
    </div>
  );
};

export default SimpleAlert;
