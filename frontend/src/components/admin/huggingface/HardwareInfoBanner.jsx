import React, { useState, useEffect } from 'react';
import apiService from '../../../services/apiService';

/**
 * Component that displays hardware information and quantization recommendations
 * for the Hugging Face model search page
 */
const HardwareInfoBanner = () => {
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHardwareInfo = async () => {
      try {
        setLoading(true);
        const response = await apiService.get('/admin/hardware');
        setHardwareInfo(response);
        setError(null);
      } catch (err) {
        console.error('Error fetching hardware info:', err);
        setError('Failed to load hardware information');
      } finally {
        setLoading(false);
      }
    };

    fetchHardwareInfo();
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-700 p-4 mb-6 animate-pulse">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <div className="h-4 bg-blue-200 dark:bg-blue-700 rounded w-64 mb-2"></div>
            <div className="h-3 bg-blue-200 dark:bg-blue-700 rounded w-96"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return null; 
  }

  // Check if we have GPU information
  const gpus = hardwareInfo?.gpu?.devices || [];
  const cudaEnabled = hardwareInfo?.gpu?.software?.llamaCppPython?.hasCuda || false;
  
  // Calculate total GPU memory
  const totalGpuMemoryMB = gpus.reduce((total, gpu) => total + (gpu.memory?.total || 0), 0);
  const totalGpuMemoryGB = (totalGpuMemoryMB / 1024).toFixed(1);

  // Generate quantization recommendation based on available GPU memory
  let recommendedQuantization = '';
  let maxModelSize = '';
  
  if (totalGpuMemoryMB > 0) {
    if (totalGpuMemoryMB >= 24000) {
      recommendedQuantization = 'Q4_K_M to Q6_K';
      maxModelSize = '70B';
    } else if (totalGpuMemoryMB >= 16000) {
      recommendedQuantization = 'Q4_K_M';
      maxModelSize = '34B';
    } else if (totalGpuMemoryMB >= 8000) {
      recommendedQuantization = 'Q4_0 to Q4_K_M';
      maxModelSize = '13B';
    } else if (totalGpuMemoryMB >= 4000) {
      recommendedQuantization = 'Q2_K to Q4_0';
      maxModelSize = '7B';
    } else {
      recommendedQuantization = 'Q2_K';
      maxModelSize = '3B';
    }
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-700 p-4 mb-6">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-blue-800 dark:text-dark-link">
            System Hardware Configuration
          </h3>
          <div className="mt-2 text-sm text-blue-700 dark:text-dark-text-primary">
            {gpus.length > 0 ? (
              <>
                <p>
                  <span className="font-medium">GPU:</span> {gpus.length > 1 ? `${gpus.length}× ` : ''}{gpus.map(gpu => gpu.name).join(', ')} 
                  {totalGpuMemoryMB > 0 && ` (${totalGpuMemoryGB} GB VRAM)`}
                  {cudaEnabled && <span className="ml-1 px-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs rounded">CUDA Enabled</span>}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Recommended models:</span> Up to {maxModelSize} parameter models with {recommendedQuantization} quantization
                </p>
              </>
            ) : (
              <p>
                <span className="font-medium">No GPU detected.</span> Model performance may be limited. Consider using 3B or smaller models with Q2_K quantization.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareInfoBanner;
