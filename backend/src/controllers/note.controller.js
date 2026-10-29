const { Note } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

exports.listNotes = asyncHandler(async (req, res) => {
  const { pinned, bookmarked, search } = req.query;
  const filter = { userId: req.user._id };
  if (pinned !== undefined) filter.isPinned = pinned === 'true';
  if (bookmarked !== undefined) filter.isBookmarked = bookmarked === 'true';
  if (search) filter.title = { $regex: search, $options: 'i' };

  const notes = await Note.find(filter).sort({ isPinned: -1, updatedAt: -1 });
  res.json({ success: true, data: notes });
});

exports.createNote = asyncHandler(async (req, res) => {
  const note = await Note.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: note });
});

exports.updateNote = asyncHandler(async (req, res) => {
  const note = await Note.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true, runValidators: true });
  if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });
  res.json({ success: true, data: note });
});

exports.togglePin = asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
  if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });
  note.isPinned = !note.isPinned;
  await note.save();
  res.json({ success: true, data: note });
});

exports.toggleBookmark = asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, userId: req.user._id });
  if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });
  note.isBookmarked = !note.isBookmarked;
  await note.save();
  res.json({ success: true, data: note });
});

exports.deleteNote = asyncHandler(async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!note) return res.status(404).json({ success: false, message: 'Note not found.' });
  res.json({ success: true, message: 'Note deleted.' });
});
