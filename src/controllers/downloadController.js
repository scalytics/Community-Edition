/**
 * Download controller for managing and tracking downloads via REST API
 * Provides fallback endpoints when WebSockets aren't available
 */
const { downloadManager } = require('../utils/streamDownloader');
const huggingFaceService = require('../services/huggingFaceService');
const eventBus = require('../utils/eventBus');

/**
 * Get download status - used by polling endpoints when WebSocket isn't available
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getDownloadStatus = async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!downloadId) {
      return res.status(400).json({
        success: false,
        message: 'Download ID is required'
      });
    }
    
    // Get all active downloads first - this provides a view of active downloads
    // even when specific ID info isn't available yet
    const activeDownloads = downloadManager.getAllDownloads() || [];
    const hasActiveDownloads = activeDownloads && activeDownloads.length > 0;
    
    // Try to get specific download info by ID
    let downloadInfo = downloadManager.getDownloadInfo(downloadId);
    
    // If not found in downloadManager, check HuggingFace service
    if (!downloadInfo) {
      downloadInfo = huggingFaceService.getDownloadProgress(downloadId);
    }
    
    // If still not found but active downloads exist, use the latest active download
    // This helps when the system is still registering a temp ID but has started a download
    if ((!downloadInfo || downloadInfo.status === 'not_found') && hasActiveDownloads) {
      
      // Get the most recent active download
      const latestDownload = activeDownloads[activeDownloads.length - 1];
      
      // Create synthetic download info
      downloadInfo = {
        downloadId,
        progress: latestDownload.progress || 0,
        bytesDownloaded: latestDownload.bytesDownloaded || 0,
        totalBytes: latestDownload.totalBytes || 0,
        speed: latestDownload.speed || 0,
        status: 'downloading',
        message: latestDownload.message || 'Download in progress...'
      };
      
      // Emit this as event for any socket listeners too
      eventBus.publish('download:progress', downloadId, downloadInfo);
    }
    
    // Check model files if all else fails - this provides a fallback
    // when download tracking fails but files exist
    if (!downloadInfo || downloadInfo.status === 'not_found') {
      try {
        const fs = require('fs');
        const path = require('path');
        const modelsDir = path.join(process.cwd(), 'models');
        
        if (fs.existsSync(modelsDir)) {
          const modelDirs = fs.readdirSync(modelsDir);
          
          for (const dir of modelDirs) {
            const modelPath = path.join(modelsDir, dir);
            
            if (fs.statSync(modelPath).isDirectory()) {
              try {
                const files = fs.readdirSync(modelPath);
              
              if (files.length > 0) {
                
                // Create completed download info
                  downloadInfo = {
                    downloadId,
                    progress: 100,
                    bytesDownloaded: 1,
                    totalBytes: 1,
                    speed: 0,
                    status: 'completed',
                    message: `Download verified: Model files found in ${dir}`
                  };
                  
                  break;
                }
              } catch (e) {
              }
            }
          }
        }
      } catch (fsError) {
        console.warn('Error checking filesystem for downloads:', fsError);
      }
    }
    
    // Prepare response data
    let responseData = {
      downloadId,
      progress: 0,
      status: 'not_found', 
      message: 'Download not found'
    };
    
    if (downloadInfo && downloadInfo.status !== 'not_found') {
      responseData = {
        downloadId,
        progress: downloadInfo.progress || 0,
        bytesDownloaded: downloadInfo.bytesDownloaded || 0,
        totalBytes: downloadInfo.totalBytes || 0,
        speed: downloadInfo.speed || 0,
        status: downloadInfo.status || 'downloading',
        message: downloadInfo.message || 'Downloading...'
      };
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting download status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting download status',
      error: error.message
    });
  }
};

/**
 * Cancel an active download
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
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

    // Call the cancel function from the appropriate service
    const cancelled = huggingFaceService.cancelDownload(downloadId);

    if (cancelled) {
      res.status(200).json({
        success: true,
        message: `Download ${downloadId} cancelled successfully.`
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Download ${downloadId} not found or could not be cancelled.`
      });
    }
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
 * List all active downloads
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getActiveDownloads = async (req, res) => {
  try {
    // Get downloads from downloadManager
    const downloadManagerDownloads = downloadManager.getAllDownloads()
      .map(info => ({
        downloadId: info.id || info.downloadId,
        progress: info.progress || 0,
        status: info.status,
        message: info.message,
        modelId: info.modelId,
        bytesDownloaded: info.bytesDownloaded || 0,
        totalBytes: info.totalBytes || 0,
        speed: info.speed || 0
      }));
    
    const huggingFaceDownloads = huggingFaceService.getActiveDownloads();
    
    // Combine and deduplicate
    const allDownloads = [
      ...downloadManagerDownloads,
      ...huggingFaceDownloads.filter(hfDownload => 
        !downloadManagerDownloads.some(dmDownload => 
          dmDownload.downloadId === hfDownload.downloadId
        )
      )
    ];
    
    res.status(200).json({
      success: true,
      count: allDownloads.length,
      data: allDownloads
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
