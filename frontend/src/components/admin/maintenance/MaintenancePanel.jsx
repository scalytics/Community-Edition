import React, { useState, useEffect } from 'react';
import { systemService } from '../../../services/admin';
import { tooltipStyles } from './utils';
import { formatBytes } from './utils';

// Import modular components
import StorageInfo from './StorageInfo';
import ModelDirectories from './ModelDirectories';
import DatabaseBackups from './DatabaseBackups';
import ConfirmationModal from './ConfirmationModal';
import DirectoryActions from './DirectoryActions';
import BackupActions from './BackupActions';
import BackupUploadSection from './BackupUploadSection';
import ServerAdminSection from './ServerAdminSection';

const MaintenancePanel = () => {
  // Add tooltip styles to document
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = tooltipStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Model directory states
  const [modelDirectories, setModelDirectories] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);
  const [storageInfoLoading, setStorageInfoLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Directory action states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [directoryToDelete, setDirectoryToDelete] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupProcessing, setCleanupProcessing] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [directoryToPurge, setDirectoryToPurge] = useState(null);
  const [purgeProcessing, setPurgeProcessing] = useState(false);

  // Database backup states
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState(null);
  const [backupSuccess, setBackupSuccess] = useState(null);
  const [backupProcessing, setBackupProcessing] = useState(false);
  const [deleteBackupConfirmOpen, setDeleteBackupConfirmOpen] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState(null);
  const [restoreBackupConfirmOpen, setRestoreBackupConfirmOpen] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState(null);
  const [restoreProcessing, setRestoreProcessing] = useState(false);

  // System info state - retrieved for future use but not displayed in current UI
  const [/*systemInfo*/, setSystemInfo] = useState(null);
  const [/*systemInfoLoading*/, setSystemInfoLoading] = useState(false);
  
  // Upload backup state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadValidationError, setUploadValidationError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  
  // Restart server state
  const [restartServerProcessing, setRestartServerProcessing] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [restartError, setRestartError] = useState(null);

  // Fetch all data (model directories, storage info, backups, and system info)
  const fetchData = async () => {
    setLoading(true);
    setStorageInfoLoading(true);
    setBackupsLoading(true);
    setSystemInfoLoading(true);
    setError(null);
    setBackupError(null);
    
    try {
      // Fetch model directories
      const dirResponse = await systemService.getModelDirectories();
      
      // Set model directories from response - ensure we handle both array and object with data property
      if (dirResponse && Array.isArray(dirResponse?.data?.data)) {
        setModelDirectories(dirResponse.data.data);
      } else if (dirResponse && Array.isArray(dirResponse.data)) {
        setModelDirectories(dirResponse.data);
      } else {
        setModelDirectories([]);
      }
      
      // Fetch storage info
      const storageResponse = await systemService.getStorageInfo();
      setStorageInfo(storageResponse || null);
      setStorageInfoLoading(false);
      
      // Fetch backups
      const backupResponse = await systemService.listDatabaseBackups();
      
      // Ensure we handle various API response formats
      if (backupResponse && Array.isArray(backupResponse?.data?.data)) {
        setBackups(backupResponse.data.data);
      } else if (backupResponse && Array.isArray(backupResponse.data)) {
        setBackups(backupResponse.data);
      } else if (Array.isArray(backupResponse)) {
        setBackups(backupResponse);
      } else {
        setBackups([]);
      }
      
      // Fetch system info (includes restored backup information)
      const systemInfoResponse = await systemService.getSystemInfo();
      setSystemInfo(systemInfoResponse || {});
      
    } catch (err) {
      if (err.message?.includes('backups')) {
        setBackupError('Error fetching backups: ' + (err.response?.data?.message || err.message));
      } else {
        setError('Error fetching data: ' + (err.response?.data?.message || err.message));
        console.error('Error fetching data:', err);
      }
    } finally {
      setLoading(false);
      setBackupsLoading(false);
      setSystemInfoLoading(false);
    }
  };

  // Alias for fetchData - to maintain compatibility with existing code
  const fetchBackups = () => fetchData();

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setUploadFile(file);
    setUploadValidationError(null);
    
    if (file) {
      // Validate the file on selection
      const validationResult = systemService.validateDatabaseBackupFile(file);
      if (!validationResult.success) {
        setUploadValidationError(validationResult.message);
      }
    }
  };
  
  // Handle backup file upload
  const handleUploadBackup = async () => {
    if (!uploadFile) {
      setUploadValidationError('Please select a file to upload');
      return;
    }
    
    // Validate the file again before upload
    const validationResult = systemService.validateDatabaseBackupFile(uploadFile);
    if (!validationResult.success) {
      setUploadValidationError(validationResult.message);
      return;
    }
    
    setUploadProgress(true);
    setUploadError(null);
    setBackupError(null);
    setBackupSuccess(null);
    
    try {
      const response = await systemService.uploadDatabaseBackup(uploadFile);
      
      if (response && response.success) {
        setBackupSuccess(`Successfully uploaded backup: ${response.data?.fileName}`);
        // Reset file input
        setUploadFile(null);
        const fileInput = document.getElementById('backupFileInput');
        if (fileInput) fileInput.value = '';
        // Refresh the backup list
        fetchData();
      } else {
        setUploadError(`Error uploading backup: ${response.message || 'Unknown error'}`);
      }
    } catch (err) {
      setUploadError('Error uploading backup: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploadProgress(false);
    }
  };
  
  // Create a new database backup
  const createBackup = async () => {
    setBackupProcessing(true);
    setBackupError(null);
    setBackupSuccess(null);
    
    try {
      const response = await systemService.createDatabaseBackup();
      
      if (response?.success || response?.data?.success) {
        const fileName = response?.data?.fileName || 
                         response?.fileName || 
                         response?.data?.data?.fileName || 
                         'unknown';
                         
        setBackupSuccess(`Successfully created backup: ${fileName}`);
        fetchData();
      } else {
        const errorMessage = response?.message || 
                          response?.data?.message || 
                          'Unknown error';
        setBackupError(`Error creating backup: ${errorMessage}`);
      }
    } catch (err) {
      console.error('Backup creation error:', err); 
      setBackupError('Error creating backup: ' + (err.response?.data?.message || err.message));
    } finally {
      setBackupProcessing(false);
    }
  };
  
  // Delete a database backup
  const handleDeleteBackup = async (fileName) => {
    setBackupProcessing(true);
    setBackupError(null);
    setBackupSuccess(null);
    
    try {
      const response = await systemService.deleteDatabaseBackup(fileName);
      
      if (response?.success || response?.data?.success) {
        setBackupSuccess(`Successfully deleted backup: ${fileName}`);
        fetchData();
      } else {
        const errorMessage = response?.message || 
                          response?.data?.message || 
                          'Unknown error';
        setBackupError(`Error deleting backup: ${errorMessage}`);
      }
    } catch (err) {
      console.error('Backup deletion error:', err); 
      setBackupError('Error deleting backup: ' + (err.response?.data?.message || err.message));
    } finally {
      setBackupProcessing(false);
      setDeleteBackupConfirmOpen(false);
      setBackupToDelete(null);
    }
  };
  
  // Open delete backup confirmation dialog
  const openDeleteBackupConfirm = (backup) => {
    setBackupToDelete(backup);
    setDeleteBackupConfirmOpen(true);
  };
  
  // Close delete backup confirmation dialog
  const closeDeleteBackupConfirm = () => {
    setDeleteBackupConfirmOpen(false);
    setBackupToDelete(null);
  };

  // Handle restore database backup
  const handleRestoreBackup = async (fileName) => {
    setRestoreProcessing(true);
    setBackupError(null);
    setBackupSuccess(null);
    
    try {
      const response = await systemService.restoreDatabaseBackup(fileName);
      
      if (response?.success || response?.data?.success) {
        setBackupSuccess(`Successfully restored database from backup: ${fileName}`);
        fetchData();
      } else {
        const errorMessage = response?.message || 
                          response?.data?.message || 
                          'Unknown error';
        setBackupError(`Error restoring backup: ${errorMessage}`);
      }
    } catch (err) {
      console.error('Backup restore error:', err); 
      setBackupError('Error restoring backup: ' + (err.response?.data?.message || err.message));
    } finally {
      setRestoreProcessing(false);
      setRestoreBackupConfirmOpen(false);
      setBackupToRestore(null);
    }
  };
  
  // Open restore backup confirmation dialog
  const openRestoreBackupConfirm = (backup) => {
    setBackupToRestore(backup);
    setRestoreBackupConfirmOpen(true);
  };
  
  // Close restore backup confirmation dialog
  const closeRestoreBackupConfirm = () => {
    setRestoreBackupConfirmOpen(false);
    setBackupToRestore(null);
  };
  
  // Handle download database backup
  const handleDownloadBackup = async (fileName) => {
    try {
      setBackupProcessing(true);
      setBackupError(null);
      
      
      // Call the downloadDatabaseBackup method which handles auth and triggers download
      await systemService.downloadDatabaseBackup(fileName);
      
      setBackupSuccess(`Download initiated for ${fileName}`);
    } catch (err) {
      console.error('Download error:', err);
      setBackupError(`Error downloading backup: ${err.response?.data?.message || err.message || 'Download failed'}`);
    } finally {
      setBackupProcessing(false);
    }
  };
  
  // Initial data load
  useEffect(() => {
    fetchData();
  }, []);
  
  // Handle directory deletion
  const handleDeleteDirectory = async (dirName) => {
    setProcessing(true);
    
    try {
      const response = await systemService.deleteModelDirectory(dirName);
      
      if (response && response.success) {
        setSuccess(`Successfully deleted directory: ${dirName}`);
        // Refresh the data
        fetchData();
      } else {
        const errorMsg = response?.message || 'Unknown error';
        if (errorMsg.includes('contains model files') || errorMsg.includes('referenced in the database')) {
          setError(errorMsg);
        } else {
          setError(`Error deleting directory: ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
      
      if (errorMsg.includes('contains model files') || errorMsg.includes('referenced in the database')) {
        setError(errorMsg);
      } else {
        setError('Error deleting directory: ' + errorMsg);
      }
    } finally {
      setProcessing(false);
      setDeleteConfirmOpen(false);
      setDirectoryToDelete(null);
    }
  };
  
  const handlePurgeDirectory = async (dirName) => {
    setPurgeProcessing(true);
    
    try {
      const response = await systemService.forceDeleteModelDirectory(dirName);
      
      if (response && response.success) {
        setSuccess(`Successfully purged directory: ${dirName}`);
        // Refresh the data
        fetchData();
      } else {
        const errorMsg = response?.message || 'Unknown error';
        if (errorMsg.includes('referenced in the database')) {
          setError(errorMsg);
        } else {
          setError(`Error purging directory: ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
      
      if (errorMsg.includes('referenced in the database')) {
        setError(errorMsg);
      } else {
        setError('Error purging directory: ' + errorMsg);
      }
    } finally {
      setPurgeProcessing(false);
      setPurgeConfirmOpen(false);
      setDirectoryToPurge(null);
    }
  };
  
  // Open delete confirmation dialog
  const openDeleteConfirm = (directory) => {
    setDirectoryToDelete(directory);
    setDeleteConfirmOpen(true);
  };
  
  // Close delete confirmation dialog
  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setDirectoryToDelete(null);
  };
  
  // Open purge confirmation dialog
  const openPurgeConfirm = (directory) => {
    setDirectoryToPurge(directory);
    setPurgeConfirmOpen(true);
  };
  
  // Close purge confirmation dialog
  const closePurgeConfirm = () => {
    setPurgeConfirmOpen(false);
    setDirectoryToPurge(null);
  };
  
  // Handle cleanup of all model directories
  const handleCleanupAll = async () => {
    setCleanupProcessing(true);
    
    try {
      // Filter out active directories
      const inactiveDirectories = modelDirectories.filter(dir => !dir.isActive);
      const dirNames = inactiveDirectories.map(dir => dir.name);
      
      // Count active directories that will be preserved
      const activeCount = modelDirectories.length - inactiveDirectories.length;
      
      if (dirNames.length === 0) {
        setError(activeCount > 0 
          ? `All ${activeCount} directories are active and cannot be deleted. Please use the model manager to remove them first.` 
          : 'No directories to clean up');
        setCleanupConfirmOpen(false);
        setCleanupProcessing(false);
        return;
      }
      
      // Call the bulk delete API with only inactive directories
      const response = await systemService.cleanupModelDirectories(dirNames);
      
      if (response.success) {
        if (response.data.failed > 0) {
          // Some directories couldn't be deleted
          const failedItems = response.data.results.filter(result => !result.success);
          const modelFileErrors = failedItems.filter(item => item.message && 
            (item.message.includes('contains model files') || item.message.includes('referenced in the database')));
          
          if (modelFileErrors.length > 0) {
            setError(`Some directories contain model files or are referenced in the database and could not be deleted. Please use the model manager to remove those models first. Successfully cleaned up ${response.data.successful} directories.`);
          } else {
            setSuccess(`Partially successful: Cleaned up ${response.data.successful} directories. ${response.data.failed} failed.`);
          }
        } else {
          setSuccess(response.message || `Successfully cleaned up ${response.data?.successful || 0} directories`);
        }
        // Refresh the data
        fetchData();
      } else {
        setError(`Error during cleanup: ${response.message}`);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message;
      if (errorMsg.includes('contains model files') || errorMsg.includes('referenced in the database')) {
        setError(errorMsg);
      } else {
        setError('Error during cleanup: ' + errorMsg);
      }
    } finally {
      setCleanupProcessing(false);
      setCleanupConfirmOpen(false);
    }
  };
  
  // Close cleanup confirmation dialog
  const closeCleanupConfirm = () => {
    setCleanupConfirmOpen(false);
  };

  // Handle server restart
  const handleRestartServer = async () => {
    setRestartServerProcessing(true);
    setRestartError(null);
    setSuccess(null);
    setError(null);
    
    try {
      const response = await systemService.restartServer();
      
      if (response && response.success) {
        setSuccess(`Server restart initiated successfully. The server will be back online in a few moments.`);
      } else {
        setRestartError(`Error restarting server: ${response?.message || 'Unknown error'}`);
      }
    } catch (err) {
      setRestartError('Error restarting server: ' + (err.response?.data?.message || err.message));
    } finally {
      setRestartServerProcessing(false);
      setRestartConfirmOpen(false);
    }
  };
  
  // Open restart confirmation dialog
  const openRestartConfirm = () => {
    setRestartConfirmOpen(true);
  };
  
  // Close restart confirmation dialog
  const closeRestartConfirm = () => {
    setRestartConfirmOpen(false);
  };
  
  // Refresh data
  const handleRefresh = () => {
    // Clear messages
    setSuccess(null);
    setError(null);
    
    // Fetch data
    fetchData();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          System Maintenance
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage model directories, database backups, and server administration
        </p>
      </div>

      {/* Main Content - Single Column Layout */}
      <div className="space-y-8">
        
        {/* Model Maintenance Section */}
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow-lg border border-gray-200 dark:border-dark-border">
          <div className="p-6">
            <DirectoryActions
              modelDirectories={modelDirectories}
              loading={loading}
              error={error}
              success={success}
              cleanupConfirmOpen={cleanupConfirmOpen}
              cleanupProcessing={cleanupProcessing}
              setCleanupConfirmOpen={setCleanupConfirmOpen}
              handleRefresh={handleRefresh}
            />
            
            {/* Storage Information */}
            <div className="mt-6">
              <StorageInfo storageInfo={storageInfo} loading={storageInfoLoading} />
            </div>
            
            {/* Model Directories Table */}
            <div className="mt-6">
              <ModelDirectories 
                modelDirectories={modelDirectories}
                loading={loading}
                openDeleteConfirm={openDeleteConfirm}
                openPurgeConfirm={openPurgeConfirm}
              />
            </div>
          </div>
        </div>

        {/* Database Backups Section */}
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow-lg border border-gray-200 dark:border-dark-border">
          <div className="p-6">
            <BackupActions
              backupsLoading={backupsLoading}
              backupProcessing={backupProcessing}
              backupError={backupError}
              backupSuccess={backupSuccess}
              createBackup={createBackup}
              fetchBackups={fetchBackups}
            />
            
            {/* Database Backups List */}
            <div className="mt-6">
              <DatabaseBackups 
                backups={backups}
                backupsLoading={backupsLoading}
                backupProcessing={backupProcessing}
                restoreProcessing={restoreProcessing}
                openDeleteBackupConfirm={openDeleteBackupConfirm}
                openRestoreBackupConfirm={openRestoreBackupConfirm}
                handleDownloadBackup={handleDownloadBackup}
              />
            </div>

            {/* Upload Backup Section */}
            <div className="mt-6">
              <BackupUploadSection
                uploadFile={uploadFile}
                uploadError={uploadError}
                uploadValidationError={uploadValidationError}
                uploadProgress={uploadProgress}
                handleFileChange={handleFileChange}
                handleUploadBackup={handleUploadBackup}
                formatFileSize={formatBytes}
              />
            </div>
          </div>
        </div>
        
        {/* Server Administration Section */}
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow-lg border border-gray-200 dark:border-dark-border">
          <div className="p-6">
            <ServerAdminSection
              restartServerProcessing={restartServerProcessing}
              restartError={restartError}
              openRestartConfirm={openRestartConfirm}
            />
          </div>
        </div>
      </div>
      
      {/* Confirmation Modals */}
      
      {/* Delete Directory Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Confirm Directory Deletion"
        message={
          directoryToDelete ? 
          `Are you sure you want to delete the directory ${directoryToDelete.name}? This action cannot be undone. All files inside this directory will be permanently deleted.` : 
          ''
        }
        confirmText="Delete"
        onConfirm={() => handleDeleteDirectory(directoryToDelete?.name)}
        onCancel={closeDeleteConfirm}
        processing={processing}
        icon="delete"
      />
      
      {/* Purge Directory Confirmation Modal */}
      <ConfirmationModal
        isOpen={purgeConfirmOpen}
        title="Force Delete (Purge) Directory"
        message={
          directoryToPurge ? 
          <React.Fragment>
            Are you sure you want to <strong>force delete</strong> the directory <strong>{directoryToPurge.name}</strong>?
            <br /><br />
            <span className="text-orange-600 dark:text-orange-400 font-medium">Warning: This directory contains model files!</span>
            <br />
            Force delete will remove the directory and all its contents, even if it contains model files.
            <br /><br />
            This action cannot be undone.
          </React.Fragment> : 
          ''
        }
        confirmText="Force Delete"
        onConfirm={() => handlePurgeDirectory(directoryToPurge?.name)}
        onCancel={closePurgeConfirm}
        processing={purgeProcessing}
        confirmBgColor="bg-orange-600 dark:bg-orange-700"
        confirmHoverColor="hover:bg-orange-700 dark:hover:bg-orange-800"
        icon="warning"
      />
      
      {/* Cleanup Confirmation Modal */}
      <ConfirmationModal
        isOpen={cleanupConfirmOpen}
        title="Cleanup All Model Directories"
        message={(() => {
          const inactiveCount = modelDirectories.filter(dir => !dir.isActive).length;
          const activeCount = modelDirectories.length - inactiveCount;
          
          if (activeCount > 0) {
            return (
              <React.Fragment>
                Are you sure you want to clean up <strong>{inactiveCount} inactive model directories</strong>?
                <br /><br />
                <span className="text-blue-600 dark:text-blue-400">Note: {activeCount} active directories containing model files or referenced in the database will be preserved.</span>
                <br /><br />
                This action cannot be undone. All files inside the inactive directories will be permanently deleted.
              </React.Fragment>
            );
          } else {
            return (
              <React.Fragment>
                Are you sure you want to delete <strong>ALL {modelDirectories.length} model directories</strong>?
                This action cannot be undone. All files inside these directories will be permanently deleted.
              </React.Fragment>
            );
          }
        })()}
        confirmText={
          modelDirectories.filter(dir => !dir.isActive).length === modelDirectories.length
          ? 'Delete All Directories'
          : 'Delete Inactive Directories'
        }
        onConfirm={handleCleanupAll}
        onCancel={closeCleanupConfirm}
        processing={cleanupProcessing}
        icon="delete"
      />
      
      {/* Restore Backup Confirmation Modal */}
      <ConfirmationModal
        isOpen={restoreBackupConfirmOpen}
        title="Confirm Database Restore"
        message={
          backupToRestore ?
          <React.Fragment>
            Are you sure you want to restore the database from backup <strong>{backupToRestore.fileName}</strong>?
            <br /><br />
            <span className="text-orange-600 dark:text-orange-400 font-medium">Warning: This will replace your current database with the backup!</span>
            <br />
            All data changes since this backup was created will be lost.
            <br /><br />
            A backup of your current database will be created before restoring.
          </React.Fragment> :
          ''
        }
        confirmText="Restore Database"
        onConfirm={() => handleRestoreBackup(backupToRestore?.fileName)}
        onCancel={closeRestoreBackupConfirm}
        processing={restoreProcessing}
        confirmBgColor="bg-green-600 dark:bg-green-700"
        confirmHoverColor="hover:bg-green-700 dark:hover:bg-green-800"
        icon="restore"
      />
      
      {/* Delete Backup Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteBackupConfirmOpen}
        title="Confirm Backup Deletion"
        message={
          backupToDelete ?
          <React.Fragment>
            Are you sure you want to delete the backup <strong>{backupToDelete.fileName}</strong>?
            This action cannot be undone.
          </React.Fragment> :
          ''
        }
        confirmText="Delete"
        onConfirm={() => handleDeleteBackup(backupToDelete?.fileName)}
        onCancel={closeDeleteBackupConfirm}
        processing={backupProcessing}
        icon="delete"
      />
      
      {/* Restart Server Confirmation Modal */}
      <ConfirmationModal
        isOpen={restartConfirmOpen}
        title="Confirm Server Restart"
        message={
          <React.Fragment>
            Are you sure you want to restart the server?
            <br /><br />
            <span className="text-orange-600 dark:text-orange-400 font-medium">Warning: This will temporarily disconnect all users!</span>
            <br />
            All active sessions will be interrupted, and the server will be unavailable for a few moments.
            <br /><br />
            Any unsaved data may be lost.
          </React.Fragment>
        }
        confirmText="Restart Server"
        onConfirm={handleRestartServer}
        onCancel={closeRestartConfirm}
        processing={restartServerProcessing}
        confirmBgColor="bg-purple-600 dark:bg-purple-700"
        confirmHoverColor="hover:bg-purple-700 dark:hover:bg-purple-800"
        icon="warning"
      />
    </div>
  );
};

export default MaintenancePanel;
