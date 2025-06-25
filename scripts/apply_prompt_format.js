/**
 * Utility to apply the correct prompt format for different model types
 *
 * This ensures each model gets the optimal prompt format for best results
 */
const fs = require('fs');
const path = require('path');

/**
 * Apply the correct prompt format for a given model
 *
 * @param {string} modelPath - Path to the model file
 * @param {string} prompt - Original user prompt
 * @returns {string} - Formatted prompt following model-specific format
 */
function applyPromptFormat(modelPath, prompt) {
  // Default format (just use the prompt as-is)
  let format = '{prompt}';

  try {
    // Get model directory
    const modelDir = path.dirname(modelPath);
    const configPath = path.join(modelDir, 'model_config.json');

    // Check if a config file exists
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Use custom format if specified in config
      if (config.custom_prompt_format) {
        format = config.custom_prompt_format;
        // console.log(`Using custom prompt format from ${configPath}`);
      }
    } else {
      // Use default formats based on model name if no config
      const modelName = path.basename(modelPath).toLowerCase();

      if (modelName.includes('phi')) {
        format = '[INST] {prompt} [/INST]';
        // console.log('Using default Phi-2 format');
      } else if (modelName.includes('mistral')) {
        format = '<s>[INST] {prompt} [/INST]';
        // console.log('Using default Mistral format');
      } else if (modelName.includes('deepseek')) {
        format = '<|user|>\n{prompt}<|assistant|>\n';
        // console.log('Using default DeepSeek format');
      } else if (modelName.includes('llama')) {
        format = '<s>[INST] {prompt} [/INST]';
        // console.log('Using default Llama format');
      }
    }
  } catch (error) {
    console.error('Error applying prompt format:', error);
    // Just use original prompt if there's an error
    return prompt;
  }

  // Apply the format, replacing {prompt} with the actual prompt
  return format.replace('{prompt}', prompt);
}

// Export for use in other modules
module.exports = { applyPromptFormat };

// Command line testing
if (require.main === module) {
  // If run directly from command line
  const modelPath = process.argv[2];
  const prompt = process.argv[3];

  if (!modelPath || !prompt) {
    console.error('Usage: node apply_prompt_format.js <model_path> "<prompt>"');
    process.exit(1);
  }

  const formattedPrompt = applyPromptFormat(modelPath, prompt);
  // console.log('\nFormatted prompt:');
  // console.log('----------------');
  // console.log(formattedPrompt);
  // console.log('----------------');
}
