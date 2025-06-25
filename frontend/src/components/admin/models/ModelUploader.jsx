import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';

/**
 * Component for uploading local Torch/SafeTensor models
 * @param {Object} props Component props
 * @param {Function} [props.onUploadSuccess] Callback when upload is successful
 * @param {Function} [props.onError] Callback when upload fails
 * @returns {JSX.Element} Component
 */
const ModelUploader = ({ 
  onUploadSuccess = null, 
  onError = null 
}) => {
  const [file, setFile] = useState(null);
  const [modelName, setModelName] = useState('');
  const [description, setDescription] = useState('');
  const [contextWindow, setContextWindow] = useState(4096);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Valid model file extensions
  const validExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
  
  // Get a list of file extensions for the input accept attribute
  const getAcceptedFileTypes = () => validExtensions.join(',');

  // Validate file is a language model
  const validateFile = (file) => {
    if (!file) return false;
    
    // Check file extension
    const fileExt = `.${file.name.split('.').pop().toLowerCase()}`;
    if (!validExtensions.includes(fileExt)) {
      setError(`Invalid file type. Supported model formats: ${validExtensions.join(', ')}`);
      return false;
    }

    // Check file size (models are typically large but shouldn't be too small)
    if (file.size < 1024 * 1024) { // Less than 1MB
      setError('File is too small to be a valid model file');
      return false;
    }

    return true;
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      
      // Auto-generate name from filename if not set
      if (!modelName) {
        const nameFromFile = selectedFile.name
          .replace(/\.(gguf|ggml|bin|model|pt|pth|ckpt)$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/q[0-9]+_/i, '') 
          .replace(/\b\w/g, c => c.toUpperCase()); 
          
        setModelName(nameFromFile);
      }
      
      setError('');
    }
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFile(droppedFile);
      
      // Auto-generate name as above
      if (!modelName) {
        const nameFromFile = droppedFile.name
          .replace(/\.(gguf|ggml|bin|model|pt|pth|ckpt)$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/q[0-9]+_/i, '')
          .replace(/\b\w/g, c => c.toUpperCase());
          
        setModelName(nameFromFile);
      }
      
      setError('');
    }
  };

  // Upload the model
  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a model file to upload');
      return;
    }
    
    if (!modelName) {
      setError('Please provide a name for the model');
      return;
    }
    
    try {
      setError('');
      setSuccess('');
      setUploading(true);
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('model', file);
      formData.append('name', modelName);
      formData.append('description', description);
      formData.append('context_window', contextWindow);
      
      // Use adminService to upload the model
      const response = await adminService.uploadModel(formData, (progress) => {
        setUploadProgress(progress);
      });
      
      // Check if the response has the expected format and consider the upload successful
      const isSuccess = response && 
                       (response.data || response.success || response.status === 200);
      
      if (isSuccess) {
        const successMessage = `Model "${modelName}" has been successfully uploaded and registered`;
        
        // Set local success state
        setSuccess(successMessage);
        
        // Reset form
        setFile(null);
        setModelName('');
        setDescription('');
        setContextWindow(4096);
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // Call the success callback if provided
        if (typeof onUploadSuccess === 'function') {
          onUploadSuccess(response.data || response);
        }
      } else {
        const errorMessage = 'Upload response missing expected data';
        console.error(errorMessage, response);
        setError(errorMessage);
        
        // Call the error callback if provided
        if (typeof onError === 'function') {
          onError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to upload model';
      console.error('Upload error:', err);
      setError(errorMessage);
      
      // Call the error callback if provided
      if (typeof onError === 'function') {
        onError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  // Trigger file browser
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
          Upload Model
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Upload Torch or SafeTensor model files for local use with vLLM.
        </p>
      </div>
      
      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-700 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {success && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 dark:border-green-700 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleUpload}>
          {/* File Drop Zone */}
          <div 
              className={`
                mb-6 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors duration-200 relative
                ${dragOver 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400' 
                  : file 
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-400' 
                    : 'border-gray-300 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500'
                }
              `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept={getAcceptedFileTypes()}
            />
            
            {uploading ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center">
                  <svg className="animate-spin mr-2 h-6 w-6 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="font-medium text-blue-900 dark:text-blue-300">Uploading model... {uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-300">This may take several minutes for large models</p>
              </div>
            ) : file ? (
              <>
                <div className="flex items-center justify-center">
                  <svg className="h-8 w-8 text-green-500 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="mt-2 text-sm font-medium text-green-800 dark:text-green-300">
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Click to change file or continue filling the form below
                </p>
              </>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  Drag and drop your model file here, or click to browse
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Supported formats: .safetensors, .bin, .pt
                </p>
              </>
            )}
          </div>
          
          {/* Form Fields */}
          <div className="space-y-6">
            <div>
              <label htmlFor="modelName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Model Name <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="text"
                id="modelName"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary sm:text-sm"
                placeholder="e.g., Llama 2 7B"
                required
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A descriptive name to identify this model
              </p>
            </div>
            
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-dark-border shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary sm:text-sm"
                placeholder="Optional description of the model, its capabilities, and any special instructions"
              />
            </div>
            
            <div>
              <label htmlFor="contextWindow" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Context Window Size
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="number"
                  id="contextWindow"
                  value={contextWindow}
                  onChange={(e) => setContextWindow(parseInt(e.target.value) || 4096)}
                  min={1024}
                  max={128000}
                  step={1024}
                  className="block w-full rounded-md border-gray-300 dark:border-dark-border shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary sm:text-sm"
                />
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-400 sm:text-sm">
                  tokens
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The maximum context length the model supports (default: 4096)
              </p>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={uploading || !file || !modelName}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload Model'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

ModelUploader.propTypes = {
  onUploadSuccess: PropTypes.func,
  onError: PropTypes.func
};

export default ModelUploader;
