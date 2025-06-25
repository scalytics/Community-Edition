/**
 * Hugging Face download manager
 * Tracks and manages model downloads 
 */
const fs = require('fs');
const { downloadManager } = require('../../utils/streamDownloader');
const eventBus = require('../../utils/eventBus');

// Track active downloads with a Map (for backward compatibility)
const activeDownloads = new Map();
const activeModelDownloads = new Set();

// Synchronize downloadManager events with our activeDownloads Map
downloadManager.on('start', (downloadId, downloadInfo) => {
  activeDownloads.set(downloadId, {
    ...downloadInfo,
    status: 'downloading',
    progress: 0,
    message: downloadInfo.message || 'Starting download...'
  });
});

downloadManager.on('progress', (downloadId, progressInfo) => {
  const currentInfo = activeDownloads.get(downloadId) || {};
  activeDownloads.set(downloadId, {
    ...currentInfo,
    ...progressInfo,
    status: 'downloading',
    message: progressInfo.message || 'Downloading...'
  });
});

downloadManager.on('complete', (downloadId, completionInfo) => {
  const currentInfo = activeDownloads.get(downloadId) || {};
  activeDownloads.set(downloadId, {
    ...currentInfo,
    ...completionInfo,
    status: 'completed',
    progress: 100,
    message: completionInfo.message || 'Download completed'
  });
});

downloadManager.on('error', (downloadId, errorInfo) => {
  const currentInfo = activeDownloads.get(downloadId) || {};
  activeDownloads.set(downloadId, {
    ...currentInfo,
    ...errorInfo,
    status: 'failed',
    message: errorInfo.error || 'Download failed'
  });
});

/**
 * Get download progress
 * @param {string} downloadId - Download ID
 * @returns {Object} - Download progress information
 */
function getDownloadProgress(downloadId) {
  const streamingDownload = downloadManager.getDownloadInfo(downloadId);
  
  if (streamingDownload) {
    return streamingDownload;
  }
  
  // Fall back to the old activeDownloads map
  const downloadInfo = activeDownloads.get(downloadId);
  
  if (!downloadInfo) {
    return {
      status: 'not_found',
      message: 'Download not found'
    };
  }
  
  const { process, ...info } = downloadInfo;
  return info;
}

/**
 * Cancel a download and clean up files
 * @param {string} downloadId - Download ID
 * @returns {boolean} - True if cancelled successfully
 */
function cancelDownload(downloadId) {
  if (downloadManager.cancelDownload(downloadId)) {
    return true;
  }
  
  // Fall back to old cancelDownload logic
  const downloadInfo = activeDownloads.get(downloadId);
  
  if (!downloadInfo) {
    return false;
  }
  
  try {
    if (downloadInfo.process) {
      downloadInfo.process.kill();
    }
    
    // Try to remove the model directory
    const modelDir = downloadInfo.modelDir;
    if (modelDir && fs.existsSync(modelDir)) {
      // Use recursive rmdir (fsPromises doesn't have a synchronous version)
      try {
        fs.rmSync(modelDir, { recursive: true, force: true });
      } catch (rmError) {
        console.error(`Failed to remove directory: ${rmError.message}`);
      }
    }
    
    // Update download status
    activeDownloads.set(downloadId, {
      ...downloadInfo,
      status: 'cancelled',
      message: 'Download cancelled and files cleaned up',
      process: null
    });
    
    eventBus.publish('download:cancel', downloadId, {
      message: 'Download cancelled by user'
    });
    
    return true;
  } catch (error) {
    console.error('Error cancelling download:', error);
    return false;
  }
}

/**
 * Get all active downloads
 * @returns {Array} - Array of download information objects
 */
function getActiveDownloads() {
  const downloads = [];
  
  // Include downloads from our stream downloader
  const streamDownloads = downloadManager.getAllDownloads().map(info => {
    return {
      downloadId: info.id || info.downloadId,
      modelId: info.modelId,
      progress: info.progress || 0,
      status: info.status || 'downloading',
      message: info.message || 'Downloading...',
      bytesDownloaded: info.bytesDownloaded || 0,
      totalBytes: info.totalBytes || 0,
      speed: info.speed || 0
    };
  });
  
  downloads.push(...streamDownloads);
  
  // Also include downloads from the legacy tracking system
  for (const [id, info] of activeDownloads.entries()) {
    if (streamDownloads.some(d => d.downloadId === id)) {
      continue;
    }
    
    if (info.status === 'downloading' || info.status === 'processing') {
      const { process, ...downloadInfo } = info;
      downloads.push({
        downloadId: id,
        ...downloadInfo
      });
    }
  }
  
  return downloads;
}

module.exports = {
  getDownloadProgress,
  cancelDownload,
  getActiveDownloads,
  activeDownloads,
  activeModelDownloads
};
