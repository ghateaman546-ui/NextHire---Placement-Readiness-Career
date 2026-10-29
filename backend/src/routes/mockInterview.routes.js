const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { uploadImage } = require('../config/multer');
const c = require('../controllers/mockInterview.controller');

router.post('/', protect, c.startSession);
router.get('/', protect, c.listMySessions);
router.get('/active', protect, c.getActiveSession);
router.get('/:id', protect, c.getSession);
// Each submission triggers one AI evaluation, so this is the rate-limited route.
router.put('/:id/answers/:qId', protect, aiLimiter, uploadImage.single('audio'), c.submitAnswer);
router.post('/:id/complete', protect, c.completeSession);

module.exports = router;
