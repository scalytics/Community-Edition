import React from 'react';

/**
 * Simplified component to display hardware information and recommendations
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
const HardwareInfoDisplayComponent = ({ hardwareInfo, loading, recommendations }) => {
  
  if (loading) {
    return (
      <div className="mb-4 p-4 bg-gray-50 dark:bg-dark-primary border-l-4 border-blue-400 dark:border-blue-500 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2 w-3/4"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  // If no hardware info or recommendations, don't display anything
  if (!recommendations) return null;

  const {
    gpus,
    recommendationText,
    effectiveVramLimitGb,  
    totalSystemMemoryGB,   
    isAppleSilicon         
  } = recommendations;

  return (
    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 w-full">
          <h3 className="text-sm font-medium text-blue-800 dark:text-dark-link">Hardware Information</h3>
          <div className="mt-2 text-sm text-blue-700 dark:text-dark-text-primary">
            {/* GPU Listing */}
            {gpus.length > 0 ? (
              <p>
                Detected: {gpus.length > 1 ? `${gpus.length}× ` : ''}
                {gpus.map(gpu => gpu.name).join(', ')}
                {/* Display Total Shared Memory for Apple Silicon */}
                {isAppleSilicon && totalSystemMemoryGB && parseFloat(totalSystemMemoryGB) > 0 ?
                  ` (${totalSystemMemoryGB} GB Shared Memory)` : ''
                }
                {/* Display Effective VRAM Limit (or VRAM for dedicated GPUs) */}
                {effectiveVramLimitGb && parseFloat(effectiveVramLimitGb) > 0 ?
                  ` (Effective Limit: ${effectiveVramLimitGb} GB)` :
                  (!isAppleSilicon && gpus.length > 0 ? ' (VRAM Limit Calculation Pending)' : '') 
                }
              </p>
            ) : (
              <p>No GPU detected. Model performance may be limited.</p>
            )}

            {/* Recommendation with tooltips - Updated based on effective VRAM */}
            {recommendationText && (
              <div className="mt-2">
                <strong>Recommendation:</strong> {recommendationText}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const HardwareInfoDisplay = React.memo(HardwareInfoDisplayComponent);

export default HardwareInfoDisplay;
