const path = require('path');
const fs = require('fs').promises;
const { db } = require('../../models/db');
const Model = require('../../models/Model');
const glob = require('glob').glob;  // For file discovery
const { MODELS_DIR } = require('../../utils/modelFileUtils');

/**
 * Discover models for a provider
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.discoverProviderModels = async (req, res) => {
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: 'Provider ID is required'
      });
    }

    // Handle local model discovery
    if (providerId === 'local') {
      const { basePath, recursive = true } = req.body;
      
      if (!basePath) {
        return res.status(400).json({
          success: false,
          message: 'Base path is required for local model discovery'
        });
      }

      // Check if the path exists
      try {
        await fs.access(basePath);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Base path does not exist or is not accessible',
          error: err.message
        });
      }

      // Search for model files
      const modelExtensions = ['.bin', '.safetensors', '.pt', '.pth', '.ckpt'];
      const modelFiles = [];

      // Use glob for more efficient recursive search
      const pattern = recursive 
        ? path.join(basePath, '**', `*{${modelExtensions.join(',')}}`) 
        : path.join(basePath, `*{${modelExtensions.join(',')}}`);
      
      try {
        const files = await glob(pattern, { nodir: true, dot: false });
        
        for (const file of files) {
          const stat = await fs.stat(file);
          if (stat.isFile() && stat.size > 1024 * 1024) { // Larger than 1MB
            modelFiles.push({
              path: file,
              size: stat.size,
              extension: path.extname(file).toLowerCase(),
              name: path.basename(file)
            });
          }
        }

        // Register found models if they don't exist
        let newModelsCount = 0;
        let existingModelsCount = 0;

        for (const file of modelFiles) {
          // Check if model already exists with this path
          const existingModel = await db.getAsync(
            'SELECT id FROM models WHERE model_path = ?',
            [file.path]
          );

          if (!existingModel) {
            // Determine model type based on extension
            let modelType = 'unknown';
            if (['.pt', '.pth', '.safetensors'].includes(file.extension)) {
              modelType = 'pytorch';
            } else if (file.extension === '.bin') {
              modelType = 'binary';
            }

            // Generate a reasonable name from filename
            let modelName = path.basename(file.path, file.extension)
              .replace(/[-_]/g, ' ')
              .replace(/q[0-9]+_/i, '')  // Remove quantization prefixes
              .replace(/\b\w/g, c => c.toUpperCase());  // Capitalize words

            // Check if a model with this name already exists
            let nameCounter = 1;
            let uniqueName = modelName;
            while (await Model.findByName(uniqueName)) {
              uniqueName = `${modelName} (${nameCounter})`;
              nameCounter++;
            }

            // Create model entry
            await Model.create({
              name: uniqueName,
              description: `Discovered ${modelType.toUpperCase()} model`,
              model_path: file.path,
              context_window: 4096,  // Default
              model_type: modelType,
              is_active: 0,  // Inactive by default when discovered
            });

            newModelsCount++;
          } else {
            existingModelsCount++;
          }
        }

        return res.status(200).json({
          success: true,
          message: `Discovered ${newModelsCount} new model(s), ${existingModelsCount} already registered`,
          data: {
            newModels: newModelsCount,
            existingModels: existingModelsCount,
            totalFound: modelFiles.length
          }
        });
      } catch (globError) {
        console.error('Error searching for model files:', globError);
        return res.status(500).json({
          success: false,
          message: 'Error searching for model files',
          error: globError.message
        });
      }
    } else {
      // For Hugging Face provider, use the existing huggingFaceService
      if (providerId === 'huggingface') {
        // Get model details from request if provided
        const modelDetails = req.body.modelDetails || {};
        
        try {
          // Import huggingFaceService
          const huggingFaceService = require('../../services/huggingFaceService');
          
          // Start the model download
          const result = await huggingFaceService.downloadModel(
            modelDetails.modelId || 'microsoft/phi-2', 
            {
              name: modelDetails.name,
              description: modelDetails.description,
              context_window: modelDetails.context_window || 4096,
              file: modelDetails.file, // Optional specific file to download
              quantization: modelDetails.quantization, // Optional quantization preference
              is_active: true
            }
          );
          
          return res.status(200).json({
            success: true,
            message: 'Model download started',
            data: result
          });
        } catch (hfError) {
          console.error('Hugging Face model download error:', hfError);
          return res.status(500).json({
            success: false,
            message: 'Error downloading Hugging Face model',
            error: hfError.message
          });
        }
      } else {
        // For other non-local providers, we would need to call provider-specific APIs
        return res.status(400).json({
          success: false,
          message: 'Only local and Hugging Face providers are currently supported'
        });
      }
    }
  } catch (error) {
    console.error('Model discovery error:', error);
    res.status(500).json({
      success: false,
      message: 'Error discovering models',
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error'
    });
  }
};
