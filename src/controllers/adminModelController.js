/**
 * Admin Model Controller - Main entry point
 * 
 * This file re-exports functionality from modular controllers
 * to maintain backward compatibility with existing routes.
 */

// Import from modular controllers
const uploadController = require('./model/uploadController');
const discoveryController = require('./model/discoveryController');
const manageController = require('./model/manageController'); 
const modelController = require('./modelController'); 
const primaryModelController = require('./model/primaryModelController');

module.exports = {
  uploadModel: uploadController.uploadModel,
  discoverProviderModels: discoveryController.discoverProviderModels,
  getLocalModels: manageController.getLocalModels,
  deleteModel: manageController.deleteModel,
  activateModel: manageController.activateModel, 
  deactivateModel: manageController.deactivateModel, 
  getWorkerPoolStatus: manageController.getWorkerPoolStatus,
  updateModelConfig: modelController.updateModel, 
  getUserModelAccess: manageController.getUserModelAccess,
  resetModels: manageController.resetModels,
  getAvailableModels: manageController.getAvailableModels,
  setPrimaryModel: primaryModelController.setPrimaryModelById,
  getPrimaryModelStatus: primaryModelController.getPrimaryModelStatus,
  unsetPrimaryModel: primaryModelController.unsetPrimaryModel,
  updateModelStatus: modelController.updateModelStatus // Export the new status update function
};
