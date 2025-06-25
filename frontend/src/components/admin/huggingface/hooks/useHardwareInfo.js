import { useState, useEffect, useRef } from 'react';
import apiService from '../../../../services/apiService';

// Define model capabilities for vLLM/Torch models
const modelSizeData = {
  '1B': {
    description: 'Very small model for simple tasks or low-resource environments',
    fp16_vram_gb: 2,
  },
  '3B': {
    description: 'Small model suitable for basic tasks',
    fp16_vram_gb: 4,
  },
  '7B': {
    description: 'Good general-purpose model for everyday tasks',
    fp16_vram_gb: 8,
  },
  '13B': {
    description: 'More capable model with improved reasoning',
    fp16_vram_gb: 15,
  },
  '34B': {
    description: 'Advanced model with stronger capabilities',
    fp16_vram_gb: 40,
  },
  '70B': {
    description: 'High-end model with near-human performance',
    fp16_vram_gb: 80,
  }
};

/**
 * Custom hook to fetch and manage hardware information
 * @returns {Object} Hardware info state and utilities
 */
const useHardwareInfo = () => {
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [recommendations, setRecommendations] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetchedRef = useRef(false); 

  // Fetch hardware info only once on hook mount
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true; 
      fetchHardwareInfo();
    }
  }, []); 

  // Fetch hardware information from the API
  const fetchHardwareInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.get('/admin/hardware');
      if (response) {
        setHardwareInfo(response);
      }
    } catch (err) {
      console.error('Error fetching hardware info:', err);
      setError('Failed to fetch hardware information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (hardwareInfo && hardwareInfo.gpu && Array.isArray(hardwareInfo.gpu.devices) && hardwareInfo.effectiveVramLimitGb !== undefined) {
      
      const gpus = hardwareInfo.gpu.devices;
      const isAppleSilicon = gpus.some(gpu => gpu.name?.includes('Apple'));
      const cudaEnabled = hardwareInfo.gpu.software?.cuda;
      const effectiveVramLimitGb = hardwareInfo.effectiveVramLimitGb;
      const totalSystemMemoryBytes = hardwareInfo.memory?.total || 0;
      const totalSystemMemoryGB = (totalSystemMemoryBytes / (1024 * 1024 * 1024)).toFixed(1);

      if (gpus.length > 0 || isAppleSilicon) {
          let bestFitSize = 'N/A';
          const modelSizesOrdered = ['70B', '34B', '13B', '7B', '3B', '1B'];

          for (const size of modelSizesOrdered) {
            const sizeInfo = modelSizeData[size];
            if (sizeInfo && sizeInfo.fp16_vram_gb <= effectiveVramLimitGb) {
              bestFitSize = size;
              break; // Found the largest size that fits
            }
          }

          if (bestFitSize === 'N/A') {
            console.warn(`No suitable model found for effective VRAM limit: ${effectiveVramLimitGb} GB`);
          }

          setRecommendations({
            gpus,
            cudaEnabled,
            effectiveVramLimitGb: effectiveVramLimitGb.toFixed(1),
            totalSystemMemoryGB: totalSystemMemoryGB,
            isAppleSilicon: isAppleSilicon,
            maxModelSize: bestFitSize,
            recommendationText: `Up to ${bestFitSize} parameter models (FP16). Smaller models or quantized versions (AWQ, GPTQ) will use less VRAM.`
          });

      } else {
          setRecommendations({
             gpus: [],
             cudaEnabled: false,
             effectiveVramLimitGb: 0,
             totalSystemMemoryGB: totalSystemMemoryGB,
             isAppleSilicon: false,
             maxModelSize: 'N/A',
             recommendationText: 'No compatible GPU detected. vLLM requires a CUDA-enabled GPU.'
           });
      }
    } else {
       console.warn("Hardware info fetched but incomplete/invalid.");
       setRecommendations({
         gpus: [],
         cudaEnabled: false,
         effectiveVramLimitGb: 0,
         totalSystemMemoryGB: '0.0',
         isAppleSilicon: false,
         maxModelSize: 'N/A',
         recommendationText: 'Could not determine hardware recommendations.'
       });
    }
  }, [hardwareInfo, loading]);

  return {
    hardwareInfo,
    recommendations,
    loading,
    error,
    refreshHardwareInfo: fetchHardwareInfo
  };
};

export default useHardwareInfo;
