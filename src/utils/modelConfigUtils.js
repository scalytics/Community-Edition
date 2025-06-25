const path = require('path');
const fsPromises = require('fs').promises;
const { formatFileSize } = require('./modelFileUtils'); // For modelInfo

// Define the directory where config files are stored
const CONFIG_DIR = path.resolve(__dirname, '../../models/config');

/**
 * Writes the model configuration data to a JSON file in the central config directory.
 *
 * @param {object} modelData - The complete model data object fetched from the database.
 *                             Should include fields like id, name, model_path, context_window,
 *                             gpu_layers, batch_size, cache_type, gpu_assignment, etc.
 * @throws {Error} If writing the config file fails.
 */
async function writeModelConfigJson(modelData) {
  if (!modelData || !modelData.model_path) {
    throw new Error('Invalid model data provided to writeModelConfigJson. Missing model_path.');
  }

  console.log(`[ConfigWriter] Writing config for model: ${modelData.name} (ID: ${modelData.id})`);

  // For vLLM, the model path is the directory itself. The config file should be named after the directory.
  const modelFilename = path.basename(modelData.model_path);
  const configFilename = `${modelFilename}.json`;
  const configFilePath = path.join(CONFIG_DIR, configFilename);

  // --- Construct JSON Payload ---
  // Start with existing data if available, or build from scratch
  let existingConfig = {};
  try {
    const content = await fsPromises.readFile(configFilePath, 'utf8');
    existingConfig = JSON.parse(content);
    console.log(`[ConfigWriter] Found existing config file at ${configFilePath}`);
  } catch (readError) {
    // File doesn't exist or is invalid, start fresh
    console.log(`[ConfigWriter] No existing config file found or error reading it at ${configFilePath}. Creating new config.`);
    existingConfig = {
      modelInfo: {}, // Initialize modelInfo if creating new
      _meta: {}      // Initialize _meta if creating new
    };
  }

  // Prepare the data to write, merging new/updated info with existing
  const configToWrite = {
    // Merge existing config first to preserve fields not directly managed here
    ...existingConfig,

    // Overwrite with fields from modelData (map DB names to JSON names)
    batchSize: modelData.batch_size !== undefined ? modelData.batch_size : (existingConfig.batchSize !== undefined ? existingConfig.batchSize : 8), // Default from original example
    contextSize: modelData.context_window !== undefined ? modelData.context_window : (existingConfig.contextSize !== undefined ? existingConfig.contextSize : 1024), // Default from original example
    gpuLayers: modelData.gpu_layers !== undefined ? modelData.gpu_layers : (existingConfig.gpuLayers !== undefined ? existingConfig.gpuLayers : "-1"), // Default from original example
    cacheType: modelData.cache_type !== undefined ? modelData.cache_type : (existingConfig.cacheType !== undefined ? existingConfig.cacheType : "f16"), // Default from original example
    tokensToGenerate: existingConfig.tokensToGenerate !== undefined ? existingConfig.tokensToGenerate : 64, // Preserve if exists, else default

    // --- Crucial: Add/Update gpuAssignment ---
    gpuAssignment: modelData.gpu_assignment !== undefined ? modelData.gpu_assignment : null,

    // Update modelInfo (only if creating new or if certain fields are missing/different)
    modelInfo: {
      ...existingConfig.modelInfo, // Preserve existing modelInfo fields
      fileName: modelFilename, // Always update filename based on resolution
      // Update size info only if not present or seems invalid
      fileSizeBytes: (existingConfig.modelInfo?.fileSizeBytes === undefined || existingConfig.modelInfo.fileSizeBytes <= 0) && modelData.file_size_bytes ? modelData.file_size_bytes : existingConfig.modelInfo?.fileSizeBytes,
      fileSizeGB: (existingConfig.modelInfo?.fileSizeGB === undefined || existingConfig.modelInfo.fileSizeGB <= 0) && modelData.file_size_bytes ? parseFloat((modelData.file_size_bytes / (1024 ** 3)).toFixed(9)) : existingConfig.modelInfo?.fileSizeGB,
      // Preserve other modelInfo fields like quantBits, sizeCategory, modelFamily if they exist
    },

    // Update status and performance if available in modelData (e.g., from optimization)
    status: modelData.status !== undefined ? modelData.status : existingConfig.status,
    performance: modelData.performance !== undefined ? modelData.performance : existingConfig.performance,

    // Update optimization date if available in modelData or set current time
    optimization_date: modelData.optimization_date instanceof Date ? modelData.optimization_date.toISOString() : (existingConfig.optimization_date || new Date().toISOString()),

    // Update _meta information
    _meta: {
      ...existingConfig._meta, // Preserve existing meta fields
      modelPath: modelData.model_path, // Always update the original path from DB
      timestamp: new Date().toISOString(), // Always update timestamp
      // hostname: existingConfig._meta?.hostname || require('os').hostname(), // Preserve or get current hostname
    }
  };

  // Clean up potentially undefined fields that might have come from modelData
  // (e.g., if batch_size was undefined in DB, don't write 'undefined' to JSON)
  // This is handled by the merging logic above using defaults/existing values.

  // --- Write File ---
  try {
    // Ensure the config directory exists
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });

    // +++ DIAGNOSTIC LOGGING START +++
    console.log(`[ConfigWriter WARN] Input model_path: ${modelData.model_path}`);
    console.log(`[ConfigWriter WARN] Resolved modelFilename: ${modelFilename}`);
    console.log(`[ConfigWriter WARN] Target configFilePath: ${configFilePath}`);
    console.log(`[ConfigWriter WARN] Payload gpuAssignment: ${configToWrite.gpuAssignment}`);
    // You can log the entire payload if needed, but be mindful of size/secrets
    // console.log(`[ConfigWriter WARN] Full Payload: ${JSON.stringify(configToWrite, null, 2)}`);
    // +++ DIAGNOSTIC LOGGING END +++

    // Write the file
    await fsPromises.writeFile(configFilePath, JSON.stringify(configToWrite, null, 2), 'utf8');
    console.log(`[ConfigWriter] Successfully wrote config file to ${configFilePath}`);
  } catch (writeError) {
    console.error(`[ConfigWriter] Error writing config file ${configFilePath}:`, writeError);
    throw new Error(`Failed to write model configuration: ${writeError.message}`);
  }
}

module.exports = {
  writeModelConfigJson,
  CONFIG_DIR
};
