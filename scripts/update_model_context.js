/**
 * Script to update the context window size (n_ctx) for a specific model.
 */
const { db, initializeDatabase } = require('../src/models/db');

const MODEL_ID = 730;
const NEW_CONTEXT_SIZE = 32768;

async function updateModelContext() {
  try {
    await initializeDatabase();
    console.log(`Attempting to update model ID ${MODEL_ID} with new context size ${NEW_CONTEXT_SIZE}...`);

    const model = await db.getAsync('SELECT id, name, n_ctx FROM models WHERE id = ?', [MODEL_ID]);

    if (!model) {
      console.error(`Error: Model with ID ${MODEL_ID} not found.`);
      return;
    }

    console.log(`Found model: ${model.name} (ID: ${model.id}), Current n_ctx: ${model.n_ctx}`);

    if (model.n_ctx === NEW_CONTEXT_SIZE) {
      console.log('Model already has the correct context size. No update needed.');
      return;
    }

    await db.runAsync('UPDATE models SET n_ctx = ? WHERE id = ?', [NEW_CONTEXT_SIZE, MODEL_ID]);

    console.log(`Successfully updated model ID ${MODEL_ID} to n_ctx = ${NEW_CONTEXT_SIZE}.`);

    const updatedModel = await db.getAsync('SELECT id, name, n_ctx FROM models WHERE id = ?', [MODEL_ID]);
    console.log(`Verification: ${updatedModel.name} (ID: ${updatedModel.id}), New n_ctx: ${updatedModel.n_ctx}`);

  } catch (err) {
    console.error('Error updating model context size:', err);
  } finally {
    if (db) {
      db.close();
    }
  }
}

updateModelContext();
