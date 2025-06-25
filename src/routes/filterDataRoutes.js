const express = require('express');
const router = express.Router();
const filterDataController = require('../controllers/filterDataController');
// No specific auth middleware here, as rules might be needed for public display
// and permissions are fetched separately by authenticated users.
// However, consider if any form of rate limiting or basic protection is needed if abused.

/**
 * @swagger
 * /api/filters/rules-and-groups:
 *   get:
 *     summary: Fetches all filter groups and active filter rules.
 *     tags: [Filters]
 *     description: Provides data for frontend client-side filtering. Regex patterns are pre-processed for frontend `new RegExp()`.
 *     responses:
 *       200:
 *         description: A list of filter groups and active rules.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       is_enabled:
 *                         type: integer
 *                       exemption_permission_key:
 *                         type: string
 *                         nullable: true
 *                 rules:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       filter_group_id:
 *                         type: integer
 *                       rule_type:
 *                         type: string 
 *                       pattern:
 *                         type: string
 *                       replacement:
 *                         type: string
 *                         nullable: true
 *                       is_active:
 *                         type: integer
 *       500:
 *         description: Internal server error.
 */
router.get('/rules-and-groups', filterDataController.getRulesAndGroups);

module.exports = router;
