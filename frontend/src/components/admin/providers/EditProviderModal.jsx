import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

const EditProviderModal = ({ provider, onSave, onCancel, onChange }) => {
  const isTypeEditable = useMemo(() => {
    return provider ? (provider.is_manual || provider.name === 'Scalytics MCP') : false;
  }, [provider]);

  if (!provider) return null;

  const handleChange = (e, field) => {
    if (field.startsWith('endpoints.')) {
      const endpointField = field.split('.')[1];
      onChange({
        ...provider,
        endpoints: {
          ...(provider.endpoints || {}), 
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
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary" id="modal-title">
                  Edit Provider
                </h3>
                
                <div className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Provider Name
                    </label>
                    <input
                      type="text"
                      id="edit-name"
                      name="name"
                      value={provider.name || ''}
                      onChange={(e) => handleChange(e, 'name')}
                      disabled={!provider.is_manual} 
                      className={`mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm ${!provider.is_manual ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'}`}
                    />
                    {!provider.is_manual && (
                       <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                         Provider name cannot be changed for default providers.
                       </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Description
                    </label>
                    <input
                      type="text"
                      id="edit-description"
                      name="description"
                      value={provider.description || ''}
                      onChange={(e) => handleChange(e, 'description')}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="edit-api-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      API URL
                    </label>
                    <input
                      type="text"
                      id="edit-api-url"
                      name="api_url"
                      value={provider.api_url || ''}
                      onChange={(e) => handleChange(e, 'api_url')}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-is-active"
                      name="is_active"
                      checked={provider.is_active || false}
                      onChange={(e) => handleChange(e, 'is_active')}
                      className="h-4 w-4 text-blue-600 dark:text-dark-link focus:ring-blue-500 dark:focus:ring-blue-400 border-gray-300 dark:border-dark-border rounded"
                    />
                    <label htmlFor="edit-is-active" className="ml-2 block text-sm text-gray-900 dark:text-dark-text-primary">
                      Active
                    </label>
                  </div>

                  <div>
                    <label htmlFor="edit-is-external" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Type
                    </label>
                    <select
                      id="edit-is-external"
                      name="is_external"
                      value={String(provider.is_external)}
                      onChange={(e) => handleChange(e, 'is_external')}
                      disabled={!isTypeEditable} 
                      className={`mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm ${!isTypeEditable ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'}`}
                    >
                      <option value="true">External</option>
                      <option value="false">Internal</option>
                    </select>
                    {!isTypeEditable && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Provider type cannot be changed for this provider.
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Endpoints</h4>
                    <div className="mt-2 space-y-4">
                      <div>
                        <label htmlFor="edit-models-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Models Endpoint Path (Optional)
                        </label>
                        <input
                          type="text"
                          id="edit-models-endpoint"
                          name="endpoints.models"
                          value={provider.endpoints?.models || ''}
                          onChange={(e) => handleChange(e, 'endpoints.models')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                          placeholder="/v1/models"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="edit-chat-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Chat Endpoint Path (Optional)
                        </label>
                        <input
                          type="text"
                          id="edit-chat-endpoint"
                          name="endpoints.chat"
                          value={provider.endpoints?.chat || ''}
                          onChange={(e) => handleChange(e, 'endpoints.chat')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                          placeholder="/v1/chat/completions"
                        />
                      </div>
                                            
                      <div>
                        <label htmlFor="edit-validate-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Validate API Key Endpoint Path (Optional)
                        </label>
                        <input
                          type="text"
                          id="edit-validate-endpoint"
                          name="endpoints.validate"
                          value={provider.endpoints?.validate || ''}
                          onChange={(e) => handleChange(e, 'endpoints.validate')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                          placeholder="/v1/models (often same as Models Endpoint)"
                        />
                      </div>

                      <div>
                        <label htmlFor="edit-image-gen-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Image Generation Endpoint Path (Optional)
                        </label>
                        <input
                          type="text"
                          id="edit-image-gen-endpoint"
                          name="image_generation_endpoint_path" 
                          value={provider.image_generation_endpoint_path || ''}
                          onChange={(e) => handleChange(e, 'image_generation_endpoint_path')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                          placeholder="/v1/images/generations"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Path for image generation if provider uses a separate endpoint (e.g., /v1/images/generations for DALL-E). Leave blank if image generation uses the main chat endpoint with specific parameters (like Gemini).
                        </p>
                      </div>
                      {/* "Default Image Model External ID" field is REMOVED */}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onSave}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 dark:focus:ring-blue-400 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-border shadow-sm px-4 py-2 bg-white dark:bg-dark-primary text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 dark:focus:ring-blue-400 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

EditProviderModal.propTypes = {
  provider: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired
};

export default EditProviderModal;
