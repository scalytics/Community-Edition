/**
 * VRAM Calculator for vLLM Models
 * Estimates VRAM requirements based on model parameters and quantization
 */

const fs = require('fs');
const path = require('path');

/**
 * Read model configuration from config.json in model directory
 * @param {string} modelPath - Path to the model directory
 * @returns {Object|null} - Model config object or null if not found
 */
function readModelConfig(modelPath) {
  try {
    const configPath = path.join(modelPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.log(`[VRAM Calc] Could not read config.json from ${modelPath}:`, error.message);
  }
  return null;
}

/**
 * Extract model parameters from config.json
 * @param {Object} config - Model configuration object
 * @returns {Object|null} - {totalParams, activeParams, expertCount, isMoE}
 */
function extractParametersFromConfig(config) {
  if (!config) return null;
  
  try {
    // Handle different parameter count fields
    let totalParams = null;
    
    // Try common parameter count fields
    if (config.num_parameters) {
      totalParams = config.num_parameters;
    } else if (config.n_params) {
      totalParams = config.n_params;
    } else if (config.total_params) {
      totalParams = config.total_params;
    }
    
    // Convert from raw count to billions
    if (totalParams && totalParams > 1000000) {
      totalParams = totalParams / 1000000000; // Convert to billions
    }
    
    // Check for MoE architecture
    const isMoE = !!(config.num_local_experts || config.moe || config.expert_count);
    let expertCount = 1;
    let activeParams = totalParams;
    
    if (isMoE) {
      expertCount = config.num_local_experts || config.expert_count || 8;
      // For MoE, typically 2 experts are active per token
      const activeExperts = config.num_experts_per_tok || config.top_k || 2;
      activeParams = totalParams ? (totalParams / expertCount) * activeExperts : null;
    }
    
    if (totalParams && totalParams > 0) {
      return {
        totalParams,
        activeParams: activeParams || totalParams,
        expertCount,
        isMoE
      };
    }
  } catch (error) {
    console.log(`[VRAM Calc] Error extracting parameters from config:`, error.message);
  }
  
  return null;
}

/**
 * Extract model size from model name/path and detect MoE patterns
 * @param {string} modelName - The model name or ID
 * @returns {Object} - {totalParams, activeParams, expertCount, isMoE}
 */
function extractModelSizeFromName(modelName) {
  const name = modelName.toLowerCase();
  
  // MoE pattern detection: "17B-16E" or "8x7B" etc.
  const moeMatch = name.match(/(\d+)b[_-](\d+)e/i) || name.match(/(\d+)x(\d+)b/i);
  
  if (moeMatch) {
    if (name.match(/(\d+)b[_-](\d+)e/i)) {
      // Pattern: "17B-16E" - total params and expert count
      const totalParams = parseInt(moeMatch[1], 10);
      const expertCount = parseInt(moeMatch[2], 10);
      // Typically 2 experts active per token in most MoE architectures
      const activeParams = Math.max(1, (totalParams / expertCount) * 2);
      
      return {
        totalParams,
        activeParams,
        expertCount,
        isMoE: true
      };
    } else {
      // Pattern: "8x7B" - expert count and params per expert
      const expertCount = parseInt(moeMatch[1], 10);
      const paramsPerExpert = parseInt(moeMatch[2], 10);
      const totalParams = expertCount * paramsPerExpert;
      const activeParams = paramsPerExpert * 2; // Usually 2 experts active
      
      return {
        totalParams,
        activeParams,
        expertCount,
        isMoE: true
      };
    }
  }
  
  // Standard model patterns
  let standardSize = null;
  if (name.includes('70b') || name.includes('72b')) standardSize = 70;
  else if (name.includes('34b') || name.includes('33b')) standardSize = 34;
  else if (name.includes('27b')) standardSize = 27;
  else if (name.includes('22b') || name.includes('20b')) standardSize = 22;
  else if (name.includes('17b')) standardSize = 17;
  else if (name.includes('13b') || name.includes('14b')) standardSize = 13;
  else if (name.includes('12b')) standardSize = 12; // ADDED: Missing 12B pattern
  else if (name.includes('11b')) standardSize = 11;
  else if (name.includes('9b')) standardSize = 9;
  else if (name.includes('8b')) standardSize = 8;
  else if (name.includes('7b')) standardSize = 7;
  else if (name.includes('3b')) standardSize = 3;
  else if (name.includes('1b')) standardSize = 1;
  
  if (standardSize) {
    return {
      totalParams: standardSize,
      activeParams: standardSize,
      expertCount: 1,
      isMoE: false
    };
  }
  
  return null;
}

/**
 * Estimate model parameters from file size
 * @param {number} fileSizeBytes - File size in bytes
 * @param {string} quantizationMethod - Quantization method
 * @returns {number} - Estimated parameters in billions
 */
function estimateParametersFromFileSize(fileSizeBytes, quantizationMethod = 'fp16') {
  if (!fileSizeBytes || fileSizeBytes <= 0) return null;
  
  const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
  
  // Rough estimates based on quantization
  switch (quantizationMethod) {
    case 'awq':
    case 'int4':
      return sizeGB / 0.55; // ~0.55GB per billion parameters for INT4
    case 'int8':
      return sizeGB / 1.1;  // ~1.1GB per billion parameters for INT8
    case 'fp16':
    default:
      return sizeGB / 2.2;  // ~2.2GB per billion parameters for FP16
  }
}

/**
 * Calculate KV cache memory requirements
 * @param {number} modelSizeB - Model size in billions of parameters
 * @param {number} contextWindow - Context window size in tokens
 * @param {string} quantizationMethod - Quantization method
 * @returns {number} - KV cache memory in GB
 */
function calculateKVCacheMemory(config, contextWindow, precision) {
  // Use actual hidden size and number of layers from config.json
  const textConfig = config?.text_config || config;
  const hiddenSize = textConfig?.hidden_size;
  const numLayers = textConfig?.num_hidden_layers;

  // If essential parameters are missing, we cannot calculate accurately.
  if (!hiddenSize || !numLayers) {
    console.error('[VRAM Calc] CRITICAL: hidden_size or num_hidden_layers not found in model config. Cannot calculate KV cache.');
    return 0; // Return 0 to indicate failure, preventing incorrect estimates.
  }

  // KV cache is almost always stored in FP16 for accuracy, regardless of model weight precision.
  const bytesPerElement = 2; // 16-bit precision for KV cache

  // KV cache memory = 2 (key + value) * num_layers * hidden_size * context_length * bytes_per_element
  const kvCacheBytes = 2 * numLayers * hiddenSize * contextWindow * bytesPerElement;
  return kvCacheBytes / (1024 * 1024 * 1024); // Convert to GB
}

/**
 * Calculate VRAM for the vision tower based on its configuration.
 * @param {Object} visionConfig - The vision_config object from config.json.
 * @param {number} bytesPerParam - Bytes per parameter based on model precision.
 * @returns {number} - Estimated VRAM in GB for the vision tower.
 */
function getVisionTowerVram(visionConfig, bytesPerParam) {
  if (!visionConfig) return 0;

  // Heuristic based on common Vision Transformer (ViT) architectures.
  const hiddenSize = visionConfig.hidden_size;
  const intermediateSize = visionConfig.intermediate_size;
  const numLayers = visionConfig.num_hidden_layers;

  // If essential parameters are missing, fall back to a fixed size.
  if (!hiddenSize || !numLayers || !intermediateSize) {
    console.log('[VRAM Calc] Vision config incomplete, falling back to 4GB fixed size for vision tower.');
    return 4.0;
  }

  // Simplified parameter estimation for a ViT model.
  // This is an approximation but better than a fixed value.
  // It accounts for Attention (QKV, Output) and MLP layers.
  const attentionParams = 4 * Math.pow(hiddenSize, 2);
  const mlpParams = 2 * hiddenSize * intermediateSize;
  const transformerBlockParams = attentionParams + mlpParams;
  const totalTransformerParams = numLayers * transformerBlockParams;

  // Add patch embedding and positional embedding estimates.
  const patchSize = visionConfig.patch_size || 14;
  const imageSize = visionConfig.image_size || 336;
  const numPatches = Math.pow(Math.floor(imageSize / patchSize), 2);
  const otherEmbeddingParams = (numPatches + 1) * hiddenSize + Math.pow(patchSize, 2) * 3 * hiddenSize;

  const totalParams = totalTransformerParams + otherEmbeddingParams;
  const visionModelVram = (totalParams * bytesPerParam) / (1024 * 1024 * 1024);

  console.log(`[VRAM Calc] Calculated vision tower params: ${(totalParams / 1e9).toFixed(2)}B, VRAM: ${visionModelVram.toFixed(2)}GB`);
  return visionModelVram;
}

/**
 * Calculate VRAM requirements for a model
 * @param {Object} model - Model object with size and configuration
 * @returns {number|null} - Estimated VRAM in GB, or null if cannot calculate
 */
function calculateVRAMRequirement(model) {
  // Skip external and embedding models
  if (model.external_provider_id || model.is_embedding_model) return null;

  // Read config.json as the primary source of truth
  const config = model.model_path ? readModelConfig(model.model_path) : null;

  let modelInfo = null;

  // PRIORITY 1: Use config.json if available
  if (config) {
    modelInfo = extractParametersFromConfig(config);
    if (modelInfo) {
      console.log(`[VRAM Calc] Read from config.json: ${modelInfo.totalParams}B parameters`);
    }
  }

  // PRIORITY 2: Fallback to name/repo if config.json is missing or unreadable
  if (!modelInfo) {
    const sourceName = model.huggingface_repo || model.name || '';
    modelInfo = extractModelSizeFromName(sourceName);
    if (modelInfo) {
      console.log(`[VRAM Calc] Extracted from name/repo '${sourceName}': ${modelInfo.totalParams}B parameters`);
    }
  }

  // PRIORITY 3: Fallback to file size estimation
  if (!modelInfo && model.file_size) {
    const estimatedSize = estimateParametersFromFileSize(model.file_size, model.quantization_method || 'fp16');
    if (estimatedSize) {
      modelInfo = { totalParams: estimatedSize, activeParams: estimatedSize, expertCount: 1, isMoE: false };
      console.log(`[VRAM Calc] Estimated from file size: ${estimatedSize.toFixed(2)}B parameters`);
    }
  }

  // If size cannot be determined, exit
  if (!modelInfo || !modelInfo.activeParams || modelInfo.activeParams <= 0) {
    console.log(`[VRAM Calc] Could not determine model size for ${model.name}`);
    return null;
  }

  const { totalParams, activeParams, expertCount, isMoE } = modelInfo;

  // Determine precision, prioritizing the on-disk config file
  const precisionFromConfig = config?.torch_dtype === 'bfloat16' ? 'bf16' : (config?.torch_dtype || null);
  const precision = model.model_precision || model.quantization_method || precisionFromConfig || 'fp16';

  // Calculate bytes per parameter based on precision
  let bytesPerParam;
  switch (precision) {
    case 'int4':
    case 'awq':
      bytesPerParam = 0.5; break;
    case 'int8':
    case 'fp8':
      bytesPerParam = 1; break;
    case 'bfloat16':
    case 'bf16':
    case 'fp16':
      bytesPerParam = 2; break;
    default:
      bytesPerParam = 2; // Default to fp16
  }

  // Model weights VRAM
  const weightsVram = isMoE ? (totalParams * bytesPerParam * 0.7) : (activeParams * bytesPerParam);

  // KV Cache VRAM (using the config we already read)
  const contextWindow = model.effective_context_window || model.context_window || 4096;
  const kvCacheVram = calculateKVCacheMemory(config, contextWindow, precision);

  // Vision Tower VRAM (using the config we already read)
  const visionVram = getVisionTowerVram(config?.vision_config, bytesPerParam);
  if (visionVram > 0) {
    console.log(`[VRAM Calc] Detected vision tower, adding ${visionVram.toFixed(2)}GB`);
  }

  // Framework overhead (scales with active model size)
  let frameworkOverhead = 0.5; // Base vLLM overhead
  if (activeParams >= 7) frameworkOverhead = 1;
  if (activeParams >= 13) frameworkOverhead = 1.5;
  if (activeParams >= 30) frameworkOverhead = 2;
  
  // MoE models have additional routing overhead
  if (isMoE) {
    frameworkOverhead += Math.min(1, expertCount * 0.05); // Small overhead per expert
  }
  
  let totalVram = weightsVram + kvCacheVram + visionVram + frameworkOverhead;
  
  // Account for tensor parallelism (multi-GPU) - only divide model weights, not overhead
  const tensorParallelSize = model.tensor_parallel_size || 1;
  if (tensorParallelSize > 1) {
    const weightsPerGpu = weightsVram / tensorParallelSize;
    totalVram = weightsPerGpu + kvCacheVram + (frameworkOverhead / tensorParallelSize);
  }
  
  console.log(`[VRAM Calc] ${model.name}: ${isMoE ? `MoE ${totalParams}B total, ${activeParams}B active` : `${activeParams}B`}, Precision: ${precision}, Context: ${contextWindow}`);
  console.log(`[VRAM Calc] Breakdown - Weights: ${weightsVram.toFixed(1)}GB, KV Cache: ${kvCacheVram.toFixed(2)}GB, Overhead: ${frameworkOverhead}GB, Total: ${totalVram.toFixed(1)}GB`);
  
  return Math.max(1, Math.round(totalVram * 10) / 10); // Round to 1 decimal place, minimum 1GB
}

module.exports = {
  extractModelSizeFromName,
  estimateParametersFromFileSize,
  calculateVRAMRequirement,
  readModelConfig,
  extractParametersFromConfig,
  getVisionTowerVram
};
