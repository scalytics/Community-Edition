const Model = require('../../models/Model'); 
const apiKeyService = require('../apiKeyService'); 
const { getSystemSetting } = require('../../config/systemConfig'); 
// const { embeddingWorkerService } = require('../embeddingWorkerService'); // Removed, service deleted
const { db } = require('../../models/db'); 
const axios = require('axios'); // For future Python API calls

/**
 * Selects the appropriate embedding model and its dimension based on system settings and availability.
 * Prioritizes local models, falls back to external if configured and usable (and not air-gapped).
 * @param {number} userId - The ID of the user requesting the embedding.
 * @returns {Promise<{model: object, dimension: number}|null>} Object with model and dimension, or null.
 */
async function selectEmbeddingModel(userId) {
    const preferredLocalId = getSystemSetting('preferred_local_embedding_model_id');
    const fallbackExternalId = getSystemSetting('fallback_external_embedding_model_id');
    const isAirGapped = getSystemSetting('air_gapped_mode', 'false') === 'true';

    let userGroups = [];
    try {
        userGroups = (await db.allAsync('SELECT group_id FROM user_groups WHERE user_id = ?', [userId])).map(g => g.group_id);
    } catch (groupError) {
        console.error(`[EmbeddingService] Error fetching groups for user ${userId}:`, groupError);
    }

    const checkGroupAccess = async (modelId) => {
        const user = await db.getAsync('SELECT is_admin FROM users WHERE id = ?', [userId]);
        if (user?.is_admin) return true;
        if (userGroups.length === 0) return false;
        const placeholders = userGroups.map(() => '?').join(',');
        const access = await db.getAsync(
            `SELECT 1 FROM group_model_access WHERE model_id = ? AND group_id IN (${placeholders}) AND can_access = 1 LIMIT 1`,
            [modelId, ...userGroups]
        );
        return !!access;
    };

    // 1. Try Preferred Local Model
    if (preferredLocalId) {
        try {
            const localModel = await Model.findById(preferredLocalId);
            if (localModel && localModel.is_active && !localModel.external_provider_id && localModel.is_embedding_model) { 
                 const hasAccess = await checkGroupAccess(localModel.id);
                 if (hasAccess) {
                     const dimension = localModel.embedding_dimension || 768; 
                     return { model: localModel, dimension };
                 } else {
                      console.warn(`[EmbeddingService] User ${userId} lacks group access to preferred local embedding model ${preferredLocalId}.`);
                 }
            } else {
                 console.warn(`[EmbeddingService] Preferred local embedding model (ID: ${preferredLocalId}) not found, inactive, not local, or not marked as embedding model.`);
            }
        } catch (error) {
            console.error(`[EmbeddingService] Error fetching/checking preferred local model (ID: ${preferredLocalId}):`, error);
        }
    }

    // 2. Try Fallback External Model (Not typically used for local embedding, but kept for completeness)
    if (!isAirGapped && fallbackExternalId) {
         try {
            const externalModel = await Model.findById(fallbackExternalId);
            if (externalModel && externalModel.is_active && externalModel.external_provider_id && externalModel.is_embedding_model) { 
                const hasValidKey = await apiKeyService.hasValidApiKey(userId, externalModel.external_provider_id);
                if (hasValidKey) {
                    const dimension = externalModel.embedding_dimension || 768;
                    return { model: externalModel, dimension };
                } else {
                     const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [externalModel.external_provider_id]);
                     console.warn(`[EmbeddingService] Fallback external model (ID: ${fallbackExternalId}) found, but user ${userId} lacks a valid API key for provider ${provider?.name || externalModel.external_provider_id}.`);
                }
            } else {
                 console.warn(`[EmbeddingService] Fallback external embedding model (ID: ${fallbackExternalId}) not found, inactive, not external, or not marked as embedding model.`);
            }
        } catch (error) {
            console.error(`[EmbeddingService] Error fetching fallback external model (ID: ${fallbackExternalId}):`, error);
        }
    } else if (isAirGapped) {
    } else {
    }

    // 3. If no specific models work, try finding *any* active local *embedding* model
     try {
        const anyLocalEmbeddingModel = await db.getAsync(`
            SELECT ${Model.columns}, embedding_dimension FROM models
            WHERE is_active = 1
              AND external_provider_id IS NULL
              AND is_embedding_model = 1
            ORDER BY id DESC LIMIT 1
        `);
        if (anyLocalEmbeddingModel) {
             const hasAccess = await checkGroupAccess(anyLocalEmbeddingModel.id);
             if (hasAccess) {
                 const dimension = anyLocalEmbeddingModel.embedding_dimension || 768;
                 return { model: anyLocalEmbeddingModel, dimension };
             } else {
             }
        }
     } catch (error) {
         console.error('[EmbeddingService] Error searching for any active local embedding model:', error);
     }


    console.error(`[EmbeddingService] No suitable embedding model found for user ${userId}.`);
    return null; 
}

/**
 * Generates embeddings and returns them along with the dimension used.
 * @param {string[]} chunks - Array of text chunks.
 * @param {number} userId - The ID of the user requesting embeddings.
 * @returns {Promise<{embeddings: number[][], dimension: number}>} Object containing embeddings and dimension.
 * @throws {Error} If no suitable embedding model is found or embedding fails.
 */
async function generateEmbeddings(chunks, userId) {
    if (!chunks || chunks.length === 0) {
        return { embeddings: [], dimension: 0 };
    }

    const selectionResult = await selectEmbeddingModel(userId);
    if (!selectionResult) {
        throw new Error("No available embedding model found or accessible for this user.");
    }

    const { model: selectedModel, dimension: expectedDimension } = selectionResult; // Renamed dimension to expectedDimension

    if (selectedModel.external_provider_id) {
         // This service is for local embedding models. External models should be handled elsewhere.
         console.error(`[EmbeddingService] Attempted to use external model ${selectedModel.id} (${selectedModel.name}) for local embedding generation.`);
         throw new Error("Configuration error: This EmbeddingService is for local models. External models cannot be used for local embedding generation via this service.");
    }

    // Call the Python FastAPI service for local embedding generation
    try {
        const pythonServiceBaseUrl = getSystemSetting('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');
        if (!pythonServiceBaseUrl || !pythonServiceBaseUrl.startsWith('http')) {
            console.error(`[EmbeddingService] Python service URL is not configured or invalid: '${pythonServiceBaseUrl}'`);
            throw new Error("Python embedding service URL is not configured correctly.");
        }

        const embedApiUrl = `${pythonServiceBaseUrl}/vector/embed-texts`;
        
        console.log(`[EmbeddingService] Requesting embeddings for ${chunks.length} chunks from ${embedApiUrl} using model (expected by Node): ${selectedModel.name || selectedModel.id}`);

        const apiResponse = await axios.post(embedApiUrl, { texts: chunks });

        if (!apiResponse.data || !Array.isArray(apiResponse.data.embeddings) || typeof apiResponse.data.dimension !== 'number' || !apiResponse.data.model_used) {
            console.error("[EmbeddingService] Invalid response structure from Python embedding service:", apiResponse.data);
            throw new Error("Invalid response format from Python embedding service.");
        }
        
        const { embeddings: apiEmbeddings, dimension: apiDimension, model_used: modelUsedByApi } = apiResponse.data;

        if (apiEmbeddings.length !== chunks.length) {
            console.error(`[EmbeddingService] Mismatch in returned embeddings count. Expected ${chunks.length}, got ${apiEmbeddings.length}. Model used by API: ${modelUsedByApi}`);
            throw new Error('Embedding generation returned mismatched number of embeddings.');
        }

        if (modelUsedByApi !== (selectedModel.id_or_path || selectedModel.name || selectedModel.id.toString())) {
             console.warn(`[EmbeddingService] Model mismatch: Node expected '${selectedModel.name || selectedModel.id}', Python API used '${modelUsedByApi}'.`);
        }
        
        if (apiDimension !== expectedDimension) {
            console.warn(`[EmbeddingService] Dimension mismatch for model ${modelUsedByApi}: Node expected ${expectedDimension}, Python API returned ${apiDimension}. Using API dimension.`);
        }
        
        return { embeddings: apiEmbeddings, dimension: apiDimension };

    } catch (error) {
        console.error(`[EmbeddingService] Error calling Python embedding service for model ${selectedModel.name || selectedModel.id}:`, error.response ? error.response.data : error.message);
        throw new Error(`Failed to generate embeddings via Python service: ${error.message}`);
    }
    
    // Old code block for embeddingWorkerService, now fully replaced
    // try {
    //     // const embeddings = await embeddingWorkerService.generateEmbeddings(chunks); // OLD CODE
    //     // Replace above with:
    //     // const pythonServiceBaseUrl = getSystemSetting('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');
    //     // const embedApiUrl = `${pythonServiceBaseUrl}/vector/embed_texts`; // Assuming this endpoint will exist
    //     // const response = await axios.post(embedApiUrl, { texts: chunks, model_id: selectedModel.id_or_path || selectedModel.id });
    //     // const embeddings = response.data.embeddings;

    //     if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
    //         console.error(`[EmbeddingService] Invalid response from embedding service for model ${selectedModel.id}. Expected ${chunks.length} embeddings, got:`, embeddings);
    //         throw new Error('Embedding generation failed or returned unexpected format.');
    //     }

    //     // Verify embedding dimension matches expected
    //     const actualDimension = embeddings[0]?.length || 0;
    //     if (actualDimension > 0 && actualDimension !== dimension) {
    //          console.warn(`[EmbeddingService] Warning: Returned embedding dimension (${actualDimension}) does not match expected dimension (${dimension}) for model ${selectedModel.id}. Using actual dimension.`);
    //          return { embeddings: embeddings, dimension: actualDimension };
    //     }
    //     return { embeddings: embeddings, dimension }; 

    // } catch (error) {
    //     console.error(`[EmbeddingService] Error generating embeddings with model ${selectedModel.id}:`, error);
    //     // if (error.message.includes('Embedding worker not ready')) { // OLD CODE
    //     //      const workerStatus = embeddingWorkerService.getStatus(); // OLD CODE
    //     //      throw new Error(`Embedding worker not ready. Status: ${workerStatus.status}. Last Error: ${workerStatus.lastError || 'None'}`); // OLD CODE
    //     // }
    //     throw error; 
    // }
}

module.exports = {
    generateEmbeddings,
    selectEmbeddingModel 
};
