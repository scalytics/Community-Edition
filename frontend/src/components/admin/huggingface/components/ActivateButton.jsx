import React from 'react';
import PropTypes from 'prop-types';

/**
 * Button component to handle model activation and deactivation.
 * Displays appropriate text and handles loading/disabled states.
 */
const ActivateButton = ({
  modelId,
  isActive,
  isActivating,
  canActivate,
  disabledReason,
  onActivate,
  onDeactivate,
}) => {
  const isLoading = isActivating;

  const handleClick = () => {
    if (isLoading) return; 

    if (isActive) {
      onDeactivate(); 
    } else {
      onActivate(modelId); 
    }
  };

  const buttonText = isActive ? 'Deactivate' : 'Activate';
  const buttonColor = isActive
    ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 focus:ring-red-500'
    : 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 focus:ring-green-500';
  const disabledColor = 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed';

  const isDisabled = isLoading || (!isActive && !canActivate);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title={isDisabled ? disabledReason : ''} 
      className={`inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        isDisabled ? disabledColor : buttonColor
      } ${isLoading ? 'opacity-75 cursor-wait' : ''}`}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </>
      ) : (
        buttonText
      )}
    </button>
  );
};

ActivateButton.propTypes = {
  modelId: PropTypes.number.isRequired,
  isActive: PropTypes.bool.isRequired,
  isActivating: PropTypes.bool.isRequired,
  canActivate: PropTypes.bool.isRequired,
  disabledReason: PropTypes.string,
  onActivate: PropTypes.func.isRequired,
  onDeactivate: PropTypes.func.isRequired,
};

export default ActivateButton;
