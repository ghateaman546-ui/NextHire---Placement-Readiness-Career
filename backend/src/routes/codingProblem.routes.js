const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/codingProblem.controller');

// Specific admin paths before the generic '/:slug' route.
router.get('/admin/all', protect, requireRole('admin'), c.listCodingProblemsAdmin);
router.get('/admin/:id', protect, requireRole('admin'), c.getCodingProblemAdmin);
router.post('/admin', protect, requireRole('admin'), c.createCodingProblem);
router.put('/admin/:id', protect, requireRole('admin'), c.updateCodingProblem);
router.delete('/admin/:id', protect, requireRole('admin'), c.deleteCodingProblem);

router.get('/', protect, c.listCodingProblems);
router.get('/:slug', protect, c.getCodingProblem);

module.exports = router;
