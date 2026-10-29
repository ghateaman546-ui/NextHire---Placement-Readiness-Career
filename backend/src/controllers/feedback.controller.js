const { Feedback } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/** POST /api/feedback — any logged-in user submits feedback */
exports.createFeedback = asyncHandler(async (req, res) => {
  const { category, rating, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Feedback message is required.' });
  }
  const feedback = await Feedback.create({
    userId: req.user._id,
    name: req.user.name,
    email: req.user.email,
    category,
    rating,
    message: message.trim(),
  });
  res.status(201).json({ success: true, data: feedback });
});

/** GET /api/feedback — the current user's own submitted feedback */
exports.listMyFeedback = asyncHandler(async (req, res) => {
  const feedback = await Feedback.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: feedback });
});

/** GET /api/feedback/admin — admin: all feedback, newest first, optional status/category filters */
exports.listFeedbackAdmin = asyncHandler(async (req, res) => {
  const { status, category } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  const feedback = await Feedback.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: feedback });
});

/** PATCH /api/feedback/:id/status — admin updates review status */
exports.updateFeedbackStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['new', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const feedback = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
  res.json({ success: true, data: feedback });
});

/** DELETE /api/feedback/:id — admin only */
exports.deleteFeedback = asyncHandler(async (req, res) => {
  const feedback = await Feedback.findByIdAndDelete(req.params.id);
  if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
  res.json({ success: true, message: 'Feedback deleted.' });
});
