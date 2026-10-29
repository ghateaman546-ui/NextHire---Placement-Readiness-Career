const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/leaderboard.controller');

router.get('/', protect, c.getLeaderboard);
router.get('/me', protect, c.getMyRank);

module.exports = router;
