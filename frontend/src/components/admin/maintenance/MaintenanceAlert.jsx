import React from 'react';
import PropTypes from 'prop-types';

const MaintenanceAlert = ({ type, message }) => {
  if (!message) return null;

  const getAlertStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          borderColor: 'border-green-500 dark:border-green-600',
          textColor: 'text-green-700 dark:text-green-300'
        };
      case 'error':
        return {
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          borderColor: 'border-red-500 dark:border-red-600',
          textColor: 'text-red-700 dark:text-red-300'
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-500 dark:border-yellow-600',
          textColor: 'text-yellow-700 dark:text-yellow-300'
        };
      case 'info':
      default:
        return {
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          borderColor: 'border-blue-500 dark:border-blue-600',
          textColor: 'text-blue-700 dark:text-blue-300'
        };
    }
  };

  const { bgColor, borderColor, textColor } = getAlertStyles();

  return (
    <div className={`${bgColor} border-l-4 ${borderColor} ${textColor} p-4 mb-4`} role="alert">
      <p>{message}</p>
    </div>
  );
};

MaintenanceAlert.propTypes = {
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info']).isRequired,
  message: PropTypes.string
};

export default MaintenanceAlert;
