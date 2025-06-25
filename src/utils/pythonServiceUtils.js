const { exec } = require('child_process');
const path = require('path');
const fs = require('fs'); // Keep original fs
const fsPromises = require('fs').promises; // Use fs.promises for async operations

const PYTHON_SERVICE_CONFIG_PATH = path.join(__dirname, '..', 'python_services', 'live_search_service', 'config.py');
const VECTOR_STORE_PATH = path.join(__dirname, '..', '..', 'data', 'mcp_tools', 'deep_search_vector_store');

/**
 * Touches the Python service's config file to trigger a reload by uvicorn.
 * This is used when Node.js makes changes (e.g., to DB) that the Python service
 * needs to pick up on its next startup.
 */
function triggerPythonServiceRestart() { // Made non-async, returns a Promise
  return new Promise(async (resolve, reject) => {
    try {
      // Check if the config file exists before trying to touch it
      // fs.promises was not defined, using fsPromises as defined at the top of the file
      await fsPromises.access(PYTHON_SERVICE_CONFIG_PATH, fs.constants.F_OK);

      const command = `touch "${PYTHON_SERVICE_CONFIG_PATH}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`[PythonServiceUtils] Error touching Python config file to trigger restart: ${error.message}`);
          reject(error); // Reject the promise on error
          return;
        }
        if (stderr) {
          // stderr doesn't necessarily mean an error, could be warnings.
          console.warn(`[PythonServiceUtils] Stderr while touching Python config file: ${stderr}`);
        }
        console.log(`[PythonServiceUtils] Successfully touched ${PYTHON_SERVICE_CONFIG_PATH} to signal Python service reload.`);
        resolve(); // Resolve the promise on success
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`[PythonServiceUtils] Python service config file not found at ${PYTHON_SERVICE_CONFIG_PATH}. Cannot trigger restart.`);
        reject(err); // Reject if file not found
      } else {
        console.error(`[PythonServiceUtils] Error accessing Python service config file: ${err.message}`);
        reject(err); // Reject on other access errors
      }
    }
  });
}

/**
 * Deletes the LanceDB vector store directory.
 */
async function deleteVectorStore() {
  try {
    await fsPromises.access(VECTOR_STORE_PATH, fs.constants.F_OK); // Check if directory exists
    console.log(`[PythonServiceUtils] Deleting vector store at ${VECTOR_STORE_PATH}...`);
    await fsPromises.rm(VECTOR_STORE_PATH, { recursive: true, force: true });
    console.log(`[PythonServiceUtils] Vector store deleted successfully.`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[PythonServiceUtils] Vector store directory not found at ${VECTOR_STORE_PATH}. No deletion needed.`);
    } else {
      console.error(`[PythonServiceUtils] Error deleting vector store at ${VECTOR_STORE_PATH}:`, err);
      // We might still want to attempt to restart the Python service even if DB deletion fails.
      // Depending on the error, the service might recreate it or fail gracefully.
    }
  }
}

/**
 * Handles the sequence of actions required when the embedding model changes:
 * 1. Deletes the existing vector store.
 * 2. Triggers a restart of the Python service.
 */
async function handleEmbeddingModelChange() {
  console.log('[PythonServiceUtils] Embedding model change detected. Initiating vector store deletion and Python service restart.');
  await deleteVectorStore();
  // It's generally better to ensure the restart happens *after* the deletion attempt.
  // If deleteVectorStore throws an unrecoverable error, we might reconsider, but for now, proceed.
  try {
    await triggerPythonServiceRestart();
  } catch (restartError) {
    console.error('[PythonServiceUtils] Failed to trigger Python service restart after embedding model change:', restartError);
    // Decide if this error should be propagated or just logged.
    // For now, logging it. The main operation (DB update) in controller would have succeeded.
  }
}

module.exports = {
  triggerPythonServiceRestart,
  handleEmbeddingModelChange, // Export the new handler
  PYTHON_SERVICE_CONFIG_PATH,
  VECTOR_STORE_PATH
};
