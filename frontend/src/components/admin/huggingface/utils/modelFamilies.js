/**
 * Supported model families configuration
 * Only these model families will be allowed in search and download
 */

export const SUPPORTED_FAMILIES = [
  { id: 'llama', name: 'Llama', description: 'Meta\'s Large Language Model' },
  { id: 'mistral', name: 'Mistral / Mixtral', description: 'Mistral AI\'s language models (includes Mixtral)' },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek language models' },
  { id: 'phi', name: 'Phi', description: 'Microsoft\'s Phi models' },
  { id: 'gemma', name: 'Gemma', description: 'Google\'s lightweight LLMs' },
  { id: 'teuken', name: 'Teuken', description: 'Teuken AI Models' },
  { id: 'embedding', name: 'Embedding Models', description: 'Models for text/sentence embeddings (e.g., BGE, MiniLM)' } 
];

/**
 * Check if a model is from a supported family based on its ID
 * @param {string} modelId - The model ID to check
 * @returns {boolean} - True if the model is supported (Note: This might need adjustment if embedding models don't follow family naming conventions)
 */
export function isModelSupported(modelId) {
  if (!modelId) return false;
  const lowerModelId = modelId.toLowerCase();
  return SUPPORTED_FAMILIES.some(family => lowerModelId.includes(family.id)) || lowerModelId.includes('bge-') || lowerModelId.includes('minilm');
}

/**
 * Get the family information for a model
 * @param {string} modelId - The model ID to check
 * @returns {Object|null} - The family object if found, null otherwise (Returns 'embedding' family if matched)
 */
export function getModelFamily(modelId) {
  if (!modelId) return null;
  const lowerModelId = modelId.toLowerCase();
  const familyMatch = SUPPORTED_FAMILIES.find(family => family.id !== 'embedding' && lowerModelId.includes(family.id));
  if (familyMatch) return familyMatch;
  if (lowerModelId.includes('bge-') || lowerModelId.includes('minilm') || lowerModelId.includes('sentence-transformer')) {
     return SUPPORTED_FAMILIES.find(family => family.id === 'embedding') || null;
  }
  return null;
}
