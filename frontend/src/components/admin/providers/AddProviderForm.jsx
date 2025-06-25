import React from 'react';
import PropTypes from 'prop-types';

const AddProviderForm = ({ provider, onChange, onSubmit }) => {
  const handleChange = (e, field) => {
    if (field.startsWith('endpoints.')) {
      const endpointField = field.split('.')[1];
      onChange({
        ...provider,
        endpoints: {
          ...provider.endpoints,
          [endpointField]: e.target.value
        }
      });
    } else if (field === 'is_external') {
      onChange({
        ...provider,
        is_external: e.target.value === 'true' 
      });
    } else {
      onChange({
        ...provider,
        [field]: field === 'is_active' ? e.target.checked : e.target.value
      });
    }
  };

  return (
    <div className="px-4 py-5 sm:px-6 border-t border-gray-200 dark:border-dark-border">
      <h3 className="text-md font-medium text-gray-700 dark:text-dark-text-primary mb-4">Add New Provider</h3>
      
      <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-4">
        <div>
          <label htmlFor="new-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Provider Name
          </label>
          <input
            type="text"
            id="new-name"
            value={provider.name}
            onChange={(e) => handleChange(e, 'name')}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="new-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <input
            type="text"
            id="new-description"
            value={provider.description}
            onChange={(e) => handleChange(e, 'description')}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="new-api-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API URL
          </label>
          <input
            type="text"
            id="new-api-url"
            value={provider.api_url}
            onChange={(e) => handleChange(e, 'api_url')}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
            placeholder="https://api.example.com"
          />
        </div>

        {/* Provider Type Select */}
        <div>
          <label htmlFor="new-is-external" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Type
          </label>
          <select
            id="new-is-external"
            value={provider.is_external === undefined ? 'true' : String(provider.is_external)} 
            onChange={(e) => handleChange(e, 'is_external')}
            className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
          >
            <option value="true">External</option>
            <option value="false">Internal</option>
          </select>
        </div>
        
        {/* Active Checkbox - Adjusted margin */}
        <div className="flex items-center mt-5 sm:mt-0 sm:self-end sm:pb-2"> {/* Adjusted alignment for grid */}
          <input
            type="checkbox"
            id="new-is-active"
            checked={provider.is_active}
            onChange={(e) => handleChange(e, 'is_active')}
            className="h-4 w-4 text-blue-600 dark:text-dark-link focus:ring-blue-500 dark:focus:ring-blue-400 border-gray-300 dark:border-dark-border rounded"
          />
          <label htmlFor="new-is-active" className="ml-2 block text-sm text-gray-900 dark:text-dark-text-primary">
            Active
          </label>
        </div>
      </div>
      
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Endpoints</h4>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-3 sm:gap-x-4 mt-2">
          <div>
            <label htmlFor="new-models-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Models Endpoint
            </label>
            <input
              type="text"
              id="new-models-endpoint"
              value={provider.endpoints.models}
              onChange={(e) => handleChange(e, 'endpoints.models')}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
              placeholder="/v1/models"
            />
          </div>
          
          <div>
            <label htmlFor="new-chat-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Chat Endpoint
            </label>
            <input
              type="text"
              id="new-chat-endpoint"
              value={provider.endpoints.chat}
              onChange={(e) => handleChange(e, 'endpoints.chat')}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
              placeholder="/v1/chat/completions"
            />
          </div>
          
          <div>
            <label htmlFor="new-validate-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Validate Endpoint
            </label>
            <input
              type="text"
              id="new-validate-endpoint"
              value={provider.endpoints.validate}
              onChange={(e) => handleChange(e, 'endpoints.validate')}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
              placeholder="/v1/models"
            />
          </div>
        </div>
      </div>
      
      <div className="mt-4">
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 dark:focus:ring-blue-400"
        >
          Add Provider
        </button>
      </div>
    </div>
  );
};

AddProviderForm.propTypes = {
  provider: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired
};

export default AddProviderForm;
