/**
 * Stream Downloader
 * Provides utilities for streaming downloads with progress tracking
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const EventEmitter = require('events');
const { finished } = require('stream');
const { promisify } = require('util');
const finishedPromise = promisify(finished);
const eventBus = require('./eventBus');

/**
 * Download Manager class for tracking download progress
 * @extends EventEmitter
 */
class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.downloads = new Map();
    this.metadata = new Map();
  }

  /**
   * Register a new download
   * @param {string} id - Unique download ID
   * @param {Object} metadata - Additional download metadata
   * @returns {string} - The download ID
   */
  registerDownload(id, metadata = {}) {
    if (!this.downloads.has(id)) {
        this.downloads.set(id, {
          id,
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          speed: 0,
          status: 'registered',
          message: 'Download registered',
          startTime: Date.now()
        });
    } else {
        const existingInfo = this.downloads.get(id);
        this.downloads.set(id, { ...existingInfo, ...metadata });
    }

    this.metadata.set(id, metadata); 
    return id;
  }

  /**
   * Update download progress
   * @param {string} id - Download ID
   * @param {Object} progress - Progress information
   */
  updateProgress(id, progress) {
    if (!this.downloads.has(id)) {
      // Should ideally be registered first, but handle defensively
      this.registerDownload(id);
    }

    const currentInfo = this.downloads.get(id);
    // Ensure we don't overwrite crucial fields like selectedFile if they exist
    const updatedInfo = {
      ...currentInfo,
      ...progress, 
      lastUpdated: Date.now()
    };

    // Preserve specific fields if they exist in currentInfo but not in progress update
    if (currentInfo.selectedFile && !progress.selectedFile) {
        updatedInfo.selectedFile = currentInfo.selectedFile;
    }
    if (currentInfo.filesToDownload && !progress.filesToDownload) {
        updatedInfo.filesToDownload = currentInfo.filesToDownload;
    }
     if (currentInfo.totalFiles && !progress.totalFiles) {
        updatedInfo.totalFiles = currentInfo.totalFiles;
    }
    // Add other fields to preserve if necessary

    this.downloads.set(id, updatedInfo);
    this.emit('progress', id, updatedInfo); 

    // Also publish to global event bus for WebSocket bridge
    eventBus.publish('download:progress', id, updatedInfo);
   }

  /**
   * Mark a download as started
   * @param {string} id - Download ID
   * @param {Object} info - Download information
   */
  startDownload(id, info = {}) {
    if (!this.downloads.has(id)) {
      this.registerDownload(id);
    }

    const currentInfo = this.downloads.get(id);
    const metadata = this.metadata.get(id) || {};
    const updatedInfo = {
      ...currentInfo, 
      ...info, 
      status: 'downloading',
      message: info.message || `Downloading ${metadata.modelName || 'file'}...`,
      startTime: Date.now(),
      lastUpdated: Date.now()
    };

    this.downloads.set(id, updatedInfo);
    this.emit('start', id, updatedInfo);

    // Also publish to global event bus
    eventBus.publish('download:start', id, {
      ...updatedInfo, 
      modelName: metadata.modelName,
      outputPath: metadata.outputPath 
     });
   }

  /**
   * Mark a download as completed
   * @param {string} id - Download ID
   * @param {Object} info - Completion information
   */
  completeDownload(id, info = {}) {
    if (!this.downloads.has(id)) {
      console.warn(`[Stream Downloader] Cannot complete unknown download: ${id}`);
      return;
    }

    const currentInfo = this.downloads.get(id);
    const metadata = this.metadata.get(id) || {};
    const updatedInfo = {
      ...currentInfo,
      ...info, 
      progress: 100,
      status: 'completed',
      message: info.message || 'Download completed successfully',
      endTime: Date.now(),
      lastUpdated: Date.now(),
      outputPath: info.outputPath || metadata.outputPath || currentInfo.outputPath
    };

    this.downloads.set(id, updatedInfo);
    this.emit('complete', id, updatedInfo);

    // Also publish to global event bus
    eventBus.publish('download:complete', id, {
      ...updatedInfo, 
      outputPath: updatedInfo.outputPath
     });

     // Schedule cleanup after 1 hour
    setTimeout(() => {
      this.downloads.delete(id);
      this.metadata.delete(id);
    }, 3600000);
  }

  /**
   * Mark a download as failed
   * @param {string} id - Download ID
   * @param {Object} info - Error information
   */
  failDownload(id, info = {}) {
    if (!this.downloads.has(id)) {
      console.warn(`[Stream Downloader] Cannot fail unknown download: ${id}`);
      return;
    }

    const currentInfo = this.downloads.get(id);
    const updatedInfo = {
      ...currentInfo, 
      ...info, 
      status: 'failed',
      error: info.error || 'Download failed',
      endTime: Date.now(),
      lastUpdated: Date.now()
    };

    this.downloads.set(id, updatedInfo);
    this.emit('error', id, updatedInfo);

    // Also publish to global event bus
    eventBus.publish('download:error', id, {
      ...updatedInfo, 
      error: updatedInfo.error 
    });

    console.error(`[Stream Downloader] Failed download for ${id}: ${updatedInfo.error}`);

    // Schedule cleanup after 1 hour
    setTimeout(() => {
      this.downloads.delete(id);
      this.metadata.delete(id);
    }, 3600000);
  }

  /**
   * Cancel a download
   * @param {string} id - Download ID
   * @returns {boolean} - Success flag
   */
  cancelDownload(id) {
    if (!this.downloads.has(id)) {
      return false;
    }

    const download = this.downloads.get(id);

    // If download has an abort controller, abort it
    if (download.abortController) {
      download.abortController.abort();
    }

    // Update status
    const updatedInfo = {
      ...download,
      status: 'cancelled',
      message: 'Download cancelled by user',
      endTime: Date.now(),
      lastUpdated: Date.now()
    };

    this.downloads.set(id, updatedInfo);
    this.emit('cancel', id, updatedInfo);

    // Also publish to global event bus
    eventBus.publish('download:cancel', id, {
      message: 'Download cancelled by user'
    });

    // Schedule cleanup after 1 hour
    setTimeout(() => {
      this.downloads.delete(id);
      this.metadata.delete(id);
    }, 3600000);

    return true;
  }

  /**
   * Get information about a download
   * @param {string} id - Download ID
   * @returns {Object|null} - Download information or null if not found
   */
  getDownloadInfo(id) {
    if (!id || !this.downloads.has(id)) {
      return null;
    }
    return this.downloads.get(id);
  }

  /**
   * Get all active downloads
   * @returns {Array} - Array of download information objects
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }
}

// Create a singleton instance
const downloadManager = new DownloadManager();

/**
 * Download a file from Hugging Face, tracking progress
 * @param {string} repo - Hugging Face repository ID
 * @param {string} filePath - Path to the file within the repository
 * @param {string} outputDir - Output directory path
 * @param {string} downloadId - Unique download ID
 * @param {Object} options - Download options
 * @param {boolean} suppressEvents - If true, only update internal state, don't modify main download record or publish events
 * @returns {Promise<Object>} - Result object
 */
async function downloadHuggingFaceFile(repo, filePath, outputDir, downloadId, options = {}, suppressEvents = false) {
  if (!downloadId) {
    throw new Error('downloadHuggingFaceFile requires a valid downloadId');
  }
  const id = downloadId;

  const metadata = options.metadata || {};

  // Ensure the main download record exists, but don't overwrite if called for sub-downloads
  if (!suppressEvents && !downloadManager.downloads.has(id)) {
      downloadManager.registerDownload(id, {
          modelId: repo,
          modelName: metadata.modelName || repo.split('/').pop(),
          filePath, // Initial file path
          outputPath: outputDir,
          ...metadata
      });
  } else if (downloadManager.downloads.has(id)) {
      // If record exists, maybe update metadata if needed, but carefully
  } else if (suppressEvents) {
      console.warn(`[Stream Downloader Suppressed] Called for unknown download ID: ${id}. This might indicate an issue.`);
  }

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const fileName = path.basename(filePath);
    const outputPath = path.join(outputDir, fileName);
    const abortController = new AbortController();

    // Update main record ONLY if not suppressing events
    if (!suppressEvents) {
        downloadManager.updateProgress(id, {
            abortController,
            message: `Preparing to download ${fileName}...`,
            status: 'preparing'
        });
    }

    const apiUrl = `https://huggingface.co/${repo}/resolve/main/${filePath}`;
    const headers = {};
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    let fileTotalBytes = 0;
    try {
      const headResponse = await axios.head(apiUrl, { headers });
      fileTotalBytes = parseInt(headResponse.headers['content-length'], 10);

      // Update main record ONLY if not suppressing events
      if (!suppressEvents) {
          downloadManager.updateProgress(id, {
              totalBytes: fileTotalBytes, 
              message: `Starting download of ${fileName} (${formatBytes(fileTotalBytes)})...`
          });
          downloadManager.startDownload(id, { 
              totalBytes: fileTotalBytes,
              message: `[Stream Downloader] Downloading ${fileName} (${formatBytes(fileTotalBytes)})...`,
              outputPath 
          });
      }
    } catch (headError) {
      console.warn(`Could not determine file size for ${fileName}: ${headError.message}`);
      if (!suppressEvents) {
         downloadManager.startDownload(id, {
           totalBytes: 0,
           message: `[Stream Downloader] Downloading ${fileName} (size unknown)...`,
           outputPath
         });
      }
      // If it's a 404 for a suppressed (tokenizer) download, handle it gracefully
      if (suppressEvents && headError.response && headError.response.status === 404) {
          console.log(`[Stream Downloader Suppressed] File not found (404): ${fileName}. Skipping.`);
          return { success: true, downloadId: id, filePath: outputPath, message: `File not found, skipped: ${fileName}` }; 
      }
      if (!suppressEvents || (headError.response && headError.response.status !== 404)) {
          throw headError; 
      }
    }

    const startTime = Date.now();
    let lastUpdate = startTime;
    let lastBytes = 0;

    const response = await axios({
      method: 'GET',
      url: apiUrl,
      responseType: 'stream',
      headers,
      signal: abortController.signal,
      onDownloadProgress: (progressEvent) => {
        const bytesDownloaded = progressEvent.loaded;
        const totalBytes = progressEvent.total || fileTotalBytes || 0; 
        const progress = totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
        const now = Date.now();
        const timeDiff = (now - lastUpdate) / 1000;

        if (timeDiff >= 1 || progress === 100) { 
          const bytesDiff = bytesDownloaded - lastBytes;
          const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
          const message = `[Stream Downloader] Downloading ${fileName}: ${progress}% (${formatBytes(bytesDownloaded)}/${formatBytes(totalBytes)}) at ${formatBytes(speed)}/s`;

          // Update main record ONLY if not suppressing events
          if (!suppressEvents) {
              downloadManager.updateProgress(id, {
                  progress,
                  bytesDownloaded,
                  totalBytes, 
                  speed,
                  message
              });
          }
          // Update internal state for this specific file if needed
          // internalProgress = { progress, bytesDownloaded, totalBytes, speed };

          lastUpdate = now;
          lastBytes = bytesDownloaded;
        }
      }
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    await finishedPromise(writer);

    // Mark main download as complete ONLY if not suppressing events
    if (!suppressEvents) {
      downloadManager.completeDownload(id, {
        progress: 100,
        message: `[Stream Downloader] Successfully downloaded ${fileName}`,
        outputPath 
      });
    } else {
      console.log(`[Stream Downloader Suppressed] Completed download for ${id}: ${fileName}`);
    }

    return {
      success: true,
      downloadId: id,
      filePath: outputPath,
      message: `Successfully downloaded ${fileName}`
    };
  } catch (error) {
    // Handle errors
    if (error.code === 'ERR_ABORTED') {
      downloadManager.cancelDownload(id);
      return { success: false, downloadId: id, error: 'Download cancelled by user' };
    }

    console.error(`[Stream Downloader] Error downloading file ${filePath}:`, error.message);

    // Mark main download as failed ONLY if not suppressing events
    if (!suppressEvents) {
        downloadManager.failDownload(id, {
          error: `Failed to download ${filePath}: ${error.message || 'Unknown error'}`
        });
    } else {
        console.error(`[Stream Downloader Suppressed] Failed download for ${id} (${filePath}): ${error.message}`);
    }

    throw error;
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  downloadManager,
  downloadHuggingFaceFile,
  formatBytes
};
