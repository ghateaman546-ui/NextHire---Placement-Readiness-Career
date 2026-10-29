const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/admin.controller');

router.use(protect, requireRole('admin'));

router.get('/students', c.listStudents);
router.get('/students/:id/detail', c.getStudentDetail);
router.patch('/students/:id/block', c.blockStudent);
router.patch('/students/:id/unblock', c.unblockStudent);
router.delete('/students/:id', c.deleteStudent);

router.get('/analytics', c.getPlatformAnalytics);

router.post('/notifications', c.createNotification);
router.get('/notifications', c.listAllNotifications);
router.delete('/notifications/:id', c.deleteNotification);

module.exports = router;
