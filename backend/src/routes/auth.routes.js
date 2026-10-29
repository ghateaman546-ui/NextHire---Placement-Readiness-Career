const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth');
const c = require('../controllers/auth.controller');

router.post('/signup', authLimiter, c.signup);
router.post('/login', authLimiter, c.login);
router.post('/verify-email', c.verifyEmail);
router.post('/resend-verification', authLimiter, c.resendVerification);
router.post('/forgot-password', authLimiter, c.forgotPassword);
router.post('/reset-password', authLimiter, c.resetPassword);
router.get('/me', protect, c.getMe);
router.post('/logout', protect, c.logout);

module.exports = router;
