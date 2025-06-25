import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * A generic dropdown component for selecting an AI model from a provided list.
 */
const ModelDropdown = ({
  label,
  selectedModelId,
  onModelChange,
  availableModels = [], 
  disabled = false,
  labelClasses = "block text-sm font-medium text-gray-700 dark:text-dark-text-primary",
  selectClasses = "mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm",
  placeholder = "-- Select Model --"
}) => {

  useEffect(() => {
    if (selectedModelId && selectedModelId !== '') {
      const modelIsValidAndAvailable = availableModels.some(
        m => m.id.toString() === selectedModelId.toString() && !(m.is_disabled)
      );
      if (!modelIsValidAndAvailable) {
        onModelChange(''); 
      }
    }
  }, [selectedModelId, availableModels, onModelChange]);

  const handleModelChange = (e) => {
    onModelChange(e.target.value);
  };

  return (
    <div>
      {label && (
        <label htmlFor={`model-dropdown-${label.replace(/\s+/g, '-')}`} className={labelClasses}>
          {label}
        </label>
      )}
      <select
        id={`model-dropdown-${label.replace(/\s+/g, '-')}`}
        value={selectedModelId || ''} 
        onChange={handleModelChange}
        disabled={disabled || availableModels.length === 0}
        className={`${selectClasses} ${disabled || availableModels.length === 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        <option value="" disabled={selectedModelId !== ''}>{availableModels.length === 0 ? "-- No Models Available --" : placeholder}</option>
        {availableModels.map((model) => (
          <option
            key={model.id}
            value={model.id.toString()}
            disabled={model.is_disabled} 
            className={model.is_disabled ? 'text-gray-400 dark:text-gray-500' : ''}
          >
            {model.provider_name ? `${model.provider_name}: ` : ''}
            {model.name}
            {model.is_disabled ? ' (Unavailable)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

ModelDropdown.propTypes = {
  label: PropTypes.string,
  selectedModelId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onModelChange: PropTypes.func.isRequired,
  availableModels: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    provider_name: PropTypes.string,
    // Add other relevant model properties if needed for display/logic
  })),
  disabled: PropTypes.bool,
  labelClasses: PropTypes.string,
  selectClasses: PropTypes.string,
  placeholder: PropTypes.string,
};

export default ModelDropdown;
