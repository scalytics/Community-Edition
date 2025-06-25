/**
 * Hugging Face model downloader implementation (vLLM/Torch focused)
 * Handles downloading models from Hugging Face by spawning a Python script.
 */
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const eventBus = require('../../utils/eventBus');
const db = require('../../models/db');
const Model = require('../../models/Model');
const { getStorageInfo } = require('../maintenanceService/modelDirectoryService');
const { getModelInfo } = require('./modelInfo');

// Import local download manager to track downloads
const { activeDownloads, activeModelDownloads } = require('./downloadManager');

// Helper function to determine prompt format type based on name/ID
function determinePromptFormatType(modelId, modelName) {
  const name = modelName?.toLowerCase() || '';
  const id = modelId?.toLowerCase() || '';
  let formatType = 'default';
  if (name.includes('mistral') || id.includes('mistral') || name.includes('mixtral') || id.includes('mixtral')) formatType = 'mistral';
  else if (name.includes('llama') || id.includes('llama') || name.includes('vicuna') || id.includes('vicuna')) formatType = 'llama';
  else if (name.includes('deepseek') || id.includes('deepseek')) formatType = 'deepseek';
  else if (name.includes('phi') || id.includes('phi')) formatType = 'phi';
  else if (name.includes('gemma') || id.includes('gemma')) formatType = 'gemma';
  return formatType;
}

/**
 * Check if a command exists
 * @param {string} command - Command to check
 * @returns {Promise<boolean>} - True if command exists
 */
async function checkCommandExists(command) {
  try {
    if (process.platform === 'win32') { await execPromise(`where ${command}`); }
    else { await execPromise(`which ${command}`); }
    return true;
  } catch (error) { return false; }
}

/**
 * Download a model from Hugging Face Hub
 * @param {string} modelId - Hugging Face model ID (passed to the function)
 * @param {Object} config - Model configuration
 * @returns {Promise<Object>} - Download information
 */
async function downloadModel(modelId, config = {}) {
  const downloadId = config.downloadId || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  try {
    if (activeModelDownloads.has(modelId)) {
      let existingDownloadId = null;
      for (const [currentDownloadId, info] of activeDownloads.entries()) { if (info.modelId === modelId && info.status === 'downloading') { existingDownloadId = currentDownloadId; break; } }
      if (existingDownloadId) return { downloadId: existingDownloadId, modelId, status: 'already_in_progress', message: 'Download already in progress for this model' };
    }
    activeModelDownloads.add(modelId);

    const modelsDir = process.env.MODELS_PATH || path.join(process.cwd(), 'models');
    try { await fsPromises.access(modelsDir); } catch (err) { await fsPromises.mkdir(modelsDir, { recursive: true }); }
    const modelName = config.name || modelId.split('/').pop();
    const modelDir = path.join(modelsDir, modelName);
    try { await fsPromises.access(modelDir); } catch (err) { await fsPromises.mkdir(modelDir, { recursive: true }); }

    // Set initial download info
    activeDownloads.set(downloadId, { modelId, huggingfaceRepo: modelId, tokenizerRepoId: null, modelDir, progress: 0, status: 'downloading', config, message: `Preparing to download model ${modelName}` });

    // Check for sufficient disk space before starting download
    const modelInfo = await getModelInfo(modelId, config.hfToken);
    if (!modelInfo || !modelInfo.siblings) {
      throw new Error('Could not retrieve model information from Hugging Face Hub.');
    }

    const modelSize = modelInfo.siblings.reduce((acc, file) => acc + (file.size || 0), 0);
    const storageInfo = await getStorageInfo();
    const availableSpace = storageInfo.diskInfo.free;

    // Add a 10% buffer to the model size
    const requiredSpace = modelSize * 1.1;

    if (availableSpace < requiredSpace) {
      throw new Error(`Insufficient disk space. Required: ~${(requiredSpace / 1e9).toFixed(2)} GB, Available: ${(availableSpace / 1e9).toFixed(2)} GB`);
    }

    // --- Torch Model Download Path (using Python script) ---
    const scriptsDir = path.join(process.cwd(), 'scripts');
    const downloadScriptPath = path.join(scriptsDir, 'download_hf_model.py');
    if (!fs.existsSync(downloadScriptPath)) throw new Error(`Download script not found at: ${downloadScriptPath}`);
    try { await execPromise(`chmod +x "${downloadScriptPath}"`); } catch (chmodError) { console.warn(`Warning: Could not make script executable: ${chmodError.message}`); }
    
    const pythonWrapperScript = path.join(scriptsDir, 'python-wrapper.sh');
    let commandToRun = downloadScriptPath;
    const useAuth = !!config.hfToken;
    const commandArgs = [
        '--model_id', modelId,
        '--output_dir', modelDir,
    ];

    if (config.hfToken) {
        commandArgs.push('--token', config.hfToken);
    }
    if (config.is_embedding_model) {
        commandArgs.push('--is_embedding_model');
    }

    if (fs.existsSync(pythonWrapperScript)) {
        commandToRun = pythonWrapperScript; 
        commandArgs.unshift(downloadScriptPath); 
    } else { 
        console.warn(`Python wrapper script not found at ${pythonWrapperScript}. Attempting direct execution.`); 
        if (await checkCommandExists('python3')) { 
            commandToRun = 'python3'; 
            commandArgs.unshift(downloadScriptPath); 
        } else if (await checkCommandExists('python')) { 
            commandToRun = 'python'; 
            commandArgs.unshift(downloadScriptPath); 
        } else {
            throw new Error('Python execution environment not found.'); 
        }
    }

    let downloadProcess;
    try {
        commandArgs.push('--download_id', downloadId);
        downloadProcess = spawn(commandToRun, commandArgs);
    } catch (spawnError) {
        console.error(`Failed to spawn download process: ${spawnError.message}`);
        throw spawnError;
    }

    const stdoutHandler = (data) => {
      const dataStr = data.toString();
      console.log(`[Python stdout]: ${dataStr}`);
      const lines = dataStr.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.type === 'progress' && message.downloadId === downloadId) {
            const currentInfo = activeDownloads.get(downloadId) || {};
            activeDownloads.set(downloadId, { ...currentInfo, progress: message.progress, message: message.message, status: 'downloading' });
            eventBus.publish('download:progress', downloadId, { progress: message.progress, message: message.message, status: 'downloading' });
          } else if (message.success === false) {
            if (message.error === 'gated_repo') {
              const errorMessage = `Access to model ${message.model_id} is restricted. Please accept the license on the Hugging Face website.`;
              const currentInfo = activeDownloads.get(downloadId) || {};
              activeDownloads.set(downloadId, { ...currentInfo, status: 'failed', error: errorMessage, modelId: message.model_id, requiresLicense: true });
              eventBus.publish('download:error', downloadId, { error: 'gated_repo', modelId: message.model_id });
            } else {
              console.error(`[Python Script Error] ${JSON.stringify(message)}`); 
              const currentInfo = activeDownloads.get(downloadId) || {}; 
              activeDownloads.set(downloadId, { ...currentInfo, status: 'failed', error: message.error || 'Python script reported failure.' }); 
              eventBus.publish('download:error', downloadId, { error: message.error || 'Python script reported failure.' });
            }
          }
        } catch (e) {
          console.log(`[Python stdout non-JSON]: ${line}`);
        }
      }
    };
    const stderrHandler = (data) => { 
      const dataStr = data.toString();
      console.error(`[Download stderr]: ${dataStr}`); 
    };

    activeDownloads.set(downloadId, { ...activeDownloads.get(downloadId), process: downloadProcess });
    let stdoutData = ''; 
    let stderrData = '';
    downloadProcess.stdout.on('data', (data) => { stdoutData += data.toString(); stdoutHandler(data); });
    downloadProcess.stderr.on('data', (data) => { stderrData += data.toString(); stderrHandler(data); });
    const modelUtils = require('../../utils/modelUtils');

    downloadProcess.on('close', async (code) => {
      const downloadInfo = activeDownloads.get(downloadId);
      
      if (code === 0) {
        try {
          const lines = stdoutData.trim().split('\n');
          // Find the last JSON line that contains a success property (final result)
          let resultPayload = null;
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.hasOwnProperty('success')) {
                  resultPayload = parsed;
                  break;
                }
              } catch (e) {
                // Not valid JSON, continue
                continue;
              }
            }
          }
          
          if (!resultPayload) {
            throw new Error('Could not find valid JSON result with success property from Python script.');
          }
          
          if (resultPayload.success !== true) {
            throw new Error(resultPayload.error || 'Python script reported failure in result payload.');
          }

          activeDownloads.set(downloadId, { ...downloadInfo, status: 'processing', message: 'Registering model in database' });
          eventBus.publish('download:progress', downloadId, { status: 'processing', message: 'Registering model in database', progress: 95 });

          const modelPathForDb = modelDir;
          const targetModelName = config.name || modelName;
          const existingModel = await db.db.getAsync('SELECT id, config FROM models WHERE name = ?', [targetModelName]);
          
          const modelConfigFromScript = resultPayload.full_config_on_disk || {};
          const embeddingDimension = resultPayload.embedding_dimension || modelConfigFromScript.hidden_size || null;
          const isEmbeddingModel = resultPayload.is_embedding_model || false;

          // Use context window from script (which tries multiple config fields) or fallback chain
          const contextWindow = resultPayload.context_window || 
                               config.context_window || 
                               modelConfigFromScript.max_position_embeddings || 
                               4096;
          
          // Use quantization method from script detection or config override
          const quantizationMethod = resultPayload.quantization_method || 
                                   config.quantization_method || 
                                   'fp16';

          if (existingModel) {
            console.warn(`[DB Registration] Model with name "${targetModelName}" already exists (ID: ${existingModel.id}). Updating path and config.`);
            let existingConfig = {};
            try {
                if (typeof existingModel.config === 'string') existingConfig = JSON.parse(existingModel.config);
            } catch(e) { console.error("Could not parse existing model config, will overwrite."); }

            await Model.update(existingModel.id, {
              model_path: modelPathForDb,
              model_format: 'torch',
              embedding_dimension: embeddingDimension,
              context_window: contextWindow,
              config: JSON.stringify({
                ...existingConfig,
                quantization_method: quantizationMethod,
                tensor_parallel_size: config.tensor_parallel_size,
                full_config_on_disk: modelConfigFromScript
              })
            });
            
            activeDownloads.set(downloadId, { ...downloadInfo, status: 'completed', progress: 100, modelDbId: existingModel.id, modelType: 'torch', message: `Model "${targetModelName}" updated and installed.` });
            eventBus.publish('download:complete', downloadId, { status: 'completed', message: `Model "${targetModelName}" updated and installed.`, modelId: modelId, modelDbId: existingModel.id, modelType: 'torch', progress: 100, outputPath: modelPathForDb });
          } else {
            const promptFormatType = determinePromptFormatType(modelId, targetModelName);
            const insertValues = [
              targetModelName,
              config.description || `Hugging Face model: ${modelId}`,
              modelDir,
              contextWindow,
              0, // is_active
              modelId,
              0, // size_bytes
              promptFormatType,
              isEmbeddingModel ? 1 : 0,
              embeddingDimension,
              JSON.stringify({
                quantization_method: quantizationMethod,
                tensor_parallel_size: config.tensor_parallel_size,
                full_config_on_disk: modelConfigFromScript
              }),
              'torch'
            ];
            const result = await db.db.runAsync(`INSERT INTO models (name, description, model_path, context_window, is_active, huggingface_repo, size_bytes, prompt_format_type, is_embedding_model, embedding_dimension, config, model_format) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertValues);
            activeDownloads.set(downloadId, { ...downloadInfo, status: 'completed', progress: 100, modelDbId: result.lastID, modelType: 'torch', message: 'Model downloaded and registered' });
            eventBus.publish('download:complete', downloadId, { status: 'completed', message: 'Model downloaded and registered', modelId: modelId, modelDbId: result.lastID, modelType: 'torch', progress: 100, outputPath: modelDir });
          }
        } catch (err) {
          console.error('Error processing download result:', err);
          activeDownloads.set(downloadId, { ...downloadInfo, status: 'failed', error: `Failed to process download result: ${err.message}` });
          eventBus.publish('download:error', downloadId, { error: `Failed to process download result: ${err.message}` });
        }
      } else {
        // Look for JSON messages in all lines, not just the last one
        const lines = stdoutData.trim().split('\n');
        let foundGatedError = false;
        
        for (const line of lines) {
          if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
            try {
              const resultPayload = JSON.parse(line.trim());
              
              if (resultPayload.success === false && resultPayload.error === 'gated_repo') {
                const errorMessage = `Access to model ${resultPayload.model_id} is restricted. Please accept the license agreement on the Hugging Face website.`;
                activeDownloads.set(downloadId, { ...downloadInfo, status: 'failed', error: errorMessage, modelId: resultPayload.model_id, requiresLicense: true });
                eventBus.publish('download:error', downloadId, { error: 'gated_repo', modelId: resultPayload.model_id });
                foundGatedError = true;
                break;
              }
            } catch (e) {
              // Line is not valid JSON, continue to next line
              continue;
            }
          }
        }
        
        if (!foundGatedError) {
          console.error(`Download failed with code ${code}: ${stderrData}`);
          activeDownloads.set(downloadId, { ...downloadInfo, status: 'failed', error: stderrData || `Process exited with code ${code}` });
          eventBus.publish('download:error', downloadId, { error: stderrData || `Process exited with code ${code}` });
        }
      }
      
      activeModelDownloads.delete(modelId);
      const updatedInfo = activeDownloads.get(downloadId);
      activeDownloads.set(downloadId, { ...updatedInfo, process: null });
      setTimeout(() => { activeDownloads.delete(downloadId); }, 3600000); // Cleanup after 1 hour
    });

    return { downloadId, modelId, status: 'started' };

  } catch (error) {
    console.error('Error downloading Hugging Face model:', error);
    const currentInfo = activeDownloads.get(downloadId);
    if (currentInfo && currentInfo.status !== 'failed') {
        activeDownloads.set(downloadId, { ...currentInfo, status: 'failed', error: error.message || 'Download initiation failed' });
        eventBus.publish('download:error', downloadId, { error: error.message || 'Download initiation failed' });
    }
    activeModelDownloads.delete(modelId);
    throw error;
  }
}

module.exports = { downloadModel };
