const express = require('express');
const router = express.Router();
const modelController = require('../controllers/modelController');
const { protect, admin, checkModelAccess, standardAuth } = require('../middleware/authMiddleware');

// Get all models - public for authenticated users
router.get('/', protect, modelController.getModels);
router.get('/active', protect, modelController.getActiveModelsForUser);
router.get('/:id', standardAuth, modelController.getModel);
router.post('/', protect, admin, modelController.addModel);
router.put('/:id', protect, admin, modelController.updateModel);
router.delete('/:id', protect, admin, modelController.deleteModel);
router.get('/:id/contexts', standardAuth, modelController.getModelContexts);
router.post('/:id/contexts', protect, admin, modelController.addModelContext);

module.exports = router;
