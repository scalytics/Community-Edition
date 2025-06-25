/**
 * Hugging Face model search functionality
 * Includes VRAM pre-filtering based on detected GPU limits.
 */
const axios = require('axios');
const { getEffectiveGpuVramLimitGb } = require('../../controllers/hardwareController'); 

/**
 * Search for models on Hugging Face Hub
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of model objects
 */
async function searchModels(query, options = {}) {
  try {
    // Use user token if available, otherwise fall back to environment token
    const apiKey = options.userToken || process.env.HUGGINGFACE_API_KEY;
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    
    const response = await axios.get('https://huggingface.co/api/models', {
      headers,
      params: {
        search: query, 
        sort: options.sort || 'downloads',
        direction: options.direction || -1, 
        limit: options.limit || 50,
        library: 'pytorch' // Filter for PyTorch models
      }
    });

    let initialModels = response.data;
    let isEmbeddingSearch = false;

    // Check if the query is the special object for embedding models
    if (typeof query === 'object' && query !== null && query.pipeline_tag === 'sentence-similarity') {
        isEmbeddingSearch = true;
        // Use the original query object for the API call parameters if needed,
        // but for filtering logic below, we just need the flag.
        // The actual API call uses params.search, which was set correctly in the controller.
    }
    else if (typeof query === 'string' && query.toLowerCase() === 'mistral') {
      initialModels = response.data.filter(model =>
        model.id.toLowerCase().includes('mistral') || model.id.toLowerCase().includes('mixtral')
      );
    }
    // --- End Initial Filtering ---


    // VRAM pre-filtering has been removed. The vLLM architecture gives the user
    // more direct control, and the UI now shows VRAM limits to inform user choice.
    let finalFilteredModels = initialModels.filter(model => {
        const modelIdLower = model.id.toLowerCase();
        const isGGUF = modelIdLower.includes('gguf');
        const isQuantized = modelIdLower.includes('awq') || modelIdLower.includes('gptq');
        const isCommunityClone = modelIdLower.startsWith('thebloke/') || modelIdLower.startsWith('unsloth/') || modelIdLower.startsWith('mlx-community/') || modelIdLower.startsWith('lmstudio-community/');
        
        if (isGGUF || isQuantized || isCommunityClone) {
            return false;
        }

        if (modelIdLower.includes('gemma') && !modelIdLower.startsWith('google/')) {
            return false;
        }
        if ((modelIdLower.includes('llama') || modelIdLower.includes('vicuna')) && !modelIdLower.startsWith('meta-llama/')) {
            return false;
        }
        if (modelIdLower.includes('deepseek') && !modelIdLower.startsWith('deepseek-ai/')) {
            return false;
        }
        if (modelIdLower.includes('phi') && !modelIdLower.startsWith('microsoft/')) {
            return false;
        }
        if ((modelIdLower.includes('mistral') || modelIdLower.includes('mixtral')) && !modelIdLower.startsWith('mistralai/')) {
            return false;
        }

        return true;
    });

    return finalFilteredModels.map(model => ({
      modelId: model.id,
      name: model.id.split('/').pop(),
      description: model.description,
      downloads: model.downloads,
      stars: model.likes,
      tags: model.tags || [],
      pipeline_tag: model.pipeline_tag,
      license: model.license || model.model_license || model.cardData?.license || 'Unknown',
      lastModified: model.lastModified || model.last_modified || model.updatedAt || new Date().toISOString(),
      gated: model.gated === 'auto' || model.gated === true
    }));
  } catch (error) {
    console.error('Error searching Hugging Face models:', error);
    throw error;
  }
}

const getModelInfo = async (modelId, options = {}) => {
  try {
    // Use user token if available, otherwise fall back to environment token
    const apiKey = options.userToken || process.env.HUGGINGFACE_API_KEY;
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    
    // Fetch detailed model info with cardData (YAML front-matter parsing)
    const response = await axios.get(`https://huggingface.co/api/models/${modelId}`, {
      headers,
      params: {
        cardData: true,  // Parse YAML front-matter - this is the key!
        expand: 'cardData,siblings,downloads,likes' // Request expanded data as string
      }
    });
    
    const model = response.data;
    
    // Debug logging to see what's actually returned
    console.log(`[HF API Debug] Model ${modelId} response keys:`, Object.keys(model));
    console.log(`[HF API Debug] Model ${modelId} license field:`, model.license);
    console.log(`[HF API Debug] Model ${modelId} cardData:`, model.cardData ? Object.keys(model.cardData) : 'No cardData');
    if (model.cardData) {
      console.log(`[HF API Debug] Model ${modelId} cardData.license:`, model.cardData.license);
      console.log(`[HF API Debug] Model ${modelId} cardData.metadata:`, model.cardData.metadata);
    }
    
    // Enhanced metadata extraction with proper fallbacks
    return {
      ...model,
      modelId: model.id,
      name: model.id.split('/').pop(),
      description: model.description || model.cardData?.description || '',
      downloads: model.downloads || 0,
      stars: model.likes || 0,
      tags: model.tags || [],
      pipeline_tag: model.pipeline_tag,
      // Better license extraction - cardData.license is the key!
      license: model.cardData?.license || 
               model.license || 
               model.card_data?.license ||
               (model.cardData?.metadata?.license) ||
               'Unknown',
      // Better date extraction from multiple sources  
      lastModified: model.lastModified || 
                   model.last_modified || 
                   model.updatedAt ||
                   model.createdAt ||
                   new Date().toISOString(),
      gated: model.gated === 'auto' || model.gated === true
    };
  } catch (error) {
    console.error(`Error fetching model info for ${modelId}:`, error);
    throw error;
  }
};

const isModelGated = async (modelId) => {
  try {
    const modelInfo = await getModelInfo(modelId);
    return modelInfo.gated === 'auto' || modelInfo.gated === true;
  } catch (error) {
    // If the model is not found or another error occurs, assume it's not gated
    // or that the problem is not related to gating.
    return false;
  }
};

module.exports = { 
  searchModels,
  getModelInfo,
  isModelGated
};
