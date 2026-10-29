const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/notification.controller');

router.get('/', protect, c.listMyNotifications);
router.patch('/:id/read', protect, c.markAsRead);
router.patch('/read-all', protect, c.markAllAsRead);

module.exports = router;
