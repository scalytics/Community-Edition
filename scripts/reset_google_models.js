/**
 * Script to reset Google models in the database
 * This ensures all default models are added
 */

const { db } = require('../src/models/db');
const providerManager = require('../src/services/providers');
const modelDiscoveryService = require('../src/services/modelDiscoveryService');

async function resetGoogleModels() {
  try {
    console.log('Starting Google models reset...');
    
    // Get the Google provider
    const googleProvider = providerManager.getProvider('Google');
    if (!googleProvider) {
      console.error('Google provider not found!');
      process.exit(1);
    }
    
    // Get provider ID from the database
    const providerInfo = await db.getAsync('SELECT id FROM api_providers WHERE name = ?', ['Google']);
    if (!providerInfo) {
      console.error('Google provider not found in database!');
      process.exit(1);
    }
    
    const providerId = providerInfo.id;
    console.log(`Found Google provider with ID ${providerId}`);
    
    // Get default models
    const defaultModels = googleProvider.getDefaultModels();
    console.log(`Found ${defaultModels.length} default Google models`);
    
    // Deactivate all existing Google models
    await db.runAsync('UPDATE models SET is_active = 0 WHERE external_provider_id = ?', [providerId]);
    console.log('Deactivated all existing Google models');
    
    // Add or activate each default model
    let added = 0;
    let updated = 0;
    
    for (const model of defaultModels) {
      // Check if model already exists
      const existingModel = await db.getAsync(
        'SELECT id FROM models WHERE external_provider_id = ? AND external_model_id = ?',
        [providerId, model.id]
      );
      
      if (existingModel) {
        // Update existing model
        await db.runAsync(
          `UPDATE models 
           SET is_active = 1, name = ?, description = ?, context_window = ? 
           WHERE id = ?`,
          [model.name, model.description, model.context_window, existingModel.id]
        );
        updated++;
      } else {
        // Add new model
        await db.runAsync(
          `INSERT INTO models (name, description, model_path, context_window, 
                        is_active, external_provider_id, external_model_id)
           VALUES (?, ?, '', ?, 1, ?, ?)`,
          [model.name, model.description, model.context_window, providerId, model.id]
        );
        added++;
      }
    }
    
    console.log(`Reset complete! Added ${added} new models and updated ${updated} existing models.`);
    
    // List all active Google models
    const activeModels = await db.allAsync(
      'SELECT name, external_model_id FROM models WHERE external_provider_id = ? AND is_active = 1',
      [providerId]
    );
    
    console.log('\nActive Google models:');
    activeModels.forEach((model, i) => {
      console.log(`${i+1}. ${model.name} (${model.external_model_id})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the reset function
resetGoogleModels();
