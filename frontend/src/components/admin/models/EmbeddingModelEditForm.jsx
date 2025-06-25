import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const EmbeddingModelEditForm = ({
  model, 
  onSave, 
  onCancel, 
  saving, 
  error, 
  success, 
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (model) {
      setFormData({
        name: model.name || '',
        description: model.description || '',
      });
    } else {
      setFormData({ name: '', description: '' });
    }
  }, [model]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSave) {
      await onSave({
        name: formData.name,
        description: formData.description,
      }, model); 
    }
  };

  if (!model) return null; 

  return (
    <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-dark-border">
      <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary mb-4">
        Edit Embedding Model Details: {model.name}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Display some read-only info */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Model ID:</strong> {model.id}</p>
          <p><strong>Type:</strong> Local Embedding</p>
          <p><strong>Dimension:</strong> {model.embedding_dimension || 'N/A'}</p>
          <p><strong>Path:</strong> {model.model_path || 'N/A'}</p>
          <p><strong>HF Repo:</strong> {model.huggingface_repo || 'N/A'}</p>
        </div>

        {/* Editable Fields */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Model Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            id="name"
            value={formData.name}
            onChange={handleInputChange}
            readOnly 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-gray-400 focus:border-gray-400 sm:text-sm bg-gray-100 dark:bg-dark-primary dark:text-gray-400 cursor-not-allowed" // Style as read-only
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <textarea
            name="description"
            id="description"
            rows="3"
            value={formData.description}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-dark-text-primary"
          ></textarea>
        </div>

        {/* Error/Success Messages */}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center"
          >
            {saving && (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {saving ? 'Saving...' : 'Save Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

EmbeddingModelEditForm.propTypes = {
  model: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool,
  error: PropTypes.string,
  success: PropTypes.string,
};

export default EmbeddingModelEditForm;
