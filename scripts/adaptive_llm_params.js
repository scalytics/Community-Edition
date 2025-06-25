/**
 * Adaptive LLM parameter utility for handling different parameter naming schemes
 * across various versions of llama-cpp-python and other libraries.
 */

// Common parameter naming schemes across different LLM libraries and versions
const PARAMETER_MAPPINGS = {
  // Parameter to control number of output tokens
  maxOutputTokens: {
    'llama-cpp-python-0.2.x': 'n_predict',
    'llama-cpp-python-0.3.x': 'max_new_tokens',
    'openai-compatible': 'max_tokens',
    'transformers': 'max_length',
    'langchain': 'max_tokens'
  },
  
  // Parameter to control sampling temperature
  temperature: {
    'llama-cpp-python': 'temp',
    'openai-compatible': 'temperature',
    'transformers': 'temperature',
    'langchain': 'temperature'
  },
  
  // Parameter to control context window size
  contextWindow: {
    'llama-cpp-python': 'n_ctx',
    'openai-compatible': 'max_context_length',
    'transformers': 'max_length',
    'langchain': 'context_window'
  },
  
  // Parameter for repetition penalty
  repetitionPenalty: {
    'llama-cpp-python': 'repeat_penalty',
    'openai-compatible': 'frequency_penalty',
    'transformers': 'repetition_penalty',
    'langchain': 'repetition_penalty'
  },
  
  // Parameter for top-k sampling
  topK: {
    'llama-cpp-python': 'top_k',
    'openai-compatible': 'top_k',
    'transformers': 'top_k',
    'langchain': 'top_k'
  },
  
  // Parameter for top-p/nucleus sampling
  topP: {
    'llama-cpp-python': 'top_p',
    'openai-compatible': 'top_p',
    'transformers': 'top_p',
    'langchain': 'top_p'
  }
};

/**
 * Map a standard parameter name to the appropriate name for a specific library
 * 
 * @param {string} standardName - The standard parameter name
 * @param {string} libraryType - The library or version to map for
 * @returns {string} The library-specific parameter name
 */
function mapParameterName(standardName, libraryType) {
  const parameterMap = PARAMETER_MAPPINGS[standardName];
  if (!parameterMap) {
    console.warn(`Unknown standard parameter name: ${standardName}`);
    return standardName; // Return unchanged if mapping not found
  }
  
  return parameterMap[libraryType] || standardName;
}

/**
 * Detect the llama-cpp-python version from error messages
 * 
 * @param {string} errorMessage - The error message from a failed call
 * @returns {string|null} The detected library type or null if not detected
 */
function detectLibraryFromError(errorMessage) {
  if (!errorMessage) return null;
  
  if (errorMessage.includes('n_predict')) {
    return 'llama-cpp-python-0.2.x';
  } else if (errorMessage.includes('max_new_tokens')) {
    return 'llama-cpp-python-0.3.x';
  } else if (errorMessage.includes('max_tokens')) {
    return 'openai-compatible';
  }
  
  return null;
}

/**
 * Create an adaptive parameter object that can work with different library versions
 * 
 * @param {Object} standardParams - Standard parameters using our naming convention
 * @param {string} targetLibrary - The target library type
 * @returns {Object} - Parameters adapted for the target library
 */
function createAdaptiveParams(standardParams, targetLibrary = 'llama-cpp-python-0.3.x') {
  const adaptedParams = {};
  
  for (const [paramName, paramValue] of Object.entries(standardParams)) {
    // Skip null or undefined values
    if (paramValue === null || paramValue === undefined) continue;
    
    // Map the parameter name if it exists in our mappings
    if (PARAMETER_MAPPINGS[paramName]) {
      const mappedName = mapParameterName(paramName, targetLibrary);
      adaptedParams[mappedName] = paramValue;
    } else {
      // For parameters not in our mapping, pass through unchanged
      adaptedParams[paramName] = paramValue;
    }
  }
  
  return adaptedParams;
}

/**
 * Generate parameter options for different versions to try
 * 
 * @param {Object} standardParams - Standard parameters using our naming convention
 * @returns {Object[]} Array of parameter objects to try in order
 */
function generateFallbackOptions(standardParams) {
  // Order of libraries to try (most common first)
  const librariesToTry = [
    'llama-cpp-python-0.3.x',  // Latest version first
    'llama-cpp-python-0.2.x',  // Then older version
    'openai-compatible',       // Then general OpenAI style
    'transformers'             // Finally try transformers style
  ];
  
  return librariesToTry.map(library => ({
    library,
    params: createAdaptiveParams(standardParams, library)
  }));
}

module.exports = {
  mapParameterName,
  createAdaptiveParams,
  generateFallbackOptions,
  detectLibraryFromError,
  PARAMETER_MAPPINGS
};

// Testing functionality if run directly
if (require.main === module) {
  const testParams = {
    maxOutputTokens: 1024,
    temperature: 0.7,
    topP: 0.95,
    repetitionPenalty: 1.1
  };
  
  console.log('Testing adaptive parameter mapping:');
  console.log('---------------------------------');
  
  const adaptedForLlamaCpp03 = createAdaptiveParams(testParams, 'llama-cpp-python-0.3.x');
  console.log('For llama-cpp-python 0.3.x:');
  console.log(adaptedForLlamaCpp03);
  
  const adaptedForLlamaCpp02 = createAdaptiveParams(testParams, 'llama-cpp-python-0.2.x');
  console.log('\nFor llama-cpp-python 0.2.x:');
  console.log(adaptedForLlamaCpp02);
  
  const adaptedForOpenAI = createAdaptiveParams(testParams, 'openai-compatible');
  console.log('\nFor OpenAI-compatible APIs:');
  console.log(adaptedForOpenAI);
  
  const fallbackOptions = generateFallbackOptions(testParams);
  console.log('\nFallback options to try in sequence:');
  fallbackOptions.forEach((option, index) => {
    console.log(`\nOption ${index + 1} (${option.library}):`);
    console.log(option.params);
  });
}
