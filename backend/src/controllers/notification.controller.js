const { Notification } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

exports.listMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({
    $or: [{ userId: req.user._id }, { userId: null }],
  }).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, data: notifications });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
  res.json({ success: true, data: notification });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
  res.json({ success: true, message: 'All notifications marked as read.' });
});
