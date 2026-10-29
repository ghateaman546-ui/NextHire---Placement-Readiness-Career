const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/dashboard.controller');

router.get('/summary', protect, c.getSummary);
router.get('/progress/daily', protect, c.getDailyProgress);
router.get('/progress/weekly', protect, c.getWeeklyProgress);
router.get('/progress/monthly', protect, c.getMonthlyProgress);
router.get('/skills', protect, c.getSkillProgress);

module.exports = router;
