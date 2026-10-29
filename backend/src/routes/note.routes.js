const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/note.controller');

router.get('/', protect, c.listNotes);
router.post('/', protect, c.createNote);
router.put('/:id', protect, c.updateNote);
router.patch('/:id/pin', protect, c.togglePin);
router.patch('/:id/bookmark', protect, c.toggleBookmark);
router.delete('/:id', protect, c.deleteNote);

module.exports = router;
