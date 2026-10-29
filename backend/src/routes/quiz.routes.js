const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/quiz.controller');

// Admin management routes (distinct two-segment paths so they never collide with '/:id').
router.get('/manage/list', protect, requireRole('admin'), c.listQuizzesAdmin);
router.get('/manage/:id/stats', protect, requireRole('admin'), c.getQuizStatsAdmin);
router.get('/manage/:id', protect, requireRole('admin'), c.getQuizAdmin);

router.get('/', protect, c.listQuizzes);
router.get('/:id', protect, c.getQuizForAttempt);
router.post('/', protect, requireRole('admin'), c.createQuiz);
router.put('/:id', protect, requireRole('admin'), c.updateQuiz);
router.delete('/:id', protect, requireRole('admin'), c.deleteQuiz);
router.post('/:id/submit', protect, c.submitQuiz);
router.get('/:id/leaderboard', protect, c.getQuizLeaderboard);

module.exports = router;
