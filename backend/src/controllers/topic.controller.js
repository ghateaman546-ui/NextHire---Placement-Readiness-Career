const { Topic, Question } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/** GET /api/topics — public/student: only published topics */
exports.listTopics = asyncHandler(async (req, res) => {
  const topics = await Topic.find({ isActive: true }).sort({ order: 1 });
  res.json({ success: true, data: topics });
});

/** GET /api/topics/admin/all — admin: every topic, including unpublished, with related question counts */
exports.listTopicsAdmin = asyncHandler(async (req, res) => {
  const topics = await Topic.find().sort({ order: 1 }).lean();
  const counts = await Question.aggregate([{ $group: { _id: '$topic', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ success: true, data: topics.map((t) => ({ ...t, relatedQuestionCount: countMap.get(String(t._id)) || 0 })) });
});

exports.createTopic = asyncHandler(async (req, res) => {
  const slug = req.body.name.toLowerCase().trim().replace(/\s+/g, '-');
  const topic = await Topic.create({ ...req.body, slug });
  res.status(201).json({ success: true, data: topic });
});

exports.updateTopic = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.name) payload.slug = payload.name.toLowerCase().trim().replace(/\s+/g, '-');
  const topic = await Topic.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!topic) return res.status(404).json({ success: false, message: 'Topic not found.' });
  res.json({ success: true, data: topic });
});

exports.deleteTopic = asyncHandler(async (req, res) => {
  const topic = await Topic.findByIdAndDelete(req.params.id);
  if (!topic) return res.status(404).json({ success: false, message: 'Topic not found.' });
  res.json({ success: true, message: 'Topic deleted.' });
});
