const { default: axios } = require('axios');
const path = require('path');
const { db } = require('../../models/db');

/**
 * Provider: Hugging Face
 * Provides interface for discovering and managing Hugging Face models
 */
class HuggingFaceProvider {
  constructor() {
    this.name = 'Hugging Face';
    this.id = 'huggingface';
    this.apiBase = 'https://huggingface.co/api';
    this.defaultModels = [
      { id: 'microsoft/phi-2', name: 'Phi-2 (Torch)' },
      { id: 'mistralai/Mistral-7B-v0.1', name: 'Mistral 7B (Torch)' },
      { id: 'meta-llama/Llama-2-7b-hf', name: 'Llama 2 7B (Torch)' }
    ];
  }

  /**
   * Discover models from Hugging Face Hub
   * @param {Object} options - Discovery options
   * @returns {Promise<Array>} - Array of discovered models
   */
  async discoverModels(options = {}) {
    try {
      // Just return default models as discovery
      // This ensures something works even if API isn't available
      const models = this.defaultModels.map(model => ({
        id: model.id,
        name: model.name,
        description: `Hugging Face model: ${model.id}`,
        context_window: 4096 // Default context window
      }));

      return models;
    } catch (error) {
      console.error('Error discovering Hugging Face models:', error);
      return [];
    }
  }

  /**
   * Get default models for this provider
   * @returns {Array} - Default models
   */
  getDefaultModels() {
    return this.defaultModels;
  }
}

module.exports = new HuggingFaceProvider();
