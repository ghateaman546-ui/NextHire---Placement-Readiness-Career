const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/interviewQuestion.controller');

router.get('/', protect, c.list);
router.get('/admin/all', protect, requireRole('admin'), c.listAll);
router.get('/:id', protect, c.getOne);
router.post('/', protect, requireRole('admin'), c.create);
router.put('/:id', protect, requireRole('admin'), c.update);
router.delete('/:id', protect, requireRole('admin'), c.remove);

module.exports = router;
