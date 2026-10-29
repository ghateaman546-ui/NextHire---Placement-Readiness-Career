const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadImage } = require('../config/multer');
const c = require('../controllers/user.controller');

router.get('/profile', protect, c.getProfile);
router.put('/profile', protect, c.updateProfile);
router.post('/profile/photo', protect, uploadImage.single('photo'), c.uploadPhoto);
router.get('/dashboard', protect, c.getDashboardSummary);

module.exports = router;
