import React from 'react';
import PropTypes from 'prop-types';

const ToggleSwitch = ({ enabled, onChange, label }) => {
  const handleToggle = () => {
    onChange(!enabled);
  };

  return (
    <button
      type="button"
      className={`${
        enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
      } relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500`}
      onClick={handleToggle}
      aria-pressed={enabled}
      aria-label={label || 'Toggle'}
    >
      <span className="sr-only">{label || 'Toggle'}</span>
      <span
        aria-hidden="true"
        className={`${
          enabled ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-gray-300 shadow transform ring-0 transition ease-in-out duration-200`}
      />
    </button>
  );
};

ToggleSwitch.propTypes = {
  enabled: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string, 
};

export default ToggleSwitch;
