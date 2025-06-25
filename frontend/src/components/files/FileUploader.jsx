import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import fileService from '../../services/fileService';

const FileUploader = ({ 
  onFileUpload, 
  onError, 
  allowedTypes = ['text/csv', 'application/json', 'text/plain'],
  maxFileSize = 10 * 1024 * 1024, // 10MB
  buttonText = "Upload File",
  showPreview = true
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    // Check file type if allowedTypes is provided
    if (allowedTypes && allowedTypes.length > 0) {
      // Handle cases where the browser doesn't recognize the type
      // by checking the file extension too
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const commonExtensions = {
        'csv': 'text/csv',
        'json': 'application/json',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'js': 'text/javascript',
        'py': 'text/x-python',
        'html': 'text/html',
        'css': 'text/css'
      };
      
      // Check by MIME type or extension
      const validType = 
        allowedTypes.includes(file.type) || 
        (commonExtensions[fileExtension] && allowedTypes.includes(commonExtensions[fileExtension]));
        
      if (!validType) {
        const displayTypes = allowedTypes.map(type => type.split('/')[1]).join(', ');
        onError?.(`Invalid file type. Allowed types: ${displayTypes}`);
        return false;
      }
    }

    // Check file size
    if (maxFileSize && file.size > maxFileSize) {
      onError?.(`File is too large. Maximum size is ${(maxFileSize / (1024 * 1024)).toFixed(1)}MB`);
      return false;
    }

    return true;
  };

  const handleFileUpload = async (file) => {
    if (!validateFile(file)) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      
      // Use the updated fileService with progress tracking
      const uploadedFile = await fileService.uploadFile(file, (progress) => {
        setUploadProgress(progress);
      });
      
      if (onFileUpload) {
        onFileUpload(uploadedFile);
      }
      
      // Reset progress
      setUploadProgress(0);
    } catch (error) {
      if (onError) {
        onError(error.message || 'File upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

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
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // Get a list of file extensions from the allowedTypes
  const getAllowedExtensions = () => {
    const typeToExt = {
      'text/csv': '.csv',
      'application/json': '.json',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/pdf': '.pdf',
      'text/javascript': '.js',
      'text/x-python': '.py',
      'text/html': '.html',
      'text/css': '.css'
    };
    
    return allowedTypes.map(type => typeToExt[type] || `.${type.split('/')[1]}`).join(',');
  };

  return (
    <div 
      className={`
        border-2 border-dashed rounded-lg p-4 text-center transition-colors duration-200
        ${dragOver 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 bg-gray-50 hover:border-blue-300'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept={getAllowedExtensions()}
      />
      
      {uploading ? (
        <div className="flex flex-col items-center justify-center">
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <div className="flex items-center">
            <svg 
              className="animate-spin h-5 w-5 mr-2 text-blue-500" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              ></circle>
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Uploading... {uploadProgress.toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <>
          <svg 
            className="mx-auto h-10 w-10 text-gray-400" 
            stroke="currentColor" 
            fill="none" 
            viewBox="0 0 48 48"
          >
            <path 
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
          <p className="mt-1 text-sm text-gray-600">
            Drag and drop a file or{' '}
            <button 
              type="button"
              onClick={triggerFileInput}
              className="font-medium text-blue-600 hover:text-blue-500 focus:outline-none"
            >
              browse
            </button>
          </p>
          {showPreview && (
            <p className="text-xs text-gray-500 mt-1">
              {allowedTypes.map(type => type.split('/')[1]).join(', ')} files
              {maxFileSize ? ` (max ${(maxFileSize / (1024 * 1024)).toFixed(0)}MB)` : ''}
            </p>
          )}
          <button
            onClick={triggerFileInput}
            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {buttonText}
          </button>
        </>
      )}
    </div>
  );
};

FileUploader.propTypes = {
  onFileUpload: PropTypes.func,
  onError: PropTypes.func,
  allowedTypes: PropTypes.arrayOf(PropTypes.string),
  maxFileSize: PropTypes.number,
  buttonText: PropTypes.string,
  showPreview: PropTypes.bool
};

export default FileUploader;