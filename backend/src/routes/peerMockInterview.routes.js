const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/peerMockInterview.controller');

/** Peer mock interview scheduler + evaluation. Base path: /api/peer-mock-interviews */
router.post('/', protect, c.scheduleSlot);
router.get('/available', protect, c.listAvailableSlots);
router.get('/my', protect, c.listMySessions);
router.post('/:id/join', protect, c.joinSlot);
router.get('/:id/meeting', protect, c.getMeetingDetails);
router.post('/:id/complete', protect, c.completeSession);
router.post('/:id/cancel', protect, c.cancelSlot);
router.post('/:id/feedback', protect, c.submitPeerFeedback);

module.exports = router;
