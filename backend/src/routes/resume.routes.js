const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/resume.controller');

router.get('/', protect, c.listMyResumes);
router.post('/builder', protect, c.saveBuilderResume);
router.put('/builder/:id', protect, c.updateBuilderResume);
router.delete('/:id', protect, c.deleteResume);

module.exports = router;
