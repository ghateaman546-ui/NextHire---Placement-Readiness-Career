const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/ats.controller');
const { MAX_FILE_BYTES } = require('../services/ats.extractor');

// Resume uploads are held in memory only (never written to disk or executed) and parsed as data.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } }).single('resume');

// Turn multer's own errors into the project's normal { success:false, message } JSON responses.
function uploadResume(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum size is 5 MB.'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Upload the resume using the "resume" file field.'
            : 'The file could not be uploaded.';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, message });
    }
    return next(err);
  });
}

// Parsing is CPU-bound, so analyze gets its own tighter limit on top of the global API limiter.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many resume analyses. Please try again in a while.' },
});

// Students only (admins have no resumes of their own to analyze).
router.post('/analyze', protect, requireRole('student'), analyzeLimiter, uploadResume, c.analyze);
router.get('/history', protect, requireRole('student'), c.listHistory);
router.get('/:id', protect, requireRole('student'), c.getAnalysis);
router.delete('/:id', protect, requireRole('student'), c.deleteAnalysis);

module.exports = router;
