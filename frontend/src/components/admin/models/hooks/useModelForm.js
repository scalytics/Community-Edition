import { useState, useCallback } from 'react';

const INITIAL_FORM_DATA = {
  id: null,
  name: '',
  description: '',
  model_path: '',
  context_window: 4096, 
  is_active: false, 
  external_provider_id: '',
  external_model_id: '',
  gpu_assignment: '', 
  enable_scala_prompt: false,
  n_gpu_layers: '',
  n_batch: '',
  n_ctx: '',
  preferred_cache_type: '',
};

/**
 * Custom hook to manage the state and logic of the Model Edit Form.
 */
const useModelForm = (providers = []) => { 
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [isExternalModel, setIsExternalModel] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null); 

  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);

  const handleModelTypeChange = useCallback((isExternal) => {
    setIsExternalModel(isExternal);
    setFormData(prev => ({
      ...INITIAL_FORM_DATA, 
      id: prev.id, 
      name: prev.name, 
      description: prev.description, 
      enable_scala_prompt: prev.enable_scala_prompt, 
      external_provider_id: isExternal ? (providers[0]?.id || '') : '',
      external_model_id: isExternal ? '' : '',
      model_path: isExternal ? '' : prev.model_path, 
    }));
  }, [providers]); 

  const loadModelIntoForm = useCallback((model) => {
    if (!model) {
       console.warn('[useModelForm] loadModelIntoForm called with null or undefined model. Skipping update.');
       return;
    }

    const isExternal = !!model.external_provider_id;
    setSelectedModel(model); 
    setIsExternalModel(isExternal);

    let nGpuLayers = '';
    let nBatch = '';
    let nCtx = '';

    if (!isExternal && model.config && typeof model.config === 'string') {
      try {
        const parsedConfig = JSON.parse(model.config);
        nGpuLayers = parsedConfig.n_gpu_layers ?? '';
        nBatch = parsedConfig.n_batch ?? '';
        nCtx = parsedConfig.n_ctx ?? '';
      } catch (e) {
        console.error("Error parsing model config JSON:", e);
      }
    } else if (!isExternal) {
      nGpuLayers = model.n_gpu_layers ?? '';
      nBatch = model.n_batch ?? '';
      nCtx = model.n_ctx ?? '';
    }

    setFormData({ 
      id: model.id,
      name: model.name || '',
      description: model.description || '',
      model_path: model.model_path || '',
      context_window: model.context_window || 4096,
      is_active: model.is_active === true || model.is_active === 1,
      external_provider_id: model.external_provider_id || '',
      external_model_id: model.external_model_id || '',
      gpu_assignment: model.gpu_assignment || '', 
      n_gpu_layers: nGpuLayers,
      n_batch: nBatch,
      n_ctx: nCtx,
      preferred_cache_type: model.preferred_cache_type || '',
      enable_scala_prompt: model.enable_scala_prompt === true || model.enable_scala_prompt === 1,
      can_generate_images: model.can_generate_images === true || model.can_generate_images === 1,
      // Add the missing fields that ModelEditForm needs
      config: model.config || '',
      tensor_parallel_size: model.tensor_parallel_size || null,
      model_precision: model.model_precision || '',
      auto_detected_context: model.auto_detected_context || null
    });
  }, []); 

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setIsExternalModel(false);
    setSelectedModel(null);
  }, []);

  return {
    formData,
    setFormData, 
    isExternalModel,
    selectedModel, 
    handleInputChange,
    handleModelTypeChange,
    loadModelIntoForm,
    resetForm,
  };
};

export default useModelForm;
