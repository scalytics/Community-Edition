import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import apiService from '../../../services/apiService';
import { toast } from 'react-toastify';

const ProviderApiKeyForm = ({ provider, onKeyUpdated, onCancel }) => {
  const [keyName, setKeyName] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [loading, setLoading] = useState(false);
  const [currentKey, setCurrentKey] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Determine label for key input based on provider
  const getKeyLabel = () => {
    if (provider.name === 'Scalytics') return 'License Key';
    return 'API Key';
  };

  // Load existing key info if available
  useEffect(() => {
    const fetchCurrentKey = async () => {
      try {
        const response = await apiService.get(`/admin/api-keys/provider/${provider.id}`);
        if (response.data.success && response.data.data) {
          setCurrentKey(response.data.data);
          setKeyName(response.data.data.key_name || '');
        }
      } catch (error) {
      }
    };

    if (provider && provider.id) {
      fetchCurrentKey();
    }
  }, [provider]);

  const handleSave = async () => {
    if (!keyName || !keyValue) {
      toast.error(`Please provide both a name and ${getKeyLabel().toLowerCase()} value`);
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.post('/admin/api-keys', {
        providerId: provider.id,
        keyName,
        keyValue,
        encrypt
      });

      if (response.data.success) {
        toast.success(`${getKeyLabel()} for ${provider.name} saved successfully`);
        setCurrentKey(response.data.data);
        setKeyValue(''); 
        if (onKeyUpdated) onKeyUpdated(response.data.data);
      } else {
        toast.error(`Error saving ${getKeyLabel()}: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error saving ${getKeyLabel()}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentKey || !currentKey.id) return;

    if (!window.confirm(`Are you sure you want to delete this ${getKeyLabel()}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.delete(`/admin/api-keys/${currentKey.id}`);
      if (response.data.success) {
        toast.success(`${getKeyLabel()} deleted successfully`);
        setCurrentKey(null);
        setKeyName('');
        if (onKeyUpdated) onKeyUpdated(null);
      } else {
        toast.error(`Error deleting ${getKeyLabel()}: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error deleting ${getKeyLabel()}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const valueToTest = currentKey ? undefined : keyValue;
    
    if (!currentKey && !valueToTest) {
      toast.error(`Please enter a ${getKeyLabel().toLowerCase()} to test`);
      return;
    }

    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await apiService.post('/admin/api-keys/test', {
        providerId: provider.id,
        keyValue: valueToTest
      });
      
      if (response.data.success) {
        setTestResult({
          valid: response.data.data.isValid,
          message: response.data.data.message
        });
        
        toast.info(response.data.data.message);
      } else {
        setTestResult({
          valid: false,
          message: response.data.message
        });
        toast.error(`Test failed: ${response.data.message}`);
      }
    } catch (error) {
      setTestResult({
        valid: false,
        message: error.message
      });
      toast.error(`Test error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium text-gray-900">
          {provider.name} {getKeyLabel()}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {currentKey 
            ? `Manage existing ${getKeyLabel().toLowerCase()} for ${provider.name}`
            : `Add a new ${getKeyLabel().toLowerCase()} for ${provider.name} to enable model discovery and usage`
          }
        </p>
        
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="keyName" className="block text-sm font-medium text-gray-700">
              Key Name
            </label>
            <input
              type="text"
              id="keyName"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              disabled={loading}
              placeholder="e.g. Production Key"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          
          {currentKey ? (
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200 dark:border-dark-border text-sm">
              <span className="font-semibold">{getKeyLabel()} saved</span> • 
              Created: {new Date(currentKey.created_at).toLocaleString()}
              {currentKey.is_encrypted && <span className="ml-2 text-green-600 text-xs font-medium">•&nbsp;Encrypted</span>}
            </div>
          ) : (
            <div>
              <label htmlFor="keyValue" className="block text-sm font-medium text-gray-700">
                {getKeyLabel()} Value
              </label>
              <input
                type="password"
                id="keyValue"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                disabled={loading}
                placeholder={`Enter your ${provider.name} ${getKeyLabel().toLowerCase()}`}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <div className="mt-2">
                <div className="flex items-center">
                  <input
                    id="encrypt"
                    name="encrypt"
                    type="checkbox"
                    checked={encrypt}
                    onChange={(e) => setEncrypt(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="encrypt" className="ml-2 block text-sm text-gray-900">
                    Encrypt key in database
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Recommended for production environments. Requires ENCRYPTION_SECRET environment variable.
                </p>
              </div>
            </div>
          )}
          
          {testResult && (
            <div className={`p-3 rounded ${testResult.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  {testResult.valid ? (
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium">{testResult.message}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex justify-between pt-4">
            <div>
              {currentKey && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="mr-3 inline-flex items-center rounded-md border border-transparent bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleTest}
                disabled={loading || testing || (!currentKey && !keyValue)}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {testing ? 'Testing...' : 'Test Key'}
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="mr-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || (!currentKey && !keyValue)}
                className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {loading ? 'Saving...' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

ProviderApiKeyForm.propTypes = {
  provider: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  onKeyUpdated: PropTypes.func,
  onCancel: PropTypes.func.isRequired
};

export default ProviderApiKeyForm;
