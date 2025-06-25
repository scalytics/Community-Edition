/**
 * Hugging Face Service
 * Provides functionality for interacting with Hugging Face model hub
 */
const modelSearch = require('./modelSearch');
const downloadManager = require('./downloadManager');
const modelDownloader = require('./modelDownloader');
const modelInfo = require('./modelInfo'); // Import the new module

/**
 * Service for interacting with Hugging Face Hub
 */
const huggingFaceService = {
  searchModels: modelSearch.searchModels,
  downloadModel: modelDownloader.downloadModel,
  getDownloadProgress: downloadManager.getDownloadProgress,
  cancelDownload: downloadManager.cancelDownload,
  getActiveDownloads: downloadManager.getActiveDownloads,
  getModelInfo: modelInfo.getModelInfo, 

  // Track model IDs that are currently being downloaded (exposed for compatibility)
  _activeModelDownloads: downloadManager.activeModelDownloads
};

module.exports = huggingFaceService;
