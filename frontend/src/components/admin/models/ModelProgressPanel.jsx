import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import eventBus from '../../../utils/eventBus';

const ModelProgressPanel = ({ modelId, token, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [progressData, setProgressData] = useState([]);
  const [debugLogs, setDebugLogs] = useState([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [currentStep, setCurrentStep] = useState('preparation');
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('Preparing model activation...');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer effect for real-time elapsed time display
  useEffect(() => {
    const timer = setInterval(() => {
      if (startTime && !isComplete && !hasError) {
        setElapsedTime(Date.now() - startTime);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, isComplete, hasError]);

  // Handle activation progress events
  const handleActivationProgress = useCallback((activationId, data) => {
    if (activationId !== token) return;

    const now = Date.now();
    setCurrentProgress(data.progress || 0);
    setCurrentMessage(data.message || '');
    setCurrentStep(data.step || 'unknown');

    setProgressData(prev => [...prev, {
      step: data.step,
      message: data.message,
      progress: data.progress,
      timestamp: now,
      emoji: getStepEmoji(data.step)
    }]);
  }, [token]);

  // Handle activation completion
  const handleActivationComplete = useCallback((activationId, data) => {
    if (activationId !== token) return;

    setCurrentProgress(100);
    setCurrentMessage(data.message || 'Model ready!');
    setCurrentStep('ready');
    setIsComplete(true);

    setProgressData(prev => [...prev, {
      step: 'ready',
      message: data.message || 'Model ready for inference!',
      progress: 100,
      timestamp: Date.now(),
      emoji: '✅'
    }]);

    // Don't auto-close - let admin review the complete process and close manually
  }, [token]);

  // Handle activation errors
  const handleActivationError = useCallback((activationId, data) => {
    if (activationId !== token) return;

    setHasError(true);
    setCurrentMessage(`Error: ${data.error}`);

    setProgressData(prev => [...prev, {
      step: 'error',
      message: `Activation failed: ${data.error}`,
      progress: currentProgress,
      timestamp: Date.now(),
      emoji: '❌'
    }]);
  }, [token, currentProgress]);

  // Handle debug logs
  const handleActivationDebug = useCallback((activationId, data) => {
    if (activationId !== token) return;

    setDebugLogs(prev => [...prev, {
      level: data.level || 'INFO',
      message: data.message,
      timestamp: data.timestamp || new Date().toISOString()
    }]);
  }, [token]);

  // Set up event listeners
  useEffect(() => {
    setStartTime(Date.now());

    // Subscribe to activation events - each returns an unsubscribe function
    const unsubscribeProgress = eventBus.subscribe('activation:progress', handleActivationProgress);
    const unsubscribeComplete = eventBus.subscribe('activation:complete', handleActivationComplete);
    const unsubscribeError = eventBus.subscribe('activation:error', handleActivationError);
    const unsubscribeDebug = eventBus.subscribe('activation:debug', handleActivationDebug);

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeError();
      unsubscribeDebug();
    };
  }, [handleActivationProgress, handleActivationComplete, handleActivationError, handleActivationDebug]);

  // Get emoji for different steps
  const getStepEmoji = (step) => {
    const stepEmojis = {
      preparation: '⚙️',
      platform_detection: '🔍',
      loading_weights: '📦',
      weights_loaded: '✅',
      engine_init: '🚀',
      engine_ready: '⚡',
      server_start: '🌐',
      routes_ready: '🛤️',
      ready: '✅',
      error: '❌'
    };
    return stepEmojis[step] || '⏳';
  };

  const getProgressPercentage = () => {
    if (progressData.length === 0) return 0;
    const latest = progressData[progressData.length - 1];
    return latest.progress || 0;
  };

  const formatTime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const getElapsedTimeDisplay = () => {
    if (isComplete) {
      return `Completed in ${formatTime(elapsedTime)}`;
    }
    return `${formatTime(elapsedTime)} elapsed`;
  };

  const getEstimatedTimeRemaining = () => {
    const progress = getProgressPercentage();
    if (progress <= 0) return 'Estimating...';
    if (progress >= 100) return 'Complete!';
    
    // Rough estimates based on typical load times
    if (progress < 40) return '2-3 minutes remaining';
    if (progress < 80) return '1-2 minutes remaining';
    if (progress < 95) return '30 seconds remaining';
    return 'Almost ready...';
  };

  return (
    <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div 
        className="px-4 py-3 bg-blue-100 dark:bg-blue-900/30 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <div className="text-blue-600 dark:text-blue-400">
            {isComplete ? '✅' : '⏳'}
          </div>
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {isComplete ? 'Model Ready!' : (currentMessage || 'Loading Model...')}
          </h3>
          <div className="text-xs text-blue-600 dark:text-blue-400">
            {getProgressPercentage()}%
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded">
            ⏱️ {getElapsedTimeDisplay()}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-xs text-blue-600 dark:text-blue-400">
            {getEstimatedTimeRemaining()}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          >
            ✕
          </button>
          <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 pb-2 bg-blue-100 dark:bg-blue-900/30">
        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
          <div 
            className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${getProgressPercentage()}%` }}
          ></div>
        </div>
      </div>

      {/* Expandable Progress Details */}
      {isExpanded && (
        <div className="px-4 py-3">
          {/* Debug Terminal Toggle */}
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Activation Progress
            </div>
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded hover:bg-blue-300 dark:hover:bg-blue-700"
            >
              {showDebugLogs ? '📊 Show Progress' : '🔍 Debug Logs'}
            </button>
          </div>

          {/* Progress Steps View */}
          {!showDebugLogs && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {progressData.length === 0 ? (
                <div className="text-sm text-blue-600 dark:text-blue-400 text-center py-4">
                  🚀 Initializing model loading...
                </div>
              ) : (
                progressData.map((item, index) => (
                  <div key={`${item.step}-${index}`} className="flex items-start space-x-2">
                    <div className="text-base mt-0.5">
                      {item.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          {item.message}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {item.progress}%
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Debug Terminal View */}
          {showDebugLogs && (
            <div className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded max-h-64 overflow-y-auto">
              {debugLogs.length === 0 ? (
                <div className="text-gray-500 text-center py-4">
                  🔍 Waiting for debug logs...
                </div>
              ) : (
                // Reverse the logs array to show newest first
                [...debugLogs].reverse().map((log, index) => (
                  <div 
                    key={`log-${debugLogs.length - 1 - index}`} 
                    className={`mb-1 ${
                      log.level === 'ERROR' ? 'text-red-400' :
                      log.level === 'WARNING' ? 'text-yellow-400' :
                      log.level === 'PERF' ? 'text-cyan-400' :
                      'text-green-400'
                    }`}
                  >
                    <span className="text-gray-500">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>{' '}
                    <span className="text-purple-400">[{log.level}]</span>{' '}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Performance Insights */}
          {progressData.length > 0 && !showDebugLogs && (
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-600 dark:text-blue-400">
                <div className="flex justify-between">
                  <span>Current Step:</span>
                  <span className="font-medium">{currentStep.replace('_', ' ').toUpperCase()}</span>
                </div>
                {currentProgress > 0 && (
                  <div className="flex justify-between mt-1">
                    <span>Progress:</span>
                    <span className="font-medium">{currentProgress}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

ModelProgressPanel.propTypes = {
  modelId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onClose: PropTypes.func
};

export default ModelProgressPanel;
