import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import fileService from '../../services/fileService';

const FileList = ({ 
  onSelectFile, 
  selectedFileId = null,
  deletable = true 
}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch files on component mount
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoading(true);
        const filesData = await fileService.listFiles();
        setFiles(filesData);
      } catch (err) {
        setError('Failed to load files');
        console.error('File list error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []);

  // Delete file handler
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await fileService.deleteFile(fileId);
      setFiles(prev => prev.filter(file => file.id !== fileId));
    } catch (err) {
      setError('Failed to delete file');
      console.error('File delete error:', err);
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File type icon
  const getFileIcon = (fileType) => {
    const iconMap = {
      'text/csv': '📊',
      'application/json': '📜',
      'text/plain': '📄'
    };
    return iconMap[fileType] || '📁';
  };

  if (loading) {
    return (
      <div className="animate-pulse p-4">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        {[1, 2, 3].map((_, index) => (
          <div key={index} className="flex items-center space-x-4 my-2">
            <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4 bg-red-50 rounded">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center p-4 text-gray-500">
        <p>No files uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div 
          key={file.id} 
          className={`
            flex items-center justify-between p-3 rounded-lg 
            ${selectedFileId === file.id 
              ? 'bg-blue-100 border-blue-300' 
              : 'bg-white hover:bg-gray-50'
            } 
            border transition-colors duration-200 cursor-pointer
          `}
          onClick={() => onSelectFile && onSelectFile(file)}
        >
          <div className="flex items-center space-x-4">
            <span className="text-3xl">{getFileIcon(file.file_type)}</span>
            <div>
              <p className="font-medium text-gray-800">{file.original_name}</p>
              <p className="text-sm text-gray-500">
                {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {deletable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFile(file.id);
              }}
              className="text-red-500 hover:text-red-700 focus:outline-none"
              title="Delete file"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

FileList.propTypes = {
  onSelectFile: PropTypes.func,
  selectedFileId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  deletable: PropTypes.bool
};

export default FileList;