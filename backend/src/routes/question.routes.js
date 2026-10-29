const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/question.controller');

router.get('/', protect, c.listQuestions);
router.get('/:id', protect, c.getQuestion);
router.post('/', protect, requireRole('admin'), c.createQuestion);
router.put('/:id', protect, requireRole('admin'), c.updateQuestion);
router.delete('/:id', protect, requireRole('admin'), c.deleteQuestion);
router.patch('/:id/status', protect, c.updateStatus);
router.patch('/:id/bookmark', protect, c.toggleBookmark);
router.put('/:id/notes', protect, c.saveNotes);

module.exports = router;
