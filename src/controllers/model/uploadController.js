const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { exec } = require('child_process'); // Keep for now, might be used elsewhere indirectly? Re-evaluate later.
const util = require('util');
const execPromise = util.promisify(exec); // Keep for now
const Model = require('../../models/Model');
const { MODELS_DIR } = require('../../utils/modelFileUtils');
const vllmService = require('../../services/vllmService');

/**
 * Upload and register a model file
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.uploadModel = async (req, res) => {
  try {
    // Ensure model directory exists
    await fs.mkdir(MODELS_DIR, { recursive: true });
    
    // Debug logging for the request
    console.log('Model upload request headers:', req.headers);
    
    // Check if file exists in request
    if (!req.files || !req.files.model) {
      return res.status(400).json({
        success: false,
        message: 'No model file provided'
      });
    }
    
    // Get the uploaded file
    const modelFile = req.files.model;
    
    // Debug logging for the file
    console.log('Uploaded model file:', {
      name: modelFile.name,
      size: modelFile.size,
      mimetype: modelFile.mimetype
    });
    
    // Extract metadata from request body
    const { name, description, context_window = 4096 } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Model name is required'
      });
    }
    
    // Check if a model with this name already exists
    const existingModel = await Model.findByName(name);
    if (existingModel) {
      return res.status(400).json({
        success: false,
        message: `A model with the name "${name}" already exists`
      });
    }
    
    // Validate file type based on extension
    const fileExtension = path.extname(modelFile.name).toLowerCase();
    const validExtensions = ['.bin', '.model', '.pt', '.pth', '.ckpt', '.safetensors'];
    
    if (!validExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Supported formats: ${validExtensions.join(', ')}`
      });
    }
    
    // Basic size validation (models shouldn't be too small)
    if (modelFile.size < 1024 * 1024) { // Less than 1MB
      return res.status(400).json({
        success: false,
        message: 'File is too small to be a valid model file'
      });
    }
    
    // Generate a unique filename for the model
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const modelFilename = `${uniqueId}${fileExtension}`;
    const modelPath = path.join(MODELS_DIR, modelFilename);
    
    // Move the uploaded file to the models directory
    await modelFile.mv(modelPath);
    
    // Run file format validation (optional, based on file type)
    let modelType = 'unknown';
    
    // Determine model type based on extension
    if (['.pt', '.pth', '.safetensors'].includes(fileExtension)) {
      modelType = 'pytorch';
    } else if (fileExtension === '.bin') {
      modelType = 'binary';
    }

    // Create initial DB entry (inactive)
    const initialModelData = {
      name,
      description: description || `Uploaded ${modelType.toUpperCase()} model`,
      model_path: modelPath,
      context_window: context_window, // Use provided or default
      model_type: modelType,
      is_active: 0, // Start as inactive
      parameters: null // Parameters might be determined later if needed
    };

    let modelId;
    try {
      modelId = await Model.create(initialModelData);
      console.log(`Created DB entry for model ${modelId}. Model is inactive by default.`);

      // With the vLLM architecture, validation happens upon activation.
      // We no longer start a temporary worker during upload.
      // The model is simply added to the database as inactive.

      const createdModel = await Model.findById(modelId);

      res.status(201).json({
        success: true,
        message: 'Model uploaded and registered successfully. It is currently inactive.',
        data: createdModel
      });

    } catch (dbError) {
      console.error(`DB error for model ${name}:`, dbError);

      // Clean up if DB creation failed
      try {
        console.log(`Attempting to delete model file ${modelPath} after DB error.`);
        await fs.unlink(modelPath);
      } catch (fileDeleteError) {
        console.error(`Failed to delete model file ${modelPath} during cleanup:`, fileDeleteError);
      }

      // Return error response
      res.status(500).json({
        success: false,
        message: `Database error while creating model entry: ${dbError.message}`
      });
    }
    
  } catch (error) {
    console.error('Model upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading model',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};
