const express = require('express');
const router = express.Router();
const adminFilteringController = require('../controllers/admin/adminFilteringController');
const { protect, admin } = require('../middleware/authMiddleware'); 

// Middleware for all filtering routes: Ensure user is authenticated and admin
router.use(protect, admin); 
router.route('/groups')
  .get(adminFilteringController.getFilterGroups)
  .post(adminFilteringController.createFilterGroup);

router.route('/groups/:id')
  .put(adminFilteringController.updateFilterGroup)
  .delete(adminFilteringController.deleteFilterGroup);

router.route('/groups/:groupId/rules')
  .get(adminFilteringController.getFilterRules)
  .post(adminFilteringController.createFilterRule);

router.route('/rules/:ruleId') 
  .put(adminFilteringController.updateFilterRule)
  .delete(adminFilteringController.deleteFilterRule);

// Route to specifically update the active status of a rule
router.route('/rules/:ruleId/status')
  .patch(adminFilteringController.updateRuleStatus);

module.exports = router;
