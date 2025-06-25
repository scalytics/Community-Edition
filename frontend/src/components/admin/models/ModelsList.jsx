import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import ModelProgressPanel from './ModelProgressPanel';

const formatContextWindow = (tokens) => {
  if (tokens === null || tokens === undefined || isNaN(tokens)) {
    return 'N/A';
  }
  if (tokens >= 1024) {
    const kValue = tokens / 1024;
    const formattedK = kValue.toFixed(kValue % 1 === 0 ? 0 : 1);
    return `${formattedK}k`;
  }
  return tokens.toString();
};

const ModelsList = ({
  models = [],
  providers = [],
  loading,
  onEditModel,
  onDeleteModel,
  onViewStats,
  onToggleActive,
  refreshData,
  activatingModelId,
  activationErrors,
  preferredEmbeddingModelId,
  onSetPreferredEmbeddingModel,
  onEditEmbeddingModel,
  listActivationProgress = {},
  onCloseListProgress,
}) => {
  const safeModels = Array.isArray(models) ? models : [];
  const safeProviders = Array.isArray(providers) ? providers : [];
  

  if (loading && safeModels.length === 0) {
    return (
      <div className="animate-pulse">
        <div className="h-12 bg-gray-100 dark:bg-gray-700"></div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-50 dark:bg-dark-primary"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border border border-gray-200 dark:border-dark-border rounded-lg">
        <thead className="bg-gray-50 dark:bg-dark-secondary">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Model</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Size</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Est. VRAM / Dim</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Context</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
          {safeModels.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">No models found</td>
            </tr>
          ) : (
            safeModels.map((model) => {
            if (!model || typeof model.id === 'undefined') {
              return <tr key={`error-${Math.random()}`}><td colSpan="7">Error rendering model row</td></tr>;
            }

            const isExternal = !!model.external_provider_id;
            const provider = safeProviders.find(p => p.id === model.external_provider_id) || {};
            const isEmbedding = model.is_embedding_model === 1 || model.is_embedding_model === true || model.pipeline_tag === 'feature-extraction';
            const isPreferredEmbedding = !!model.is_preferred_embedding;
            const isConfiguredActive = model.is_active === true || model.is_active === 1;
            const isActivatingLLM = activatingModelId === model.id;
            const workerErrorTooltip = activationErrors?.[model.id] || null;

            let statusText = 'Inactive';
            let statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';

            if (isActivatingLLM) {
                statusText = 'Activating';
                statusColor = 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300';
            } else if (isConfiguredActive) {
                statusText = 'Active';
                statusColor = isEmbedding ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200' : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
            } else if (activationErrors?.[model.id]) {
                statusText = 'Error';
                statusColor = 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300';
            }

            
            const showLLMDeactivateButton = isConfiguredActive && !isEmbedding;
            const showActivateEmbeddingButton = isEmbedding && !isConfiguredActive;
            const showDeactivateEmbeddingButton = isEmbedding && isConfiguredActive;
            const disableDelete = !isExternal && ((!isEmbedding && isConfiguredActive) || isPreferredEmbedding || isActivatingLLM);

            return (
              <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                {/* Model Column */}
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    {/* Icon */}
                    <div className={`flex-shrink-0 h-10 w-10 rounded-full ${isEmbedding ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'} flex items-center justify-center`}>
                      {isExternal ? ( <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> )
                       : isEmbedding ? ( <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg> )
                       : ( <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg> )}
                    </div>
                    {/* Name & Desc */}
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{model.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                        <span title={model.description || ''}>{model.description || 'No description'}</span>
                      </div>
                    </div>
                  </div>
                </td>
                {/* Type Column */}
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center space-x-2">
                    {isExternal ? ( 
                      <span className="text-gray-500 dark:text-gray-400">External ({provider.name || 'Unknown'}) {model.external_model_id && (<div className="text-xs text-gray-400 dark:text-gray-500">ID: {model.external_model_id}</div>)}</span> 
                    ) : isEmbedding ? ( 
                      <span className="font-medium text-purple-600 dark:text-purple-400">Local Embedding</span> 
                    ) : ( 
                      <>
                        <span className={`font-medium ${
                          isActivatingLLM ? 'text-yellow-600 dark:text-yellow-400' : 
                          isConfiguredActive ? 'text-green-600 dark:text-green-400' : 
                          'text-gray-500 dark:text-gray-400'
                        }`}>Local LLM</span>
                        {(() => {
                          let tensorParallelSize = 1;
                          if (model.config) {
                            try {
                              const configData = JSON.parse(model.config);
                              tensorParallelSize = configData.tensor_parallel_size || 1;
                            } catch (e) {
                              tensorParallelSize = 1;
                            }
                          }
                          
                          if (isConfiguredActive && tensorParallelSize >= 1) {
                            return (
                              <div className="grid grid-cols-4 gap-0.5" style={{ width: 'fit-content' }} title={`Tensor Parallel: ${tensorParallelSize} GPU(s)`}>
                                {Array.from({ length: tensorParallelSize }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-2 h-2 bg-green-500 rounded-sm"
                                  ></div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                  </div>
                </td>
                {/* Size Column */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {!isExternal ? (model.file_size_formatted || 'N/A') : '-'}
                </td>
                {/* Est. VRAM / Dim Column */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {isExternal ? '-'
                   : isEmbedding ? ((model.config?.dimension || model.embedding_dimension) ? `${model.config?.dimension || model.embedding_dimension} Dim` : 'N/A')
                   : (typeof model.estimatedVramGb === 'number' && isFinite(model.estimatedVramGb) ? `${model.estimatedVramGb.toFixed(1)} GB` : 'N/A')}
                 </td>
                {/* Context Column */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {isEmbedding ? '-' : (typeof model.effective_context_window === 'number' ? formatContextWindow(model.effective_context_window) + ' tokens' : 'N/A')}
                </td>
                {/* Status Column */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span title={workerErrorTooltip || statusText} className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor} ${workerErrorTooltip ? 'cursor-help' : ''}`}>
                    {statusText}
                  </span>
                </td>
                {/* Actions Column */}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                   <button onClick={() => onViewStats(model.id)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" data-tooltip-id={`stats-tt-${model.id}`} data-tooltip-content="View Stats">
                      <svg className="h-4 w-4 inline" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><g fillRule="evenodd" clipRule="evenodd" stroke="none" strokeWidth="1"><path fillRule="evenodd" clipRule="evenodd" d="M746.667 106.667V1493.33H1173.33V106.667H746.667ZM1056 224H864V1376H1056V224ZM106.667 533.333H533.333V1493.33H106.667V533.333ZM224 650.667H416V1376H224V650.667Z"></path><path d="M1920 1706.67H0V1824H1920V1706.67Z"></path><path fillRule="evenodd" clipRule="evenodd" d="M1386.67 746.667H1813.33V1493.33H1386.67V746.667ZM1504 864H1696V1376H1504V864Z"></path></g></svg>
                      <Tooltip id={`stats-tt-${model.id}`} place="top" effect="solid" />
                    </button>
                    {!isExternal && (
                      <button
                        onClick={() => onEditModel(model)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        data-tooltip-id={`edit-tt-${model.id}`}
                        data-tooltip-content={isEmbedding ? "Edit Embedding Model Details" : "Edit Model Config"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        <Tooltip id={`edit-tt-${model.id}`} place="top" effect="solid" />
                      </button>
                    )}
                    {/* Activate/Deactivate Buttons (Only for non-embedding models) */}
                    {!isEmbedding && showLLMDeactivateButton && (
                      <button onClick={() => onToggleActive(model.id, model.name, true, isExternal)} disabled={isActivatingLLM} className={`text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 ${isActivatingLLM ? 'opacity-50 cursor-not-allowed' : ''}`} data-tooltip-id={`deactivate-tt-${model.id}`} data-tooltip-content={isActivatingLLM ? "Stopping..." : "Deactivate Model"}>
                        {isActivatingLLM ? (
                          <svg className="animate-spin h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.97 22C17.4928 22 21.97 17.5228 21.97 12C21.97 6.47715 17.4928 2 11.97 2C6.44712 2 1.96997 6.47715 1.96997 12C1.96997 17.5228 6.44712 22 11.97 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path><path d="M10.73 16.23H13.27C15.39 16.23 16.23 15.38 16.23 13.27V10.73C16.23 8.61002 15.38 7.77002 13.27 7.77002H10.73C8.61002 7.77002 7.77002 8.62002 7.77002 10.73V13.27C7.77002 15.38 8.62002 16.23 10.73 16.23Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                        )}
                        <Tooltip id={`deactivate-tt-${model.id}`} place="top" effect="solid" />
                      </button>
                    )}
                    {!isEmbedding && !showLLMDeactivateButton && (
                      <button onClick={() => onToggleActive(model.id, model.name, false, isExternal)} disabled={isActivatingLLM} className={`text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-600 ${isActivatingLLM ? 'opacity-50 cursor-not-allowed' : ''}`} data-tooltip-id={`activate-tt-${model.id}`} data-tooltip-content={isActivatingLLM ? "Activating..." : "Activate Model"}>
                        {isActivatingLLM ? (
                          <svg className="animate-spin h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M6.34315 6.34315C5.22433 7.46197 4.4624 8.88743 4.15372 10.4393C3.84504 11.9911 4.00346 13.5997 4.60896 15.0615C5.21447 16.5233 6.23985 17.7727 7.55544 18.6518C8.87103 19.5308 10.4178 20 12 20C13.5823 20 15.129 19.5308 16.4446 18.6518C17.7602 17.7727 18.7855 16.5233 19.391 15.0615C19.9965 13.5997 20.155 11.9911 19.8463 10.4393C19.5376 8.88743 18.7757 7.46197 17.6569 6.34315" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path> <path d="M12 8L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path> </svg>
                        )}
                        <Tooltip id={`activate-tt-${model.id}`} place="top" effect="solid" />
                       </button>
                     )}
                     {/* Activate/Deactivate Buttons (Only for embedding models) - Simplified */}
                     {showActivateEmbeddingButton && (
                       <button
                         onClick={() => onSetPreferredEmbeddingModel(model.id)} 
                         disabled={isActivatingLLM}
                         className={`text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-600 ${isActivatingLLM ? 'opacity-50 cursor-not-allowed' : ''}`}
                         data-tooltip-id={`activate-embed-tt-${model.id}`}
                         data-tooltip-content="Activate"
                       >
                         {/* Use Power Icon for Activate Embedding */}
                         <svg className="h-4 w-4 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M6.34315 6.34315C5.22433 7.46197 4.4624 8.88743 4.15372 10.4393C3.84504 11.9911 4.00346 13.5997 4.60896 15.0615C5.21447 16.5233 6.23985 17.7727 7.55544 18.6518C8.87103 19.5308 10.4178 20 12 20C13.5823 20 15.129 19.5308 16.4446 18.6518C17.7602 17.7727 18.7855 16.5233 19.391 15.0615C19.9965 13.5997 20.155 11.9911 19.8463 10.4393C19.5376 8.88743 18.7757 7.46197 17.6569 6.34315" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path> <path d="M12 8L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path> </svg>
                         <Tooltip id={`activate-embed-tt-${model.id}`} place="top" effect="solid" />
                       </button>
                     )}
                     {/* Deactivate embedding */}
                     {showDeactivateEmbeddingButton && (
                       <button
                         onClick={() => onSetPreferredEmbeddingModel(null)} 
                         disabled={isActivatingLLM}
                         className={`text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 ${isActivatingLLM ? 'opacity-50 cursor-not-allowed' : ''}`}
                         data-tooltip-id={`deactivate-embed-tt-${model.id}`}
                         data-tooltip-content="Deactivate"
                       >
                         {/* Use Stop Icon for Deactivate Embedding */}
                         <svg className="h-4 w-4 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.97 22C17.4928 22 21.97 17.5228 21.97 12C21.97 6.47715 17.4928 2 11.97 2C6.44712 2 1.96997 6.47715 1.96997 12C1.96997 17.5228 6.44712 22 11.97 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path><path d="M10.73 16.23H13.27C15.39 16.23 16.23 15.38 16.23 13.27V10.73C16.23 8.61002 15.38 7.77002 13.27 7.77002H10.73C8.61002 7.77002 7.77002 8.62002 7.77002 10.73V13.27C7.77002 15.38 8.62002 16.23 10.73 16.23Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                         <Tooltip id={`unset-embed-tt-${model.id}`} place="top" effect="solid" />
                       </button>
                     )}
                     {/* Delete button logic: Disable if LLM active OR is preferred embedding */}
                     {!isExternal && (
                       (disableDelete) ? ( 
                         <span data-tooltip-id={`delete-tt-${model.id}`} data-tooltip-content={isPreferredEmbedding ? "Deactivate model before deleting" : ((!isEmbedding && isConfiguredActive) ? "Deactivate model before deleting" : (isActivatingLLM ? "Cannot delete while processing" : "Delete Model"))} className="inline-block">
                           <button disabled className="text-gray-500 opacity-50 cursor-not-allowed dark:text-gray-300">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                           </button>
                         </span>
                       ) : (
                         <button onClick={() => onDeleteModel(model.id, model.name)} data-tooltip-id={`delete-tt-${model.id}`} data-tooltip-content="Delete Model" className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                       )
                     )}
                     <Tooltip id={`delete-tt-${model.id}`} place="top" effect="solid" className="z-[9999]" />
                 </td>
              </tr>
            );
          })
        )}
        </tbody>
      </table>
      
      {/* Progress Panels for List Activations */}
      {Object.entries(listActivationProgress).map(([modelId, progressInfo]) => (
        <div key={`progress-${modelId}`} className="mt-4">
          <ModelProgressPanel 
            modelId={parseInt(modelId)}
            token={progressInfo.activationId}
            onClose={() => {
              // Call the parent's close handler to remove this progress panel
              if (onCloseListProgress) {
                onCloseListProgress(modelId);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
};

ModelsList.propTypes = {
  models: PropTypes.array.isRequired,
  providers: PropTypes.array.isRequired,
  loading: PropTypes.bool.isRequired,
  onEditModel: PropTypes.func.isRequired,
  onDeleteModel: PropTypes.func.isRequired,
  onViewStats: PropTypes.func.isRequired,
  refreshData: PropTypes.func.isRequired,
  activatingModelId: PropTypes.number,
  activationErrors: PropTypes.object,
  preferredEmbeddingModelId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSetPreferredEmbeddingModel: PropTypes.func.isRequired,
  onEditEmbeddingModel: PropTypes.func.isRequired,
};

export default ModelsList;
