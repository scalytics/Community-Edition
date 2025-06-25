import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import './ModelDownloadProgress.css';
import socketService from '../services/socketService';
import { huggingFaceService } from '../services/admin';

// Helper functions for formatting (defined outside component)
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(k)) : 0;
  const value = bytes / Math.pow(k, i);
  if (!isFinite(value)) return 'N/A';
  return parseFloat(value.toFixed(dm)) + ' ' + sizes[i];
};

const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond || bytesPerSecond < 1) return `0 B/s`;
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(1)} B/s`;
  if (bytesPerSecond < 1048576) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / 1048576).toFixed(1)} MB/s`;
};

// Step Indicator Component
const StepIndicator = ({ currentStep }) => {
  const steps = ['Initiated', 'Downloading', 'Ready'];
  return (
    <div className="flex items-center justify-between mb-4 w-full max-w-md mx-auto">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep >= stepNumber;
        const isCompleted = currentStep > stepNumber;
        const isCurrent = currentStep === stepNumber;
        const isFailed = currentStep === -1; 

        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center">
              <div className={`step-node w-8 h-8 flex items-center justify-center rounded-full text-xs font-medium border-2 transition-all duration-300 ease-in-out ${isActive ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-dark-border text-gray-500 dark:text-gray-400'} ${isCurrent && stepNumber === 3 ? 'bg-green-500 border-green-500 text-white' : isCurrent ? 'animate-pulse' : ''} ${isCompleted ? 'bg-green-500 border-green-500' : ''} ${isFailed ? 'bg-red-500 border-red-500 text-white' : ''}`}>
                {isCompleted ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)
                 : isFailed ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>)
                 : (stepNumber)}
              </div>
              <span className={`text-xs mt-1 text-center transition-colors duration-300 ease-in-out ${isActive ? 'text-blue-600 dark:text-dark-link font-medium' : 'text-gray-500 dark:text-gray-400'} ${isCompleted ? 'text-green-600 dark:text-green-400' : ''} ${isCurrent && stepNumber === 3 ? 'text-green-600 dark:text-green-400 font-medium' : ''} ${isFailed ? 'text-red-600 dark:text-red-400' : ''}`}>
                {label}
              </span>
            </div>
            {stepNumber < steps.length && (<div className={`step-line h-1 flex-1 mx-1 rounded-full transition-colors duration-500 ease-in-out ${isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-dark-border'}`}></div>)}
          </React.Fragment>
        );
      })}
    </div>
  );
};


const ModelDownloadProgress = ({
  downloadId,
  onComplete,
  onError,
  onProgress,
  onDismiss,
  onStatusChange, 
  className = '',
  style = {},
  hideStepIndicator = false,
  hideStatusMessage = false
}) => {
  
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(null);
  const [totalFiles, setTotalFiles] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0); 
  const [bytesDownloaded, setBytesDownloaded] = useState(0); 
  const [totalBytes, setTotalBytes] = useState(0); 
  const [speed, setSpeed] = useState(0); 
  const [cancelling, setCancelling] = useState(false);

  const prevDownloadIdRef = useRef(downloadId);
  const activationTimerRef = useRef(null);

  // Cancel download handler
  const handleCancelDownload = async () => {
    if (!downloadId || cancelling) return;
    
    try {
      setCancelling(true);
      await huggingFaceService.cancelDownload(downloadId);
      
      // Update UI to show cancelled state
      setStep(-1);
      setMessage('Download cancelled by user');
      setError('Download cancelled');
      
      if (onError) {
        onError({ error: 'Download cancelled by user' });
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      setError('Failed to cancel download');
    } finally {
      setCancelling(false);
    }
  };

  // --- State Reset Logic ---
  useEffect(() => {
    if (downloadId !== prevDownloadIdRef.current) {
      prevDownloadIdRef.current = downloadId; 
      setStep(downloadId ? 1 : -2);
      setMessage(downloadId ? 'Initializing...' : '');
      setError(null);
      setCurrentFile(null);
      setCurrentFileIndex(null);
      setTotalFiles(null);
      setProgressPercent(0);
      setBytesDownloaded(0);
      setTotalBytes(0);
      setSpeed(0);
      setIsDismissed(false);
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    }
  }, [downloadId]); 

  // Define getStatusText before handleEvent to fix no-use-before-define
  const getStatusText = useCallback(() => {
    switch (step) {
      case 1: return 'Initiated';
      case 2: return 'Downloading';
      case 3: return 'Ready'; 
      case -1: return 'Failed';
      default: return 'Waiting';
    }
  }, [step]);

  // --- WebSocket Event Handling ---
  const handleEvent = useCallback((eventType, data) => {
      let nextStep = undefined;
      let nextMessage = data?.message;
      let nextError = null;
      let nextCurrentFile = data?.currentFile;
      let nextCurrentFileIndex = data?.currentFileIndex;
      let nextTotalFiles = data?.totalFiles;
      let nextStatus = null; 

      // Define local variables for state updates within this handler scope
      let currentProgressPercent = 0;
      let currentBytesDownloaded = 0;
      let currentTotalBytes = 0;
       let currentSpeed = 0;


       switch (eventType) {
         case 'info':
          if (nextMessage !== undefined) setMessage(nextMessage);
          break;
        case 'progress':
          nextStep = 2; 
          const progressVal = typeof data?.progress === 'number' ? data.progress :
                           typeof data?.progress === 'string' ? parseInt(data.progress, 10) : 0;
          currentProgressPercent = Math.max(0, Math.min(100, isNaN(progressVal) ? 0 : progressVal));
          currentBytesDownloaded = data?.bytesDownloaded || 0;
          currentTotalBytes = data?.totalBytes || 0;
          currentSpeed = data?.speed || 0;
          nextCurrentFile = data?.currentFile || null; 
          nextCurrentFileIndex = data?.currentFileIndex || null;
          nextTotalFiles = data?.totalFiles || null;

          setProgressPercent(currentProgressPercent); 
          setBytesDownloaded(currentBytesDownloaded); 
          setTotalBytes(currentTotalBytes); 
          setSpeed(currentSpeed); 
          setCurrentFile(nextCurrentFile); 
          setCurrentFileIndex(nextCurrentFileIndex); 
          setTotalFiles(nextTotalFiles); 

          setMessage(nextCurrentFile ? `File ${nextCurrentFileIndex || '?'}/${nextTotalFiles || '?'}: ${nextCurrentFile}` : 'Downloading...');
          nextStatus = 'downloading';
          break;
        case 'complete':
          nextStep = 3; 
          nextMessage = 'Download complete! Model is ready.';
          currentProgressPercent = 100;
          setTotalBytes(prevTotal => {
              const finalTotal = data?.totalBytes || prevTotal || 0;
              setBytesDownloaded(finalTotal); 
              return finalTotal;
          });
          currentSpeed = 0;
          nextCurrentFile = null;
          nextCurrentFileIndex = null;
          nextTotalFiles = null;

          setProgressPercent(currentProgressPercent); 
          setSpeed(currentSpeed);
          setCurrentFile(nextCurrentFile);
          setCurrentFileIndex(nextCurrentFileIndex);
          setTotalFiles(nextTotalFiles);

          nextStatus = 'completed';
          if (onComplete) onComplete(data);
          if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
          break;
        case 'error':
          nextStep = -1; 
          nextError = data?.error || 'Download failed.';
          nextMessage = nextError; 
          nextStatus = 'failed';
          if (onError) onError(data);
          break;
        default:
          break;
      }

      // Update step state using functional form
      if (nextStep !== undefined) {
        setStep(prevStep => {
            if (prevStep === 3 || prevStep === -1) return prevStep;
            if (nextStep === -1 || nextStep > prevStep) return nextStep;
            if (nextStep === 1 && prevStep === 1) return nextStep;
            return prevStep;
        });
      }
      // Update message state only if nextMessage is defined
      if (nextMessage !== undefined) {
          setMessage(nextMessage);
      }
      setError(nextError); 

      // Call onProgress callback for the parent hook (if provided)
      // Pass the *updated* values calculated in this handler
      if (onProgress) {
         const parentStateUpdate = {
             status: nextStatus || getStatusText().toLowerCase(), 
             message: nextMessage || message, 
             error: nextError,
             progress: currentProgressPercent, 
             currentFile: nextCurrentFile,
             currentFileIndex: nextCurrentFileIndex,
             totalFiles: nextTotalFiles,
             bytesDownloaded: currentBytesDownloaded,
             totalBytes: currentTotalBytes,
             speed: currentSpeed
         };
         onProgress(parentStateUpdate);
      }

      // Call onStatusChange if status changed to completed or failed
      if (nextStatus === 'completed' || nextStatus === 'failed') {
         if (onStatusChange) onStatusChange(nextStatus);
       }
   // Restore dependencies based on linter feedback
   }, [onComplete, onError, onProgress, onStatusChange, message, getStatusText]);

  useEffect(() => {
    if (!downloadId) return;

    if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
    }

    const handleGlobalEventWrapper = (event) => {
      if (event?.detail?.downloadId === downloadId) {
        const data = event.detail;
        const eventType = event.type.split(':').pop();
        handleEvent(eventType, data);
      }
    };

    const eventTypes = ['progress', 'complete', 'error', 'info'];
    eventTypes.forEach(type => window.addEventListener(`download:${downloadId}:${type}`, handleGlobalEventWrapper));

    socketService.requestDownloadStatus(downloadId);

    return () => {
      eventTypes.forEach(type => window.removeEventListener(`download:${downloadId}:${type}`, handleGlobalEventWrapper));
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
       }
     };
   }, [downloadId, handleEvent]); 

  const displayProgressPercent = progressPercent;

  if (isDismissed) return null;

  if (!downloadId || step === -2 || step === 0) return null;

  const getStatusColor = () => {
     switch (step) {
      case 3: return 'text-green-600 dark:text-green-400'; 
      case -1: return 'text-red-600 dark:text-red-400';
      default: return 'text-blue-600 dark:text-dark-link'; 
    }
  }

  const getRemainingTime = () => {
    if (!speed || speed === 0 || !totalBytes || !bytesDownloaded || bytesDownloaded >= totalBytes) {
      return 'Calculating...';
    }
    const remainingBytes = totalBytes - bytesDownloaded;
    const remainingSeconds = remainingBytes / speed;

    if (remainingSeconds < 60) return `${Math.ceil(remainingSeconds)}s`;
    if (remainingSeconds < 3600) return `${Math.ceil(remainingSeconds / 60)}m`;
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.ceil((remainingSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };


  return (
    // Add key={downloadId} to force re-mount on ID change, ensuring state reset
    <div key={downloadId} className={`model-download-progress-simple relative bg-white dark:bg-dark-primary shadow-md rounded-lg p-4 ${className}`} style={style}>
      {/* Close button - show when step is 3 (Ready) OR -1 (Failed) */}
      {(step === 3 || step === -1) && (
        <button
          onClick={() => {
            setIsDismissed(true);
            if (onDismiss) onDismiss(); 
          }}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 rounded-md"
          aria-label="Close download status"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary">Download Status</h3>
        {/* Conditionally render status text - hide when step is 3 (Ready) OR -1 (Failed) */}
        {step !== 3 && step !== -1 && (
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        )}
      </div>

      {/* Only show the StepIndicator if not hidden */}
      {!hideStepIndicator && <StepIndicator currentStep={step} />}

      {/* Success message when download is complete and status message is hidden */}
      {step === 3 && hideStatusMessage && (
        <div className="w-full text-center text-sm font-medium text-green-600 dark:text-green-400 my-3">
          Download finished
        </div>
      )}

      {/* Enhanced status message with icons */}
      {!hideStatusMessage && (
        <div className="status-message text-sm mt-3 p-4 border dark:border-dark-border rounded-lg bg-white dark:bg-dark-primary shadow-sm min-h-[60px]">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              {step === 3 ? (
                <div className="h-5 w-5 text-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : step === -1 ? (
                <div className="h-5 w-5 text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : step === 2 ? (
                <div className="animate-spin h-5 w-5 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : (
                <div className="h-5 w-5 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-grow">
              <p className={`font-medium ${
                step === 3 ? 'text-green-700 dark:text-green-300' :
                step === -1 ? 'text-red-700 dark:text-red-300' :
                'text-gray-700 dark:text-gray-300'
              }`}>
                {step === -1 ? error : message || 'Waiting for status...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar and Details Section - Show only during step 2 (Downloading) */}
      {step === 2 && (
        <div className="mt-3">
          {/* File Info Card (Only show if currentFile is known) */}
          {currentFile && (
            <div className="file-card bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden mb-3">
              <div className="px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-dark-primary border-b border-gray-200 dark:border-dark-border">
                <div className="flex items-center">
              <span className="file-icon mr-2">
                {(() => {
                  // Display icon based on file extension
                  const ext = currentFile.split('.').pop().toLowerCase();
                  if (['bin'].includes(ext)) {
                    return (
                      <svg className="h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 22h14c1.1 0 2-.9 2-2V7.5L14.5 2H6c-1.1 0-2 .9-2 2v3h2V4h8v4h4v12H4v-3H2v3c0 1.1.9 2 2 2z"/>
                        <path d="M2 14h12v2H2z"/>
                        <path d="M2 10h12v2H2z"/>
                      </svg>
                    );
                  } else if (['safetensors', 'pt', 'pth'].includes(ext)) {
                    return (
                      <svg className="h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0-2-.9 2-2V5c0-1.1-.9-2-2-2zm-1.6 14.2h-4.2v-1.4h4.2v1.4zm0-3.8h-4.2V12h4.2v1.4zm0-3.7h-4.2V8.2h4.2v1.5zM6.6 17.2h4.2v-7H6.6v7z"/>
                      </svg>
                    );
                  } else if (['json', 'yaml', 'yml', 'txt'].includes(ext)) {
                    return (
                      <svg className="h-4 w-4 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                      </svg>
                    );
                  } else {
                    return (
                      <svg className="h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                      </svg>
                    );
                  }
                })()}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">File {currentFileIndex || 1} of {totalFiles || 1}</span>
            </div>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-dark-text-primary font-medium px-2 py-0.5 rounded-full">
                  Downloading
                </span>
              </div>
              <div className="p-3">
                <div className="flex items-center mb-2">
                  <div className="w-full truncate text-sm text-gray-800 dark:text-gray-200 font-medium" title={currentFile}>
                    {currentFile}
                  </div>
                </div>
                {/* Progress bar and details moved outside this conditional block */}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mb-1 overflow-hidden"> {/* Added overflow-hidden */}
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-1.5 rounded-full transition-none" // Add transition-none
              style={{ width: `${progressPercent}%` }} // Use state directly
            ></div>
          </div>
          {/* Progress Details Text */}
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{displayProgressPercent}% complete</span>
            {/* Display file size info using internal state */}
              {totalBytes > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}
                </span>
              )}
              {/* Display speed if available */}
              {speed > 0 && step === 2 && (
                 <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                   {formatSpeed(speed)}
                 </span>
              )}
              {/* Display remaining time if possible */}
              {speed > 0 && totalBytes > 0 && step === 2 && (
                 <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                   ~{getRemainingTime()} left
                 </span>
              )}
            </div>

          {/* Cancel Download Button */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={handleCancelDownload}
              disabled={cancelling}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Cancelling...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel Download
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === -1 && (
         <div className="mt-2 text-xs text-red-600 dark:text-red-400">
           Error Details: {error || 'An unknown error occurred.'}
         </div>
      )}
    </div>
  );
};

ModelDownloadProgress.propTypes = {
  downloadId: PropTypes.string,
  onComplete: PropTypes.func,
  onError: PropTypes.func,
  onProgress: PropTypes.func, 
  onDismiss: PropTypes.func, 
  onStatusChange: PropTypes.func, 
  autoConnect: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
  hideStepIndicator: PropTypes.bool, 
  hideStatusMessage: PropTypes.bool
};

export default ModelDownloadProgress;
