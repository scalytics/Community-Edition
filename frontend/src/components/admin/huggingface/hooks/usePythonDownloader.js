import { useState, useEffect, useCallback } from 'react';
import apiService from '../../../../services/apiService';
import socketService from '../../../../services/socketService';
import { toast } from 'react-toastify';

const usePythonDownloader = (onComplete, onGated) => {
    const [downloads, setDownloads] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
      const activeDownloadListeners = new Map();

      const handleProgress = (data) => {
        const downloadId = data.downloadId;
        setDownloads(prev => ({
          ...prev,
          [downloadId]: { ...prev[downloadId], ...data }
        }));
      };

      const handleComplete = (data) => {
        const downloadId = data.downloadId;
        setDownloads(prev => ({
          ...prev,
          [downloadId]: { ...prev[downloadId], status: 'completed', progress: 100, ...data }
        }));
        toast.success(data.message || `Download ${downloadId} completed!`);
        if (onComplete) onComplete(data);
      };

      const handleError = (data) => {
        const downloadId = data.downloadId;
        if (data.error === 'gated_repo') {
          // Update download status but don't show error toast for gated repos
          setDownloads(prev => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], status: 'gated', error: 'License acceptance required', progress: 0 }
          }));
          if (onGated) {
            onGated(data);
          }
        } else {
          let errorMessage = data.error || 'An unknown error occurred.';
          setDownloads(prev => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], status: 'failed', error: errorMessage, progress: 0 }
          }));
        }
      };

      // Subscribe to downloads when they are added to the downloads state
      Object.keys(downloads).forEach(downloadId => {
        if (!activeDownloadListeners.has(downloadId)) {
          socketService.subscribeToDownload(downloadId);
          
          const unsubProgress = socketService.on(`download:${downloadId}:progress`, handleProgress);
          const unsubComplete = socketService.on(`download:${downloadId}:complete`, handleComplete);
          const unsubError = socketService.on(`download:${downloadId}:error`, handleError);
          
          activeDownloadListeners.set(downloadId, {
            unsubProgress,
            unsubComplete,
            unsubError
          });
        }
      });

      return () => {
        // Clean up all active listeners
        activeDownloadListeners.forEach((listeners, downloadId) => {
          listeners.unsubProgress();
          listeners.unsubComplete();
          listeners.unsubError();
          socketService.unsubscribeFromDownload(downloadId);
        });
        activeDownloadListeners.clear();
      };
    }, [downloads, onComplete, onGated]);

    const downloadAndInstallModel = useCallback(async (modelId, config) => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        
        // Clear any existing failed/gated downloads for this model
        setDownloads(prev => {
          const filtered = {};
          Object.entries(prev).forEach(([id, download]) => {
            if (download.modelId !== modelId || (download.status !== 'failed' && download.status !== 'gated')) {
              filtered[id] = download;
            }
          });
          return filtered;
        });
        
        try {
            const response = await apiService.post('/admin/huggingface/download-with-script', { modelId, ...config });
            if (response.data.downloadId) {
                const downloadId = response.data.downloadId;
                
                setDownloads(prev => ({
                  ...prev,
                  [downloadId]: { 
                    modelId, 
                    status: 'initiated', 
                    progress: 0
                  }
                }));
                setSuccess(response.data.message || 'Model download started successfully.');
            } else {
                setError(response.data.message || 'An unknown error occurred.');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to start download.');
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        success,
        downloads,
        downloadAndInstallModel,
    };
};

export default usePythonDownloader;
