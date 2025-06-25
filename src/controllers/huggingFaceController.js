const huggingFaceService = require('../services/huggingFaceService');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { encryptionHelpers } = require('../utils/encryptionUtils');
/**
 * Search for models on Hugging Face Hub
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.searchModels = async (req, res) => {
  try {
    const { family, sort, direction, limit } = req.query; 
    
    if (!family) {
      return res.status(400).json({
        success: false,
        message: 'Model family is required' 
      });
    }
    
    // Prepare options for the service layer
    const options = {
      sort: sort || 'downloads', 
      direction: direction === 'asc' || direction === 1 ? 1 : -1, 
      limit: parseInt(limit, 10) || 50 
    };

    let models = [];

    // Special handling for embedding models - fetch curated list
    if (family === 'embedding') {
        const curatedEmbeddingModels = [
            'sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
            'intfloat/multilingual-e5-small',
            'BAAI/bge-m3',
            'google-bert/bert-base-multilingual-cased', 
            'thenlper/gte-small'
        ];

        const modelInfoPromises = curatedEmbeddingModels.map(modelId =>
            huggingFaceService.getModelInfo(modelId).catch(err => {
                console.error(`[HF Controller] Failed to fetch info for curated model ${modelId}: ${err.message}`);
                return null;
            })
        );

        const results = await Promise.all(modelInfoPromises);
        models = results.filter(model => model !== null).map(model => ({
            ...model,
            pipeline_tag: 'feature-extraction'
        }));

        // Apply sorting to the curated list *after* fetching details
        if (options.sort === 'downloads' || options.sort === 'likes' || options.sort === 'lastModified') {
             models.sort((a, b) => {
                 let valA, valB;
                 if (options.sort === 'lastModified') {
                     valA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
                     valB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
                 } else {
                     valA = a[options.sort] || 0; 
                     valB = b[options.sort] || 0;
                 }
                 return options.direction === -1 ? valB - valA : valA - valB;
              });
         }

    } else {
        // Get user's HF token for authenticated requests
        const user = await db.db.getAsync('SELECT huggingface_token FROM users WHERE id = ?', [req.user.id]);
        let userToken = null;
        if (user && user.huggingface_token) {
          try {
            userToken = encryptionHelpers.decrypt(user.huggingface_token);
          } catch (err) {
            console.warn('Failed to decrypt user HF token:', err.message);
          }
        }
        
        const searchFilter = family; 
        const searchOptions = { ...options, userToken };
        models = await huggingFaceService.searchModels(searchFilter, searchOptions);
        
        // For non-embedding searches, enhance the first few results with detailed metadata
        if (models.length > 0 && family !== 'embedding') {
          const detailedModels = await Promise.all(
            models.slice(0, Math.min(10, models.length)).map(async (model) => {
              try {
                const detailedInfo = await huggingFaceService.getModelInfo(model.modelId, { userToken });
                return {
                  ...model,
                  license: detailedInfo.license !== 'Unknown' ? detailedInfo.license : model.license,
                  lastModified: detailedInfo.lastModified || model.lastModified,
                  description: detailedInfo.description || model.description
                };
              } catch (err) {
                console.warn(`Failed to get detailed info for ${model.modelId}:`, err.message);
                return model; // Return original if detailed fetch fails
              }
            })
          );
          
          // Replace the first models with detailed versions, keep the rest as-is
          models = [...detailedModels, ...models.slice(detailedModels.length)];
        }
    }

    res.status(200).json({
      success: true,
      count: models.length,
      data: models
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching models',
      error: error.message
    });
  }
};

/**
 * Login to Hugging Face Hub
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.loginToHuggingFace = async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  try {
    const encryptedToken = encryptionHelpers.encrypt(token);
    await db.db.runAsync('UPDATE users SET huggingface_token = ? WHERE id = ?', [encryptedToken, userId]);
    res.status(200).json({ success: true, message: 'Hugging Face token saved successfully.' });
  } catch (error) {
    console.error('Error saving Hugging Face token:', error);
    res.status(500).json({ success: false, message: 'Failed to save token.', error: error.message });
  }
};

/**
 * Get Hugging Face Hub Token Status
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getHuggingFaceTokenStatus = async (req, res) => {
  try {
    const user = await db.db.getAsync('SELECT huggingface_token FROM users WHERE id = ?', [req.user.id]);
    const hasToken = !!(user && user.huggingface_token);
    res.status(200).json({ success: true, hasToken });
  } catch (error) {
    console.error('Error checking Hugging Face token status:', error);
    res.status(500).json({ success: false, message: 'Failed to check token status.' });
  }
};

/**
 * Delete Hugging Face Hub Token
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.deleteHuggingFaceToken = async (req, res) => {
  try {
    await db.db.runAsync('UPDATE users SET huggingface_token = NULL WHERE id = ?', [req.user.id]);
    res.status(200).json({ success: true, message: 'Hugging Face token deleted successfully.' });
  } catch (error) {
    console.error('Error deleting Hugging Face token:', error);
    res.status(500).json({ success: false, message: 'Failed to delete token.' });
  }
};

/**
 * Download a model from Hugging Face Hub
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.downloadModel = async (req, res) => {
  try {
    const { modelId: modelIdFromParams } = req.params;
    const { modelId: modelIdFromBody, ...config } = req.body;
    const modelId = modelIdFromParams || modelIdFromBody;
    
    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }
    
    // Ensure we're using the same download ID across the entire process
    // This ensures frontend and backend track the same download
    if (!config.downloadId) {
      config.downloadId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    } else {
    }

    // --- Make download asynchronous ---
    const user = await db.db.getAsync('SELECT huggingface_token FROM users WHERE id = ?', [req.user.id]);
    let hfToken = process.env.HUGGINGFACE_API_KEY;
    if (user && user.huggingface_token) {
      hfToken = encryptionHelpers.decrypt(user.huggingface_token);
    }

    const downloadConfig = { ...config, hfToken };

    // Trigger the download but don't wait for it to finish setup.
    // The service should emit events ('download:start', 'download:progress', etc.)
    huggingFaceService.downloadModel(modelId, downloadConfig).catch(err => {
      // Optionally emit an error event via eventBus if needed
      const eventBus = require('../utils/eventBus'); 
      eventBus.publish('download:error', config.downloadId, {
        error: `Failed to initiate download: ${err.message}`
      });
    });

    // Immediately respond to the client indicating acceptance
    res.status(202).json({ 
      success: true,
      message: 'Model download request accepted and initiated.',
      data: {
        downloadId: config.downloadId, 
        modelId: modelId,
        status: 'initiated' 
      }
    });

  } catch (error) { 
    res.status(500).json({
      success: false,
      message: 'Error in download request processing',
      error: error.message
    });
  }
};

/**
 * Get download progress
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getDownloadProgress = async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!downloadId) {
      return res.status(400).json({
        success: false,
        message: 'Download ID is required'
      });
    }
    
    const progress = huggingFaceService.getDownloadProgress(downloadId);
    if (progress.status === 'not_found') {
      return res.status(404).json({
        success: false,
        message: 'Download not found or has been completed.'
      });
    }
    
    let statusDetails = {
      ...progress
    };
    
    if (progress.status === 'processing') {
      statusDetails.message = progress.message || 'Processing model files';
    } else if (progress.status === 'completed') {
      statusDetails.message = 'Model successfully installed';
      statusDetails.progress = 100;
    } else if (progress.status === 'failed') {
      statusDetails.message = progress.error || 'Download failed';
    } else if (progress.status === 'downloading' && !statusDetails.message) {
      if (progress.progress < 10) {
        statusDetails.message = 'Downloading model...';
      } else if (progress.progress < 30) {
        statusDetails.message = 'Downloading model files...';
      } else if (progress.progress < 60) {
        statusDetails.message = 'Downloading model weights...';
      } else if (progress.progress < 90) {
        statusDetails.message = 'Downloading model configuration...';
      } else {
        statusDetails.message = 'Finalizing download...';
      }
    }
    
    res.status(200).json({
      success: true,
      data: statusDetails
    });
  } catch (error) {
    console.error('Error getting download progress:', error); 
    res.status(500).json({
      success: false,
      message: 'Error getting download progress',
      error: error.message
    });
  }
};

/**
 * Cancel a download
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.cancelDownload = async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!downloadId) {
      return res.status(400).json({
        success: false,
        message: 'Download ID is required'
      });
    }
    
    const cancelled = huggingFaceService.cancelDownload(downloadId);
    
    if (!cancelled) {
      return res.status(404).json({
        success: false,
        message: 'Download not found or already completed'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Download cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling download:', error); 
    res.status(500).json({
      success: false,
      message: 'Error cancelling download',
      error: error.message
    });
  }
};

/**
 * Get all active downloads
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getActiveDownloads = async (req, res) => {
  try {
    const downloads = huggingFaceService.getActiveDownloads();
    
    res.status(200).json({
      success: true,
      count: downloads.length,
      data: downloads
    });
  } catch (error) {
   console.error('Error getting active downloads:', error); 
    res.status(500).json({
      success: false,
      message: 'Error getting active downloads',
      error: error.message
    });
  }
};

/**
 * List available files for a specific model
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.listModelFiles = async (req, res) => {
  try {
    const { modelId } = req.params;
    
    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }
    
    // API endpoint for HF files API
    const apiUrl = `https://huggingface.co/api/models/${modelId}/tree/main`;
    const headers = {};
    if (process.env.HUGGINGFACE_API_KEY) {
      headers.Authorization = `Bearer ${process.env.HUGGINGFACE_API_KEY}`;
    }
    
    const response = await axios.get(apiUrl, { headers });
    const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.onnx'];
    const modelFiles = response.data
      .filter(item => {
        if (item.type !== 'file') return false;
        const fileExt = path.extname(item.path).toLowerCase();
        return modelExtensions.includes(fileExt);
      })
      .map(item => ({
        name: path.basename(item.path),
        path: item.path,
        size: item.size,
        lastModified: item.lastCommit?.date
      }));
    
    res.status(200).json({
      success: true,
      count: modelFiles.length,
      files: modelFiles
    });
  } catch (error) {
   console.error('Error listing model files:', error); 
    let errorMessage = 'Error listing model files';
    let statusCode = 500;
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      errorMessage = `Server error: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`;
      statusCode = error.response.status === 404 ? 404 : 500;
    } else if (error.request) {
      errorMessage = 'No response from Hugging Face API';
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};
