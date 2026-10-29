const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/feedback.controller');

// Specific path before '/:id'-style admin routes to avoid ambiguity.
router.get('/admin', protect, requireRole('admin'), c.listFeedbackAdmin);

router.post('/', protect, c.createFeedback);
router.get('/', protect, c.listMyFeedback);
router.patch('/:id/status', protect, requireRole('admin'), c.updateFeedbackStatus);
router.delete('/:id', protect, requireRole('admin'), c.deleteFeedback);

module.exports = router;
