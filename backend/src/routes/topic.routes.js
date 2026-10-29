const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/topic.controller');

router.get('/', c.listTopics);
router.get('/admin/all', protect, requireRole('admin'), c.listTopicsAdmin);
router.post('/', protect, requireRole('admin'), c.createTopic);
router.put('/:id', protect, requireRole('admin'), c.updateTopic);
router.delete('/:id', protect, requireRole('admin'), c.deleteTopic);

module.exports = router;
