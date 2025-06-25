import React, { useState, useEffect } from 'react';
import apiService from '../../../services/apiService';
import airGappedService from '../../../services/admin/airGappedService';
import useHardwareInfo from './hooks/useHardwareInfo';
import useModelSearch from './hooks/useModelSearch';
import usePythonDownloader from './hooks/usePythonDownloader';
import HardwareInfoDisplay from './components/HardwareInfoDisplay';
import ModelSearchSection from './components/ModelSearchSection';
import ModelDetailView from './components/ModelDetailView';
import PrimaryModelBanner from './components/PrimaryModelBanner';
import HuggingFaceLogin from './HuggingFaceLogin';
import ModelDownloadProgress from '../../ModelDownloadProgress';
import socketService from '../../../services/socketService'; 

const HuggingFaceModelManager = () => {
  const [selectedModel, setSelectedModel] = useState(null);
  const [installedModels, setInstalledModels] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAirGapped, setIsAirGapped] = useState(false);
  
  const { hardwareInfo, loading: hardwareLoading, recommendations } = useHardwareInfo();
  const { searchResults, searching, error: searchError, selectedFamily, sortBy, sortOrder, handleFamilyChange, handleSortByChange, handleSortOrderChange } = useModelSearch();
  
  const [showGateModal, setShowGateModal] = useState(false);
  const [gatedModelId, setGatedModelId] = useState(null);

  const { downloads, loading: downloadLoading, error: downloadError, downloadAndInstallModel } = usePythonDownloader(() => {
    setSelectedModel(null);
    fetchInstalledModels();
  }, (errorDetails) => {
    setGatedModelId(errorDetails.modelId);
    setShowGateModal(true);
  });

  useEffect(() => {
    fetchInstalledModels();
    const unsubscribe = socketService.on('model:added', fetchInstalledModels);
    const checkAirGapped = async () => setIsAirGapped(await airGappedService.isAirGappedEnabled());
    checkAirGapped();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (downloadError) setError(downloadError);
  }, [downloadError]);
  
  useEffect(() => {
    setLoading(downloadLoading);
  }, [downloadLoading]);

  const fetchInstalledModels = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/admin/available');
      
      // Handle both response structures: {data: [...]} or just [...]
      const modelsArray = response.data?.data || response.data;
      
      if (Array.isArray(modelsArray)) {
        const localModels = modelsArray.filter(model => !model.external_provider_id);
        setInstalledModels(localModels);
        setError(''); // Clear any previous errors
      } else {
        console.warn('[DEBUG] Unexpected response structure:', response.data);
        setInstalledModels([]);
      }
    } catch (err) {
      console.error('[DEBUG] Failed to fetch installed models:', err);
      setError(`Failed to fetch installed models: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = (model) => {
    setSelectedModel(model);
    setTimeout(() => document.getElementById('model-details-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleDownload = (modelId, config) => {
    setError('');
    downloadAndInstallModel(modelId, config);
  };

  return (
    <div className="space-y-6">
      {showGateModal && gatedModelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              License agreement required
            </h2>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              This model is gated. You must accept the license on Hugging Face before
              you can download the weights.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowGateModal(false);
                  setGatedModelId(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
              >
                Close
              </button>
              <a
                href={`https://huggingface.co/${gatedModelId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white"
              >
                Accept license
              </a>
            </div>
          </div>
        </div>
      )}
      {error && <div className="text-red-500 p-4 bg-red-100 rounded">{error}</div>}
      
      <PrimaryModelBanner />
      
      <div className="bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden p-6">
        <div className="px-4 py-5 sm:px-6 -mx-6 -mt-6 mb-6 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Search Hugging Face Models</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Search, download and install models directly from Hugging Face Hub.</p>
        </div>

        <HardwareInfoDisplay hardwareInfo={hardwareInfo} loading={hardwareLoading} recommendations={recommendations} />
        <HuggingFaceLogin />
        <ModelSearchSection
          results={searchResults}
          searching={searching}
          error={searchError}
          selectedFamily={selectedFamily}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onFamilyChange={handleFamilyChange}
          onSortByChange={handleSortByChange}
          onSortOrderChange={handleSortOrderChange}
          onSelectModel={handleSelectModel}
          selectedModelId={selectedModel?.modelId}
          isAirGapped={isAirGapped}
        />

        {Object.keys(downloads).length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Active Downloads</h3>
            {Object.entries(downloads).map(([id, download]) => (
              <ModelDownloadProgress key={id} downloadId={id} initialData={download} />
            ))}
          </div>
        )}

        {selectedModel && (
          <ModelDetailView
            model={selectedModel}
            onDownload={handleDownload}
            isLoading={downloadLoading}
            isAirGapped={isAirGapped}
          />
        )}

        <div className="mt-8 bg-white dark:bg-dark-primary shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-dark-border">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Installed Local Models</h3>
          </div>
          {loading && installedModels.length === 0 ? (
            <div className="p-6">Loading...</div>
          ) : installedModels.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">No local models installed.</div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-secondary">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Model Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
                  {installedModels.map((model) => (
                    <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">{model.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{model.model_type || 'Local'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{model.file_size_formatted || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Installed</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HuggingFaceModelManager;
