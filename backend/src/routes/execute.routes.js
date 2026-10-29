const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { executeLimiter } = require('../middleware/rateLimiter');
const c = require('../controllers/execute.controller');

router.post('/', protect, executeLimiter, c.executeCode);

module.exports = router;
