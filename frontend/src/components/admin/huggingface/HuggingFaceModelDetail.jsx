import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import ModelDownloadProgress from '../../../components/ModelDownloadProgress';
import useHardwareInfo from './hooks/useHardwareInfo';
import '../../../components/ModelDownloadProgress.css';

const HuggingFaceModelDetail = ({
  model,
  onDownload,
  onRefreshModels,
  isLoading,
  downloadId,
  onComplete,
  onError,
  onDismiss,
  onCancel,
  isAirGapped = false
}) => {
  const [config, setConfig] = useState({
    name: '',
    description: '',
    context_window: 4096,
    is_active: false,
    model_format: 'torch',
    quantization_method: 'awq',
    tensor_parallel_size: 1,
    autoInstallDeps: true
  });
  const [showGateModal, setShowGateModal] = useState(false);
  const isEmbeddingModel = model.pipeline_tag === 'feature-extraction';
  
  // Conditionally execute the hook's logic
  const { recommendations, loading: hardwareLoading } = useHardwareInfo(!isEmbeddingModel);

  // Extract model size from model ID/name for VRAM calculations
  const getModelSize = (modelId) => {
    const id = modelId.toLowerCase();
    if (id.includes('70b') || id.includes('72b')) return 70;
    if (id.includes('34b') || id.includes('33b')) return 34;
    if (id.includes('13b') || id.includes('14b')) return 13;
    if (id.includes('7b') || id.includes('8b')) return 7;
    if (id.includes('3b')) return 3;
    if (id.includes('1b')) return 1;
    return 7; // Default assumption
  };

  // Calculate VRAM requirements for different precisions
  const getVRAMRequirements = (modelSize) => {
    return {
      fp16: Math.ceil(modelSize * 2.2), // ~2.2GB per billion parameters in FP16
      fp8: Math.ceil(modelSize * 1.1),  // ~1.1GB per billion parameters in FP8
      int8: Math.ceil(modelSize * 1.0), // ~1GB per billion parameters in INT8
      int4: Math.ceil(modelSize * 0.55), // ~0.55GB per billion parameters in INT4/AWQ
    };
  };

  useEffect(() => {
    if (model) {
      if (isEmbeddingModel) {
        setConfig(prev => ({
          ...prev,
          name: model.name || model.modelId.split('/').pop(),
          description: model.description || `HuggingFace embedding model: ${model.modelId}`,
        }));
      } else {
        const modelSize = getModelSize(model.modelId);
        const vramReqs = getVRAMRequirements(modelSize);
        const availableVRAM = recommendations ? parseFloat(recommendations.effectiveVramLimitGb) : 0;
        
        let defaultQuantization = 'awq';
        if (availableVRAM >= vramReqs.fp16) {
          defaultQuantization = 'fp16';
        } else if (availableVRAM >= vramReqs.int8) {
          defaultQuantization = 'int8';
        }

        setConfig(prev => ({
          ...prev,
          name: model.name || model.modelId.split('/').pop(),
          description: model.description || `HuggingFace model: ${model.modelId}`,
          quantization_method: defaultQuantization
        }));
      }
      if (model.gated) {
        setShowGateModal(true);
      }
    }
  }, [model, recommendations, isEmbeddingModel]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDownload = () => {
    onDownload(model.modelId, { ...config, is_embedding_model: isEmbeddingModel });
  };

  if (!model) return null;

  return (
    <>
      {showGateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              License agreement required
            </h2>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              This model is gated. You must accept the license on Hugging Face before
              you can download the weights.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowGateModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
              >
                Close
              </button>
              <a
                href={`https://huggingface.co/${model.modelId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white"
              >
                Accept license
              </a>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden">
        <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-dark-secondary border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">{model.modelId}</h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {isEmbeddingModel
            ? "Configure and download this embedding model for local use."
            : "Configure and download this model for local use with vLLM."
          }
        </p>
      </div>
      <div className="px-4 py-4 sm:px-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">Downloads</p><p className="text-sm text-gray-900 dark:text-gray-200">{model.downloads?.toLocaleString()}</p></div>
        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">Likes</p><p className="text-sm text-gray-900 dark:text-gray-200">{model.stars?.toLocaleString()}</p></div>
        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">License</p><p className="text-sm text-gray-900 dark:text-gray-200">{model.license === 'Unknown' ? 'Not specified' : (model.license || 'Not specified')}</p></div>
        <div><p className="text-xs font-medium text-gray-500 dark:text-gray-400">Last Modified</p><p className="text-sm text-gray-900 dark:text-gray-200">{(() => {
          try {
            const date = new Date(model.lastModified);
            return date.getTime() > 0 ? date.toLocaleDateString() : 'Unknown';
          } catch {
            return 'Unknown';
          }
        })()}</p></div>
      </div>

      <div className="px-4 py-5 sm:px-6 border-t border-gray-200 dark:border-dark-border">
        <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary mb-4">Download Configuration</h4>
        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Model Name (for local display)
            </label>
            <input
              type="text" name="name" id="name" value={config.name} onChange={handleInputChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              required
            />
          </div>
          {!isEmbeddingModel && (
          <div className="sm:col-span-3">
            <label htmlFor="quantization_method" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Download Precision
            </label>
            {hardwareLoading ? (
              <div className="mt-1 flex items-center">
                <svg className="animate-spin h-4 w-4 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-gray-600 dark:text-gray-400">Detecting hardware...</span>
              </div>
            ) : (
              <>
                <select
                  name="quantization_method"
                  id="quantization_method"
                  value={config.quantization_method}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  {(() => {
                    const modelSize = getModelSize(model?.modelId || '');
                    const vramReqs = getVRAMRequirements(modelSize);
                    const availableVRAM = recommendations ? parseFloat(recommendations.effectiveVramLimitGb) : 0;
                    
                    const options = [];
                    
                    // Always show AWQ/INT4 as safest option
                    options.push(
                      <option key="awq" value="awq">
                        AWQ/INT4 - Maximum Compatibility (~{vramReqs.int4}GB needed)
                      </option>
                    );
                    
                    // Show INT8 if there's enough VRAM
                    if (availableVRAM >= vramReqs.int8) {
                      options.push(
                        <option key="int8" value="int8">
                          INT8 - Balanced Quality (~{vramReqs.int8}GB needed)
                        </option>
                      );
                    }
                    
                    // Show FP8 if there's enough VRAM
                    if (availableVRAM >= vramReqs.fp8) {
                      options.push(
                        <option key="fp8" value="fp8">
                          FP8 - High Quality (~{vramReqs.fp8}GB needed)
                        </option>
                      );
                    }
                    
                    // Show FP16 if there's enough VRAM
                    if (availableVRAM >= vramReqs.fp16) {
                      options.push(
                        <option key="fp16" value="fp16">
                          FP16 - Maximum Quality (~{vramReqs.fp16}GB needed)
                        </option>
                      );
                    }
                    
                    return options;
                  })()}
                </select>
                <div className="mt-1 text-xs">
                  {recommendations ? (
                    <div className="text-gray-600 dark:text-gray-400">
                      <div className="font-medium text-blue-600 dark:text-blue-400">
                        Model: {getModelSize(model?.modelId || '')}B parameters • Available VRAM: {recommendations.effectiveVramLimitGb}GB
                      </div>
                      <div className="mt-1">
                        {(() => {
                          const modelSize = getModelSize(model?.modelId || '');
                          const vramReqs = getVRAMRequirements(modelSize);
                          const availableVRAM = parseFloat(recommendations.effectiveVramLimitGb);
                          
                          if (availableVRAM >= vramReqs.fp16) {
                            return "🟢 High-end hardware detected - All precision options available";
                          } else if (availableVRAM >= vramReqs.int8) {
                            return "🟡 Medium hardware - INT8 recommended for best quality";
                          } else {
                            return "🟠 Limited VRAM - AWQ/INT4 recommended for compatibility";
                          }
                        })()}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Hardware detection failed - AWQ/INT4 recommended</span>
                  )}
                </div>
              </>
            )}
          </div>
          )}
          <div className="sm:col-span-3 flex items-center">
            <input
              id="autoInstallDeps" name="autoInstallDeps" type="checkbox" checked={config.autoInstallDeps} onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="autoInstallDeps" className="ml-2 block text-sm text-gray-300">
              Auto-install dependencies
            </label>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-6 border-t border-gray-200 dark:border-dark-border">
        {downloadId || isLoading ? (
          <ModelDownloadProgress
            downloadId={downloadId}
            onComplete={onComplete} onError={onError} onDismiss={onDismiss}
          />
        ) : (
          <button
            type="button"
            onClick={handleDownload}
            disabled={model.gated}
            className={`inline-flex items-center px-4 py-2 rounded-md shadow-sm ${model.gated ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white text-sm font-medium`}
          >
            {isEmbeddingModel ? 'Download Embedding Model' : 'Download & Install (Torch/vLLM)'}
          </button>
        )}
      </div>
    </div>
    </>
  );
};

HuggingFaceModelDetail.propTypes = {
  model: PropTypes.object,
  onDownload: PropTypes.func.isRequired,
  onRefreshModels: PropTypes.func,
  isLoading: PropTypes.bool,
  downloadId: PropTypes.string,
  onComplete: PropTypes.func,
  onError: PropTypes.func,
  onDismiss: PropTypes.func,
  onCancel: PropTypes.func,
  isAirGapped: PropTypes.bool
};

export default HuggingFaceModelDetail;
