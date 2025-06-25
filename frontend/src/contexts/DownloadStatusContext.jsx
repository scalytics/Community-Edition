import React, { createContext, useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';

const DownloadStatusContext = createContext({
  activeDownloads: new Set(),
  isDownloading: false,
});

// Custom hook to use the context
export const useDownloadStatus = () => useContext(DownloadStatusContext);
export const DownloadStatusProvider = ({ children }) => {
  const [activeDownloads, setActiveDownloads] = useState(new Set());

  const handleDownloadEvent = useCallback((event) => {
    try {
      if (event.type !== 'download-activity' || !event.detail) {
        return;
      }

      const { eventType, payload } = event.detail;
      if (!payload || !payload.downloadId) {
        return;
        }

        const { downloadId } = payload;

        setActiveDownloads(prevDownloads => {
          const newDownloads = new Set(prevDownloads);
          let changed = false; 
        switch (eventType) {
          case 'start':
          case 'received':
            if (!prevDownloads.has(downloadId)) {
              newDownloads.add(downloadId);
              changed = true;
            }
            break;
          case 'complete':
          case 'error':
          case 'cancel':
          case 'failed':
            if (newDownloads.has(downloadId)) {
              newDownloads.delete(downloadId);
              changed = true;
            }
            break;
          case 'progress':
            if (!prevDownloads.has(downloadId) && payload.progress < 100 && payload.status !== 'completed') {
              newDownloads.add(downloadId);
              changed = true;
            }
            break;
          default:
            break;
        }
        if (changed) {
          return newDownloads;
        }
        return prevDownloads; 
      });
    } catch (error) {
      console.error('[DownloadStatusContext] Error in handleDownloadEvent:', error);
    }
  }, []); 

  useEffect(() => {
    const downloadsToRemove = new Set(prevActiveDownloadsRef.current);
    activeDownloads.forEach(id => downloadsToRemove.delete(id));

    downloadsToRemove.forEach(downloadId => {
      const socketService = require('../services/socketService').default;
      socketService.unsubscribeFromDownload(downloadId);
    });

    prevActiveDownloadsRef.current = activeDownloads;

  }, [activeDownloads]); 
  const prevActiveDownloadsRef = useRef(activeDownloads);

  useEffect(() => {
    
    window.addEventListener('download-activity', handleDownloadEvent);

    return () => {
      window.removeEventListener('download-activity', handleDownloadEvent);
    };
  }, [handleDownloadEvent]);

  const value = useMemo(() => ({
    activeDownloads,
    isDownloading: activeDownloads.size > 0,
  }), [activeDownloads]);

  return (
    <DownloadStatusContext.Provider value={value}>
      {children}
    </DownloadStatusContext.Provider>
  );
};
