import { useState, useCallback } from 'react';
import modelService from '../../../../services/modelService';
import adminService from '../../../../services/adminService'; 

/**
 * Custom hook to manage model-related actions (save, activate, delete, etc.)
 * and associated UI states (loading, errors, success messages).
 * @param {function} refreshDataCallback - Function to trigger data refresh (models, providers, gpus).
 * @param {function} resetFormCallback - Function to trigger form reset.
 * @param {function} refreshPoolStatusCallback - Function to trigger pool status refresh via context.
 */
const useModelActions = (
  refreshDataCallback,
  resetFormCallback,
  refreshPoolStatusCallback
) => {
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activatingModelId, setActivatingModelId] = useState(null);
  const [discoveryInProgress, setDiscoveryInProgress] = useState(false);
  const [resetInProgress, setResetInProgress] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activationErrors, setActivationErrors] = useState({});
  const [settingPreferred, setSettingPreferred] = useState(false);

  // Clear messages helper
  const clearMessages = useCallback(() => {
    setError('');
    setSuccess('');
    setActivationErrors({});
    setSettingPreferred(false); 
  }, [setError, setSuccess]);

  // Save Config Only
  const saveModelConfig = useCallback(async (formData, selectedModel, isExternalModel) => {
    clearMessages();
    setSaving(true);
    let success = false;
    let updatedModelData = null;
    try {
      if (!formData.name) throw new Error('Model name is required');
      if (isExternalModel) {
        if (!formData.external_provider_id) throw new Error('Please select a provider for external model');
        if (!formData.external_model_id) throw new Error('External model ID is required');
      } else {
        if (!formData.model_path) throw new Error('Model path is required for local models');
      }

      const modelDataToSubmit = {
        ...formData,
        n_gpu_layers: formData.n_gpu_layers === '' ? null : parseInt(formData.n_gpu_layers, 10),
        n_batch: formData.n_batch === '' ? null : parseInt(formData.n_batch, 10),
        context_window: formData.context_window === '' ? null : parseInt(formData.context_window, 10),
        model_precision: formData.model_precision || 'auto',
        tensor_parallel_size: formData.tensor_parallel_size ? parseInt(formData.tensor_parallel_size, 10) : null,
        is_active: selectedModel ? selectedModel.is_active : false
      };

      let response;
      if (selectedModel) {
        response = await modelService.updateModel(selectedModel.id, modelDataToSubmit);
      } else {
        response = await modelService.addModel(modelDataToSubmit);
      }

      if (response) {
        const modelName = response?.data?.name || formData.name || 'Model';
        setSuccess(selectedModel ? `Model "${modelName}" configuration updated successfully` : `Model "${modelName}" added successfully`);
        if (typeof refreshDataCallback === 'function') await refreshDataCallback();
        if (typeof refreshPoolStatusCallback === 'function') await refreshPoolStatusCallback();

        if (selectedModel?.id) {
          try { updatedModelData = await modelService.getModel(selectedModel.id); }
          catch (fetchErr) { console.error(`Error re-fetching model ${selectedModel.id} after save:`, fetchErr); }
        } else if (response?.data?.id) {
             try { updatedModelData = await modelService.getModel(response.data.id); }
             catch (fetchErr) { console.error(`Error fetching newly created model ${response.data.id} after save:`, fetchErr); }
        }
        success = true;
        if (!selectedModel && typeof resetFormCallback === 'function') { setTimeout(resetFormCallback, 10); }
      } else { throw new Error('Failed to save model - no response from server.'); }
    } catch (err) {
      console.error('Error saving model config:', err);
      setError(`Failed to ${selectedModel ? 'update' : 'add'} model config: ${err.message}`);
      success = false;
    } finally { setSaving(false); }
    return { success, updatedModel: updatedModelData };
   }, [clearMessages, refreshDataCallback, resetFormCallback, refreshPoolStatusCallback, setSuccess, setError, setSaving]);

  // Save & Activate
  const activateAndSaveModel = useCallback(async (formData, selectedModel, isExternalModel) => {
    if (!selectedModel?.id) {
      setError("Cannot activate a model that hasn't been saved yet.");
      return { success: false };
    }
    if (isExternalModel) {
      // External models don't need the complex activation, just save.
      return await saveModelConfig(formData, selectedModel, isExternalModel);
    }

    clearMessages();
    setActivating(true);
    setSaving(true);
    const modelId = selectedModel.id;
    const modelName = formData.name || selectedModel.name;
    setActivationErrors(prev => {
      const newState = { ...prev };
      delete newState[modelId];
      return newState;
    });

    try {
      // The activateModel service call now returns activationId for progress tracking
      const response = await modelService.activateModel(modelId);

      setSuccess(`Model "${modelName}" activation initiated - check progress panel.`);
      setActivating(false);
      setSaving(false);

      // Refresh data to show the new active status
      if (typeof refreshDataCallback === 'function') await refreshDataCallback();
      if (typeof refreshPoolStatusCallback === 'function') await refreshPoolStatusCallback();
      
      // Return activation ID for progress tracking
      return { 
        success: true, 
        activationId: response?.activationId || `activation-${modelId}-${Date.now()}`,
        message: response?.message || `Model "${modelName}" activation started`
      };

    } catch (activateErr) {
      console.error(`[useModelActions] Error during activation call for model ${modelId}:`, activateErr);
      let specificErrorMessage = activateErr.message || 'Unknown activation error';
      if (activateErr.response?.data) {
        specificErrorMessage = activateErr.response.data.message || specificErrorMessage;
        if (activateErr.response.data.error_code === 'LLAMA_CONTEXT_CREATION_FAILED' || activateErr.response.data.error_code === 'WORKER_START_FAILED') {
          setActivationErrors(prev => ({ ...prev, [modelId]: specificErrorMessage }));
        }
      }
      setError(`Activation failed: ${specificErrorMessage}`);
      setSuccess('');
      if (typeof refreshDataCallback === 'function') await refreshDataCallback();
      if (typeof refreshPoolStatusCallback === 'function') await refreshPoolStatusCallback();
      setActivating(false);
      setSaving(false);
      return { success: false };
    }
  }, [clearMessages, refreshDataCallback, refreshPoolStatusCallback, setError, setSuccess, setActivating, setSaving, setActivationErrors, saveModelConfig]);

  // Delete Model
  const deleteModel = useCallback(async (modelId, modelName) => {
     if (!window.confirm(`Are you sure you want to delete model "${modelName}"? This will interrupt any ongoing tasks using this model and cannot be undone.`)) return;
     clearMessages(); setSaving(true);
     try {
       await modelService.deleteModel(modelId);
       setSuccess(`Model "${modelName}" deleted successfully`);
       if (typeof refreshDataCallback === 'function') await refreshDataCallback();
     } catch (err) {
       console.error('Error deleting model:', err);
       let errorMessage = err.message; if (err.response?.data) { errorMessage = err.response.data.message || errorMessage; }
       setError(`Failed to delete model: ${errorMessage}`);
     } finally { setSaving(false); }
    }, [clearMessages, refreshDataCallback, setError, setSuccess, setSaving]);

   // Toggle Active Status
   const toggleModelActive = useCallback(async (modelId, modelName, currentStatus, isExternal) => {
     clearMessages(); setActivating(true);
     const targetStatus = !currentStatus;
     setActivationErrors(prev => { const newState = { ...prev }; delete newState[modelId]; return newState; });
     
     if (!targetStatus) { 
       if (!window.confirm(`Are you sure you want to deactivate model "${modelName}"? This may interrupt ongoing tasks for users currently using this model.`)) { 
         setActivating(false); 
         return; 
       } 
     }

     // Set activating model ID for activation, clear for deactivation
     if (targetStatus) {
       setActivatingModelId(modelId);
     } else {
       setActivatingModelId(null);
     }

     try {
       if (isExternal) { 
         await modelService.updateModelStatus(modelId, { isActive: targetStatus }); 
         setSuccess(`Model "${modelName}" ${targetStatus ? 'activated' : 'deactivated'} successfully.`);
         setActivating(false);
         setActivatingModelId(null);
       } else { 
         if (targetStatus) { 
           // Activating local model - the service call is synchronous now
           await modelService.activateModel(modelId);
           setSuccess(`Model "${modelName}" activated successfully.`);
           setActivating(false);
           setActivatingModelId(null);
         } else { 
           // Deactivating local model - immediate feedback
           await modelService.deactivateModel(); 
           setSuccess(`Model "${modelName}" deactivated successfully.`);
           setActivating(false);
           setActivatingModelId(null);
         }
       }
       
       if (typeof refreshDataCallback === 'function') await refreshDataCallback();
       if (typeof refreshPoolStatusCallback === 'function') await refreshPoolStatusCallback();
     } catch (err) {
       console.error('Error updating model status:', err);
       let specificErrorMessage = err.message || 'Unknown error';
       if (err.response?.data) { 
         specificErrorMessage = err.response.data.message || specificErrorMessage; 
         if (err.response.data.error_code === 'LLAMA_CONTEXT_CREATION_FAILED' || err.response.data.error_code === 'WORKER_START_FAILED') { 
           setActivationErrors(prev => ({ ...prev, [modelId]: specificErrorMessage })); 
         } 
       }
       setError(`Failed to ${targetStatus ? 'activate' : 'deactivate'} model "${modelName}": ${specificErrorMessage}`); 
       setSuccess('');
       if (typeof refreshDataCallback === 'function') await refreshDataCallback();
       if (typeof refreshPoolStatusCallback === 'function') await refreshPoolStatusCallback();
       setActivating(false);
       setActivatingModelId(null);
     }
    }, [clearMessages, refreshDataCallback, refreshPoolStatusCallback, setError, setSuccess, setActivating, setActivationErrors]);

  // Discover Models
  const discoverModels = useCallback(async (providerId, options) => {
     clearMessages(); setDiscoveryInProgress(true);
     try {
       const response = await adminService.discoverProviderModels(providerId, options);
       const isSuccess = response?.success === true || response?.status === 200;
       const message = response?.message || response?.data?.message || (isSuccess ? 'Models discovered successfully' : 'Failed to discover models');
       if (isSuccess) { setSuccess(message); if (typeof refreshDataCallback === 'function') await refreshDataCallback(); }
       else { const errorMessage = response?.message || response?.data?.error || response?.error || 'Failed to discover models'; setError(errorMessage); console.error('Model discovery failed:', errorMessage); }
     } catch (err) {
       console.error('Exception during model discovery:', err); setError(err.message || 'An error occurred during model discovery');
       if (err.response) { console.error('Error response data:', err.response.data); console.error('Error response status:', err.response.status); }
     } finally { setDiscoveryInProgress(false); }
   }, [clearMessages, refreshDataCallback, setError, setSuccess, setDiscoveryInProgress]);

  // Reset Models
  const resetAllModels = useCallback(async () => {
     if (!window.confirm('Reset all models to default state? This will deactivate all models except defaults.')) return;
     clearMessages(); setResetInProgress(true);
     try {
       const response = await adminService.resetAllModels();
       if (response.success) { setSuccess(response.message || 'Models reset successfully'); if (typeof refreshDataCallback === 'function') await refreshDataCallback(); }
       else { setError(response.message || 'Failed to reset models'); }
     } catch (err) { console.error('Error resetting models:', err); setError(err.message || 'An error occurred while resetting models'); }
     finally { setResetInProgress(false); }
   }, [clearMessages, refreshDataCallback, setError, setSuccess, setResetInProgress]);

  // Fetch Model Stats
  const fetchModelStats = useCallback(async (modelId) => {
    clearMessages(); setStatsLoading(true);
    try {
      const statsResponse = await adminService.getModelStats(modelId);
      let normalizedStats = { userUsage: [], dailyUsage: [] };
      if (statsResponse) { const statsData = statsResponse?.data?.data || statsResponse?.data || statsResponse; if (statsData?.userUsage && Array.isArray(statsData.userUsage)) normalizedStats.userUsage = statsData.userUsage; if (statsData?.dailyUsage && Array.isArray(statsData.dailyUsage)) normalizedStats.dailyUsage = statsData.dailyUsage; }
      return normalizedStats;
    } catch (err) { console.error('Error fetching model stats:', err); setError('Failed to load model statistics: ' + (err.message || 'Unknown error')); return { userUsage: [], dailyUsage: [] }; }
    finally { setStatsLoading(false); }
   }, [clearMessages, setError, setStatsLoading]);

  // Set Preferred Embedding Model
  const setPreferredEmbeddingModel = useCallback(async (modelId) => {
    clearMessages();
    setSettingPreferred(true);
    try {
      const response = await adminService.updatePreferredEmbeddingModel(modelId); // Assuming adminService has this method
      if (response.success) {
        setSuccess(response.message || 'Preferred embedding model updated. Restart recommended for worker pool changes.'); // Updated message slightly
        // Rely on the general refresh callback provided
        if (typeof refreshDataCallback === 'function') {
          await refreshDataCallback();
        } else {
          console.warn('[useModelActions] refreshDataCallback is not a function'); // Changed log level
        }
      } else {
        throw new Error(response.message || 'Failed to set preferred embedding model.');
      }
    } catch (err) {
      console.error('Error setting preferred embedding model:', err);
      setError(err.message || 'Failed to update preferred embedding model setting.');
    } finally {
      setSettingPreferred(false);
    }
  }, [clearMessages, refreshDataCallback, setError, setSuccess, setSettingPreferred]); // Removed fetchPreferredEmbeddingModelCallback from dependencies

  // --- New Function to Save Embedding Model Details ---
  const saveEmbeddingModelDetails = useCallback(async (formData, originalModel) => {
    if (!originalModel?.id) {
      setError("Cannot save details for an unsaved model.");
      return { success: false };
    }
    clearMessages();
    setSaving(true); 
    let success = false;
    let updatedModelData = null;
    try {
      // Only update description for embedding models (name is read-only)
      const dataToUpdate = {
        description: formData.description,
      };

      // Check if description actually changed to avoid unnecessary updates
      if (dataToUpdate.description === (originalModel.description || '')) {
         setSuccess("No changes detected in description.");
         setSaving(false);
         return { success: true, updatedModel: originalModel }; 
      }


      const response = await modelService.updateModel(originalModel.id, dataToUpdate);

      if (response) {
        setSuccess(`Embedding model "${formData.name}" details updated successfully`);
        if (typeof refreshDataCallback === 'function') await refreshDataCallback();
        try { updatedModelData = await modelService.getModel(originalModel.id); }
        catch (fetchErr) { console.error(`Error re-fetching embedding model ${originalModel.id} after save:`, fetchErr); }
        success = true;
      } else {
        throw new Error('Failed to save embedding model details - no response from server.');
      }
    } catch (err) {
      console.error('Error saving embedding model details:', err);
      setError(`Failed to update embedding model details: ${err.message}`);
      success = false;
    } finally {
      setSaving(false);
    }
    return { success, updatedModel: updatedModelData };
  }, [clearMessages, refreshDataCallback, setError, setSuccess, setSaving]);


  return {
    saving, activating, discoveryInProgress, resetInProgress, statsLoading,
    success, error, activationErrors, activatingModelId,
    saveModelConfig, activateAndSaveModel, deleteModel, toggleModelActive,
    discoverModels, resetAllModels, fetchModelStats,
    setError, setSuccess,
    setPreferredEmbeddingModel,
    settingPreferred,
    saveEmbeddingModelDetails,
  };
};

export default useModelActions;
