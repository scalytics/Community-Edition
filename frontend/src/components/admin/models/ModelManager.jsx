import React, { useState, useEffect } from 'react';
import ModelsList from './ModelsList';
import ModelEditForm from './ModelEditForm';
import ModelDiscovery from './ModelDiscovery';
import ModelStats from './ModelStats';
import ModelUploader from './ModelUploader';
import ModelProgressPanel from './ModelProgressPanel';
import EmbeddingModelEditForm from './EmbeddingModelEditForm';
import useModelData from './hooks/useModelData';
import useModelForm from './hooks/useModelForm';
import useModelActions from './hooks/useModelActions';
import { useModelStatus } from '../../../contexts/ModelStatusContext';
import modelService from '../../../services/modelService';


const ModelManagerContent = ({
  models,
  providers,
  providersAvailable,
  availableGpuIds,
  poolStatus,
  refreshData,
  refreshPoolStatus,
  initialDataError,
  isLoading,
  preferredEmbeddingModelId 
}) => {

  const [activeTab, setActiveTab] = useState('list');
  const [modelTypeFilter, setModelTypeFilter] = useState('all');
  const [showStats, setShowStats] = useState(false);
  const [modelStats, setModelStats] = useState(null);
  const [localModelOptions, setLocalModelOptions] = useState({ basePath: '', recursive: true });
  const [showEmbeddingEditForm, setShowEmbeddingEditForm] = useState(false); 
  const [embeddingModelToEdit, setEmbeddingModelToEdit] = useState(null);
  const [showProgressPanel, setShowProgressPanel] = useState(false);
  const [progressModelId, setProgressModelId] = useState(null);
  const [activationToken, setActivationToken] = useState(null);
  const [listActivationProgress, setListActivationProgress] = useState({});
  const progressPanelRef = React.useRef(null);

  const {
    formData, isExternalModel, selectedModel,
    handleInputChange, handleModelTypeChange, loadModelIntoForm, resetForm,
  } = useModelForm(providers);

  const {
    saving, activating, discoveryInProgress, resetInProgress,
    success, error: actionError, activationErrors, activatingModelId,
    saveModelConfig, activateAndSaveModel, deleteModel, toggleModelActive,
    discoverModels, resetAllModels, fetchModelStats,
    setError: setActionError,
    setSuccess: setActionSuccess,
    setPreferredEmbeddingModel,
    settingPreferred,
    saveEmbeddingModelDetails, 
    saving: actionSaving 
  } = useModelActions(
    refreshData, 
    resetForm, 
    refreshPoolStatus
  );

  // Combine general loading state with specific action states
  // Keeping it for now in case it's used elsewhere, but the fetch logic is gone.
  const isLoadingCombined = isLoading || actionSaving || settingPreferred; 
  const displayError = initialDataError || actionError;
  const clearDisplayError = () => {
    setActionError('');
  }

  // --- Effects ---
  useEffect(() => {
    if (selectedModel) {
      setActiveTab('details');
    }
  }, [selectedModel]);

  // Listen for activation events from list activations
  useEffect(() => {
    const eventBus = require('../../../utils/eventBus').default;
    
    const handleListActivationStart = (activationId, data) => {
      if (data.modelId) {
        setListActivationProgress(prev => ({
          ...prev,
          [data.modelId]: {
            activationId,
            isActive: true,
            progress: 0,
            step: 'preparation',
            message: 'Preparing model activation...',
            startTime: Date.now(),
            progressData: [],
            debugLogs: []
          }
        }));
      }
    };

    const handleListActivationProgress = (activationId, data) => {
      setListActivationProgress(prev => {
        const newProgress = { ...prev };
        for (const [modelId, progressInfo] of Object.entries(newProgress)) {
          if (progressInfo.activationId === activationId) {
            newProgress[modelId] = {
              ...progressInfo,
              progress: data.progress || 0,
              step: data.step || 'unknown',
              message: data.message || '',
              progressData: [...progressInfo.progressData, {
                step: data.step,
                message: data.message,
                progress: data.progress,
                timestamp: Date.now()
              }]
            };
            break;
          }
        }
        return newProgress;
      });
    };

    const handleListActivationComplete = (activationId, data) => {
      setListActivationProgress(prev => {
        const newProgress = { ...prev };
        for (const [modelId, progressInfo] of Object.entries(newProgress)) {
          if (progressInfo.activationId === activationId) {
            newProgress[modelId] = {
              ...progressInfo,
              progress: 100,
              step: 'ready',
              message: data.message || 'Model ready!',
              isComplete: true
            };
            break;
          }
        }
        return newProgress;
      });
      
      // Refresh the models list to show updated activation status
      refreshData();
    };

    const handleListActivationError = (activationId, data) => {
      setListActivationProgress(prev => {
        const newProgress = { ...prev };
        for (const [modelId, progressInfo] of Object.entries(newProgress)) {
          if (progressInfo.activationId === activationId) {
            newProgress[modelId] = {
              ...progressInfo,
              hasError: true,
              message: `Error: ${data.error}`
            };
            break;
          }
        }
        return newProgress;
      });
    };

    const handleListActivationDebug = (activationId, data) => {
      setListActivationProgress(prev => {
        const newProgress = { ...prev };
        for (const [modelId, progressInfo] of Object.entries(newProgress)) {
          if (progressInfo.activationId === activationId) {
            newProgress[modelId] = {
              ...progressInfo,
              debugLogs: [...progressInfo.debugLogs, {
                level: data.level || 'INFO',
                message: data.message,
                timestamp: data.timestamp || new Date().toISOString()
              }]
            };
            break;
          }
        }
        return newProgress;
      });
    };

    // Subscribe to events
    const unsubscribeStart = eventBus.subscribe('activation:start', handleListActivationStart);
    const unsubscribeProgress = eventBus.subscribe('activation:progress', handleListActivationProgress);
    const unsubscribeComplete = eventBus.subscribe('activation:complete', handleListActivationComplete);
    const unsubscribeError = eventBus.subscribe('activation:error', handleListActivationError);
    const unsubscribeDebug = eventBus.subscribe('activation:debug', handleListActivationDebug);

    return () => {
      unsubscribeStart();
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeError();
      unsubscribeDebug();
    };
  }, []);

  // --- Event Handlers / Wrappers ---
  const handleEditModel = (model) => { 
    setEmbeddingModelToEdit(null); 
    setShowEmbeddingEditForm(false);
    loadModelIntoForm(model); 
  };

  const handleEditEmbeddingModel = (model) => { 
    resetForm(); 
    setEmbeddingModelToEdit(model);
    setShowEmbeddingEditForm(true); 
    setActiveTab('details'); 
  };

  const handleCancelEdit = () => { 
    resetForm();
    setEmbeddingModelToEdit(null);
    setShowEmbeddingEditForm(false);
    resetForm();
    setActiveTab('list');
  };

  const handleViewStats = async (modelId) => {
    const stats = await fetchModelStats(modelId);
    if (stats) {
      setModelStats(stats);
      setShowStats(true);
    }
  };

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    const isCurrentFormEmbeddingModel = selectedModel?.is_embedding_model === 1 || selectedModel?.is_embedding_model === true;

    const result = await saveModelConfig(formData, selectedModel, isExternalModel);
    if (result.success) {
      if (!isCurrentFormEmbeddingModel && result.updatedModel) {
        loadModelIntoForm(result.updatedModel);
      } else if (!isCurrentFormEmbeddingModel && !selectedModel) {
        setActiveTab('list');
      } else if (isCurrentFormEmbeddingModel && result.updatedModel) {
         console.warn("Saved LLM form while expecting embedding model?");
         setEmbeddingModelToEdit(result.updatedModel);
      } else {
         setActiveTab('details'); 
      }
    }
  };

  // Specific handler for saving embedding model details
  const handleSaveEmbeddingSubmit = async (embeddingFormData, originalModel) => {
     const result = await saveEmbeddingModelDetails(embeddingFormData, originalModel);
     if (result.success) {
        refreshData();
        setShowEmbeddingEditForm(false);
        setEmbeddingModelToEdit(null);
        setActiveTab('list');
     }
  };


  const handleActivateSubmit = async () => {
    const saveResult = await saveModelConfig(formData, selectedModel, isExternalModel);

    if (saveResult.success) {
      const modelToActivate = saveResult.updatedModel || selectedModel;
      const activationResult = await activateAndSaveModel(formData, modelToActivate, isExternalModel);

      if (activationResult.success && activationResult.activationId) {
        setProgressModelId(modelToActivate.id);
        // Pass the activationId to the progress panel for activation tracking
        setActivationToken(activationResult.activationId); 
        setShowProgressPanel(true);
        
        // Auto-scroll to progress panel after a brief delay to ensure it's rendered
        setTimeout(() => {
          if (progressPanelRef.current) {
            progressPanelRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start' 
            });
          }
        }, 100);
      }
      
      if (modelToActivate?.id) {
        try {
          const updatedModelData = await modelService.getModel(modelToActivate.id);
          if (updatedModelData) {
            loadModelIntoForm(updatedModelData);
          }
        } catch (fetchErr) {
          console.error(`[ModelManager] Error re-fetching model ${modelToActivate.id} after activation attempt:`, fetchErr);
        }
      }
      setActiveTab('details');
    } else {
      console.error("[ModelManager] Save failed before activation. Aborting activation.");
      setActionError("Failed to save model configuration before activating. Please try again.");
    }
  };

  const handleLocalOptionChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLocalModelOptions(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDiscoverSubmit = (providerId) => {
    const options = providerId === 'local' ? localModelOptions : {};
    discoverModels(providerId, options);
  }

  // --- Rendering ---
  return (
    <div className="relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white dark:bg-dark-primary bg-opacity-75 dark:bg-opacity-75 flex justify-center items-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-600 dark:text-gray-400">Loading data...</p>
        </div>
      )}

      {/* Status messages */}
      {displayError && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1 md:flex md:justify-between">
              <p className="text-sm text-red-700 dark:text-red-300">{displayError}</p>
              <p className="mt-3 text-sm md:mt-0 md:ml-6">
                <button
                  type="button"
                  onClick={clearDisplayError}
                  className="whitespace-nowrap font-medium text-red-700 dark:text-red-300 hover:text-red-600 dark:hover:text-red-200"
                >
                  Dismiss
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {success && (
         <div className="mb-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-700 p-4">
           <div className="flex">
             <div className="flex-shrink-0">
               <svg className="h-5 w-5 text-green-400 dark:text-green-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
               </svg>
             </div>
             <div className="ml-3 flex-1 md:flex md:justify-between">
               <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
               <p className="mt-3 text-sm md:mt-0 md:ml-6">
                 <button
                   type="button"
                   onClick={() => setActionSuccess('')}
                   className="whitespace-nowrap font-medium text-green-700 dark:text-green-300 hover:text-green-600 dark:hover:text-green-200 focus:outline-none focus:underline"
                 >
                   Dismiss
                 </button>
               </p>
             </div>
           </div>
         </div>
      )}

      {/* Main Content Area */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg mb-6">
        <div className="px-4 py-5 sm:px-6 flex justify-between">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Models</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Manage AI models for the platform
            </p>
          </div>
          <div className="flex space-x-4">
            {/* Tab navigation */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-md p-1 flex">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`px-3 py-1 text-sm font-medium rounded ${
                  activeTab === 'list'
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Model List
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('discover')}
                className={`px-3 py-1 text-sm font-medium rounded ${
                  activeTab === 'discover'
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Discover Models
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1 text-sm font-medium rounded ${
                  activeTab === 'upload'
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Upload Model
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Content based on active tab */}
          {activeTab === 'list' && (
            <>
              {/* Model type filter tabs */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                <div className="flex space-x-4">
                   <button type="button" onClick={() => setModelTypeFilter('all')} className={`px-3 py-2 text-sm font-medium rounded-md ${ modelTypeFilter === 'all' ? 'bg-white dark:bg-dark-primary text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>All Models</button>
                   <button type="button" onClick={() => setModelTypeFilter('online')} className={`px-3 py-2 text-sm font-medium rounded-md ${ modelTypeFilter === 'online' ? 'bg-white dark:bg-dark-primary text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>Online Models</button>
                   <button type="button" onClick={() => setModelTypeFilter('local')} className={`px-3 py-2 text-sm font-medium rounded-md ${ modelTypeFilter === 'local' ? 'bg-white dark:bg-dark-primary text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>Local Models</button>
                </div>
              </div>
              <ModelsList
                models={models.filter(model => {
                  if (modelTypeFilter === 'all') return true;
                  if (modelTypeFilter === 'online') return !!model.external_provider_id;
                  if (modelTypeFilter === 'local') return !model.external_provider_id;
                  return true;
                })}
                providers={providers}
                onEditModel={handleEditModel}
                onToggleActive={toggleModelActive}
                onDeleteModel={deleteModel}
                onViewStats={handleViewStats}
                poolStatus={poolStatus}
                activationErrors={activationErrors}
                activatingModelId={activatingModelId} // Pass the activating model ID
                preferredEmbeddingModelId={preferredEmbeddingModelId} // Pass down the received prop
                onSetPreferredEmbeddingModel={setPreferredEmbeddingModel}
                onEditEmbeddingModel={handleEditEmbeddingModel} // Pass new handler
                refreshData={refreshData}
                loading={isLoadingCombined} // Use combined loading state
                listActivationProgress={listActivationProgress} // Pass progress data
                onCloseListProgress={(modelId) => {
                  setListActivationProgress(prev => {
                    const updated = { ...prev };
                    delete updated[modelId];
                    return updated;
                  });
                }} // Pass close handler
              />
            </>
          )}

          {activeTab === 'discover' && (
            <ModelDiscovery
              providers={providers}
              providersAvailable={providersAvailable}
              loading={discoveryInProgress}
              resetInProgress={resetInProgress}
              discoveryInProgress={discoveryInProgress}
              localModelOptions={localModelOptions}
              handleResetModels={resetAllModels}
              handleDiscoverModels={handleDiscoverSubmit}
              handleLocalOptionChange={handleLocalOptionChange}
            />
          )}

          {activeTab === 'details' && !showEmbeddingEditForm && selectedModel && (
            <>
              {/* Progress Panel - Shows during model activation */}
              {showProgressPanel && progressModelId && (
                <div ref={progressPanelRef} className="px-6 pt-6">
                  <ModelProgressPanel 
                    modelId={progressModelId}
                    token={activationToken}
                    onClose={() => {
                      setShowProgressPanel(false);
                      setProgressModelId(null);
                      setActivationToken(null);
                    }}
                  />
                </div>
              )}
              
              <ModelEditForm // Render LLM form
                formData={formData}
                isExternalModel={isExternalModel}
                providers={providers}
                availableGpuIds={availableGpuIds}
                handleInputChange={handleInputChange}
                handleModelTypeChange={handleModelTypeChange}
                handleSubmit={handleSaveSubmit}
                resetForm={handleCancelEdit}
                saving={saving}
                onActivateAndSave={handleActivateSubmit}
                activating={activating} // Pass LLM activating state
                poolStatus={poolStatus}
              />
            </>
          )}

          {activeTab === 'details' && showEmbeddingEditForm && embeddingModelToEdit && (
             <EmbeddingModelEditForm // Render Embedding form
               model={embeddingModelToEdit}
               onSave={handleSaveEmbeddingSubmit} // Use specific save handler
               onCancel={handleCancelEdit}
               saving={actionSaving} // Use renamed saving state
               error={actionError}
               success={success}
             />
          )}


          {activeTab === 'upload' && (
            <ModelUploader
              onUploadSuccess={() => {
                setActionSuccess('Model uploaded successfully');
                refreshData();
              }}
              onError={(errorMsg) => setActionError(errorMsg)}
            />
          )}
        </div>
      </div>

      {/* Model Stats Modal */}
      {showStats && modelStats && (
        <ModelStats
          modelStats={modelStats}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  );
};

// Main component responsible for fetching data and handling loading/error states
const ModelManager = () => {
  const {
    models, providers, providersAvailable, availableGpuIds,
    preferredEmbeddingModelId, // Get the ID from the hook
    // Removed fetchPreferredEmbeddingModel from hook result
    loading: dataLoading,
    error: dataError,
    refreshData,
  } = useModelData();

  const { poolStatus, refreshPoolStatus } = useModelStatus();

  // Always render content, pass loading state down
  return (
    <ModelManagerContent
      models={models}
      providers={providers}
      providersAvailable={providersAvailable}
      availableGpuIds={availableGpuIds}
      poolStatus={poolStatus}
      refreshData={refreshData}
      refreshPoolStatus={refreshPoolStatus}
      initialDataError={dataError}
      isLoading={dataLoading}
      preferredEmbeddingModelId={preferredEmbeddingModelId} // Pass the fetched ID down
      // Removed fetchPreferredEmbeddingModel prop
    />
  );
};
export default ModelManager;
