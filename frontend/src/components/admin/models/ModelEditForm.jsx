import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import useHardwareInfo from '../huggingface/hooks/useHardwareInfo';

// Dynamic VRAM calculation that factors in context window AND precision
const getModelVramRequirement = (model, contextWindow = null, precision = null) => {
  // Extract model size from name
  const name = model.name?.toLowerCase() || '';
  let modelSizeB = 7; // Conservative default
  
  if (name.includes('70b') || name.includes('72b')) modelSizeB = 70;
  else if (name.includes('34b') || name.includes('33b')) modelSizeB = 34;
  else if (name.includes('27b')) modelSizeB = 27;
  else if (name.includes('22b') || name.includes('20b')) modelSizeB = 22;
  else if (name.includes('17b')) modelSizeB = 17;
  else if (name.includes('13b') || name.includes('14b')) modelSizeB = 13;
  else if (name.includes('12b')) modelSizeB = 12;
  else if (name.includes('11b')) modelSizeB = 11;
  else if (name.includes('9b')) modelSizeB = 9;
  else if (name.includes('8b')) modelSizeB = 8;
  else if (name.includes('7b')) modelSizeB = 7;
  else if (name.includes('3b')) modelSizeB = 3;
  else if (name.includes('1b')) modelSizeB = 1;
  
  // Get effective precision - defaults to auto/fp16
  const effectivePrecision = precision || model.model_precision || 'auto';
  
  // Model weights calculation based on precision
  let bytesPerParam = 2; // Default FP16/BF16
  if (effectivePrecision === 'fp8') bytesPerParam = 1;
  else if (effectivePrecision === 'int8') bytesPerParam = 1;
  else if (effectivePrecision === 'int4') bytesPerParam = 0.5;
  else if (effectivePrecision === 'int2') bytesPerParam = 0.25;
  
  const modelWeightsGB = modelSizeB * bytesPerParam;
  
  // Get effective context window
  const effectiveContext = contextWindow || model.context_window || model.auto_detected_context || 4096;
  const contextTokens = parseInt(effectiveContext);
  
  // KV cache calculation: 2 * num_layers * hidden_size * context_length * 2 bytes (FP16)
  // Get actual model architecture parameters
  let numLayers, hiddenSize;
  
  if (modelSizeB >= 70) {
    numLayers = 80; hiddenSize = 8192;  // 70B models
  } else if (modelSizeB >= 34) {
    numLayers = 60; hiddenSize = 8192;  // 34B models  
  } else if (modelSizeB >= 12) {
    numLayers = 48; hiddenSize = 3840;  // 12B models (Gemma-3-12B)
  } else if (modelSizeB >= 7) {
    numLayers = 32; hiddenSize = 4096;  // 7B models
  } else if (modelSizeB >= 3) {
    numLayers = 26; hiddenSize = 3200;  // 3B models
  } else {
    numLayers = 16; hiddenSize = 2048;  // 1B models
  }
  
  // KV cache = 2 (key + value) * num_layers * hidden_size * context_length * 2 bytes (FP16)
  const kvCacheBytes = 2 * numLayers * hiddenSize * contextTokens * 2;
  const kvCacheGB = kvCacheBytes / (1024 * 1024 * 1024);
  
  // vLLM overhead (compilation, attention, etc.) - scales with model size
  const vllmOverheadGB = Math.max(2, modelSizeB * 0.1);
  
  const totalVRAM = modelWeightsGB + kvCacheGB + vllmOverheadGB;
  
  return Math.round(totalVRAM * 10) / 10;
};

const ModelEditForm = ({
  formData,
  isExternalModel,
  providers,
  handleInputChange,
  handleModelTypeChange,
  handleSubmit,
  resetForm,
  saving,
  onActivateAndSave,
  activating,
  poolStatus
}) => {
  const { recommendations } = useHardwareInfo();

  // Memoize the parsed configuration to avoid re-parsing on every render
  const { fullConfig, effectivePrecision, currentTensorParallelSize } = useMemo(() => {
    let parsedConfig = {};
    let onDiskConfig = {};

    // 1. Parse the config JSON from the database
    try {
      if (formData.config) {
        parsedConfig = JSON.parse(formData.config);
        onDiskConfig = parsedConfig.full_config_on_disk || {};
      }
    } catch (e) {
      console.error("Error parsing model config JSON:", e);
    }

    // 2. Determine Tensor Parallel Size
    // Precedence: Live form state > Saved DB value (top-level formData) > Config JSON > On-disk state > Default
    const tpSize = formData.tensor_parallel_size || parsedConfig.tensor_parallel_size || onDiskConfig.tensor_parallel_size || 1;

    // 3. Determine Model Precision
    // Precedence: Live form state > Saved quantization method (from config JSON) > On-disk torch_dtype > Default
    let precision = formData.model_precision;

    // If no live form precision, derive from quantization method
    if (!precision || precision === 'auto') {
      // The quantization method is stored in the config JSON, not as a top-level field
      const configQMethod = parsedConfig.quantization_method?.toLowerCase();
      
      if (configQMethod && configQMethod !== 'none') {
        if (configQMethod.includes('int4') || configQMethod.includes('awq') || configQMethod.includes('gptq')) {
          precision = 'int4';
        } else if (configQMethod.includes('int8')) {
          precision = 'int8';
        } else if (configQMethod.includes('int2')) {
          precision = 'int2';
        }
      }
    }

    // If still no precision, fall back to on-disk torch_dtype
    if (!precision || precision === 'auto') {
      precision = onDiskConfig.torch_dtype;
    }

    return {
      fullConfig: onDiskConfig,
      effectivePrecision: (precision || 'auto').toLowerCase(),
      currentTensorParallelSize: Number(tpSize)
    };
  }, [formData.config, formData.model_precision, formData.tensor_parallel_size]);

  // Get context window and precision - prioritize form selections over stored values
  const selectedContext = formData.context_window || formData.auto_detected_context || 4096;
  const modelVRAM = getModelVramRequirement(formData, selectedContext, effectivePrecision);

  return (
    <div className="p-6 border-t border-gray-200 dark:border-dark-border">
      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary mb-4">
        {formData.id ? 'Edit Model' : 'Add New Model'}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="text-sm p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
          <span className="font-medium text-blue-700 dark:text-dark-text-primary">
            {isExternalModel ? 'External API Model' : 'Local Model'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Model Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              value={formData.name}
              onChange={handleInputChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-gray-100 dark:bg-dark-primary text-gray-900 dark:text-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm cursor-not-allowed"
              required
              readOnly 
            />
          </div>

          <div className="sm:col-span-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              value={formData.description}
              onChange={handleInputChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
            />
          </div>

          {/* Scala System Prompt Toggle */}
          <div className="sm:col-span-6 pt-4 border-t border-gray-200 dark:border-dark-border">
            <div className="relative flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="enable_scala_prompt"
                  name="enable_scala_prompt" 
                  type="checkbox"
                  checked={formData.enable_scala_prompt || false} 
                  onChange={handleInputChange} 
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-500 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="enable_scala_prompt" className="font-medium text-gray-700 dark:text-gray-300">
                  Enable Auri System Prompt
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Enforce the standard Scala system prompt for this model.
                </p>
              </div>
            </div>
          </div>

        </div>

        {isExternalModel ? (
          <>
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="external_provider_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Provider
                </label>
                <select
                  id="external_provider_id"
                  name="external_provider_id"
                  value={formData.external_provider_id}
                  onChange={handleInputChange}
                  className="mt-1 block w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                  required={isExternalModel}
                >
                  <option value="">Select Provider</option>
                  {providers && providers.length > 0 ? (
                    providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))
                  ) : (
                    <option value="manual">Manual Entry (Provider API unavailable)</option>
                  )}
                </select>
                {providers.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                    Provider API is unavailable. Your model will still work, but provider info must be entered manually.
                  </p>
                )}
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="external_model_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model ID
                </label>
                <input
                  type="text"
                  name="external_model_id"
                  id="external_model_id"
                  value={formData.external_model_id}
                  onChange={handleInputChange}
                  placeholder="e.g., gpt-4, claude-3-opus-20240229"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                  required={isExternalModel}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="sm:col-span-6 space-y-4">
              <div>
                <label htmlFor="model_path" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model Path
                </label>
                <input
                  type="text"
                  name="model_path"
                  id="model_path"
                  value={formData.model_path}
                  onChange={handleInputChange}
                  placeholder="./models/your-model-folder"
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-gray-100 dark:bg-dark-primary text-gray-900 dark:text-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm cursor-not-allowed"
                  required={!isExternalModel}
                  readOnly 
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Path to the model files on the server (read-only).
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Context Window */}
                <div>
                  <label htmlFor="context_window" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Context Window (tokens)
                  </label>
                  <select
                    name="context_window"
                    id="context_window"
                    value={formData.context_window || ''}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                  >
                    <option value="">Auto-detected ({formData.auto_detected_context || 'Unknown'})</option>
                    <option value="512">512 tokens (512) - Development Testing</option>
                    <option value="1024">1k tokens (1,024) - Tiny</option>
                    <option value="2048">2k tokens (2,048) - Minimal</option>
                    <option value="4096">4k tokens (4,096) - Standard</option>
                    <option value="8192">8k tokens (8,192) - Extended</option>
                    <option value="16384">16k tokens (16,384) - Long Context</option>
                    <option value="32768">32k tokens (32,768) - vLLM Maximum</option>
                    <option value="65536" disabled style={{color: '#9CA3AF'}}>64k tokens (65,536) - Not supported in vLLM 0.9.1</option>
                    <option value="131072" disabled style={{color: '#9CA3AF'}}>128k tokens (131,072) - Not supported in vLLM 0.9.1</option>
                    <option value="262144" disabled style={{color: '#9CA3AF'}}>256k tokens (262,144) - Not supported in vLLM 0.9.1</option>
                    <option value="524288" disabled style={{color: '#9CA3AF'}}>512k tokens (524,288) - Not supported in vLLM 0.9.1</option>
                    <option value="1048576" disabled style={{color: '#9CA3AF'}}>1M tokens (1,048,576) - Not supported in vLLM 0.9.1</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-detected: {formData.auto_detected_context || 'Unknown'}
                  </p>
                </div>

                {/* Model Precision */}
                <div>
                  <label htmlFor="model_precision" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Model Precision
                  </label>
                  <select
                    name="model_precision"
                    id="model_precision"
                    value={effectivePrecision}
                    onChange={handleInputChange}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm"
                  >
                    <option value="auto">Auto (Use On-Disk: {fullConfig.torch_dtype || 'Unknown'})</option>
                    
                    {/* Show FP16/FP8 only for non-quantized models */}
                    {(!formData.quantization_method || formData.quantization_method === 'none') && recommendations && recommendations.effectiveVramLimitGb >= 16 && (
                      <option value="fp16">FP16 - Maximum Quality</option>
                    )}
                    {(!formData.quantization_method || formData.quantization_method === 'none') && recommendations && recommendations.effectiveVramLimitGb >= 12 && (
                      <option value="fp8">FP8 - High Quality, Less VRAM</option>
                    )}
                    
                    {/* Always show lower precisions for memory savings */}
                    <option value="int8">INT8 - Reduce Memory Usage</option>
                    <option value="int4">INT4 - Maximum Memory Savings</option>
                    
                    {/* Experimental options for very low memory */}
                    {formData.quantization_method && formData.quantization_method.includes('awq') && (
                      <option value="int2">INT2 - Extreme Compression (Experimental)</option>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formData.quantization_method && formData.quantization_method !== 'none' ? (
                      <>
                        Downloaded: <span className="text-blue-600 dark:text-blue-400">{formData.quantization_method.toUpperCase()}</span>
                        {formData.quantization_method.includes('awq') ? ' (already ~4-bit, can only compress further)' : ' (can only compress further)'}
                      </>
                    ) : (
                      'FP16 models can be dynamically quantized. Quantized models can only be compressed further.'
                    )}
                  </p>
                </div>
              </div>

              {/* VRAM Impact Warning - Spans full width below the dropdowns */}
              <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3">
                <div className="font-medium text-amber-800 dark:text-amber-300 mb-2">VRAM Impact</div>
                <div className="text-amber-700 dark:text-amber-300 space-y-1">
                  <div>• <strong>512 tokens:</strong> Minimal VRAM (perfect for 8GB systems)</div>
                  <div>• <strong>2k context:</strong> Small VRAM usage</div>
                  <div>• <strong>4k context:</strong> Baseline VRAM usage</div>
                  <div>• <strong>32k context:</strong> +2-4GB VRAM (8x more KV cache)</div>
                  <div>• <strong>128k context:</strong> +8-16GB VRAM (32x more KV cache)</div>
                  <div className="text-amber-600 dark:text-amber-400 font-medium mt-2">
                    Higher context = exponentially more VRAM needed! Use 512 tokens for development testing.
                  </div>
                </div>
              </div>


              {/* vLLM GPU Configuration */}
          {!isExternalModel && (
            <div className="sm:col-span-6 pt-4 border-t border-gray-200 dark:border-dark-border">
              <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-4">GPU Configuration</h4>
              
              {recommendations && recommendations.gpus.length > 0 ? (
                  <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tensor Parallel Size (Number of GPUs)
                    </label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Currently:</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                        currentTensorParallelSize === 2 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' :
                        currentTensorParallelSize === 3 ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' :
                        currentTensorParallelSize >= 4 ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {currentTensorParallelSize} GPU{currentTensorParallelSize > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  
                  {/* Actual GPU-based selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: Math.min(recommendations.gpus.length, 4) }, (_, i) => {
                      const gpuCount = i + 1;
                      const isSelected = gpuCount === currentTensorParallelSize; // Exact match for the selected one
                      const isUsed = gpuCount <= currentTensorParallelSize; // All GPUs that are part of the parallel group
                      const isAvailable = gpuCount <= recommendations.gpus.length;
                      const totalVRAM = parseFloat(recommendations.effectiveVramLimitGb) * gpuCount;
                      const isSufficient = modelVRAM <= totalVRAM;
                      
                      // Check tensor parallelism constraint: attention heads must be divisible by GPU count
                      const attentionHeads = fullConfig?.text_config?.num_attention_heads || 16;
                      const isValidTensorParallel = (attentionHeads % gpuCount) === 0;
                      
                      const isClickable = isAvailable && isSufficient && isValidTensorParallel;
                      const minGpusRequired = Math.ceil(modelVRAM / recommendations.effectiveVramLimitGb);
                      const isRecommended = gpuCount === minGpusRequired && isValidTensorParallel;

                      return (
                        <div
                          key={gpuCount}
                          onClick={() => isClickable && handleInputChange({ target: { name: 'tensor_parallel_size', value: gpuCount } })}
                          className={`relative rounded-lg border-2 p-4 transition-all duration-200 ${
                            !isClickable
                              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                              : isSelected
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-400 cursor-pointer ring-2 ring-green-200 dark:ring-green-800 shadow-lg'
                                : isUsed
                                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500 cursor-pointer'
                                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div className={`w-4 h-4 rounded-full border-2 mr-2 ${
                                !isClickable
                                  ? 'border-gray-300 dark:border-gray-600'
                                  : isSelected 
                                    ? 'bg-green-500 border-green-500' 
                                    : isUsed
                                      ? 'bg-blue-500 border-blue-500'
                                      : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {isUsed && isClickable && <div className="w-full h-full rounded-full bg-white scale-50"></div>}
                              </div>
                              <span className={`font-medium ${isClickable ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-600'}`}>
                                {gpuCount} GPU{gpuCount > 1 ? 's' : ''}
                              </span>
                            </div>
                            {isRecommended && isClickable && (
                               <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                 Recommended
                               </span>
                            )}
                            {isSufficient && !isRecommended && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                ✓ Fits
                              </span>
                            )}
                            {!isSufficient && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                ✗ Too Small
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ~{totalVRAM.toFixed(1)}GB total VRAM
                          </div>
                          {isAvailable && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {Math.ceil(modelVRAM / gpuCount)}GB per GPU
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Hardware info */}
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start">
                      <svg className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        <div className="font-medium mb-1">Detected Hardware</div>
                        <div>• GPUs: {recommendations.gpus.length}x {recommendations.isAppleSilicon ? 'Apple Silicon' : 'GPU'}</div>
                        <div>• Available VRAM: {recommendations.effectiveVramLimitGb}GB per GPU</div>
                        <div>• Model requirement: ~{modelVRAM}GB</div>
                        <div className="mt-1 font-medium">
                          Recommendation: {recommendations.recommendationText}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start">
                    <svg className="h-4 w-4 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="text-xs text-yellow-700 dark:text-yellow-300">
                      <div className="font-medium mb-1">No compatible GPU detected</div>
                      <div>vLLM requires CUDA-enabled GPUs. Please ensure your hardware supports CUDA for optimal performance.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          </div>
        )}

        {/* vLLM Info Box - Only show for Local Models */}
        {!isExternalModel && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800 dark:text-green-300">
                  vLLM Configuration Ready
                </h3>
                <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                  <p>This model is configured for vLLM with optimized settings for performance and GPU utilization.</p>
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    Context window and batch sizes are dynamically managed by vLLM based on available VRAM.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}


        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={resetForm}
            className="py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 ${
              saving ? 'opacity-75 cursor-not-allowed' : ''
            }`}
          >
            Save Config
          </button>
          {!isExternalModel && formData.id && Number(poolStatus?.activeModelId) !== Number(formData.id) && ( 
            <button
              type="button" 
              onClick={onActivateAndSave} 
              disabled={saving || activating || (poolStatus?.activeModelId && poolStatus?.activeModelId !== formData.id)} 
              title={poolStatus?.activeModelId && poolStatus?.activeModelId !== formData.id ? "Another model is active" : "Save configuration and activate model"}
              className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800 ${
                (saving || activating || (poolStatus?.activeModelId && poolStatus?.activeModelId !== formData.id)) ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
                Save & Activate
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

ModelEditForm.propTypes = {
  formData: PropTypes.object.isRequired,
  isExternalModel: PropTypes.bool.isRequired,
  providers: PropTypes.array.isRequired,
  handleInputChange: PropTypes.func.isRequired,
  handleModelTypeChange: PropTypes.func.isRequired,
  handleSubmit: PropTypes.func.isRequired, 
  resetForm: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  onActivateAndSave: PropTypes.func, 
  activating: PropTypes.bool, 
  poolStatus: PropTypes.object, 
};

export default ModelEditForm;
