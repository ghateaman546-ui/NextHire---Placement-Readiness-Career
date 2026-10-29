const { Question } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { leetcodeLinkFor } = require('../utils/leetcodeLinks');

exports.listQuestions = asyncHandler(async (req, res) => {
  const { company, topic, difficulty, status, search, page = 1, limit = 20 } = req.query;
  // Admins manage the full bank, including unpublished (isActive:false) questions.
  const filter = req.user.role === 'admin' ? {} : { isActive: true };
  if (company) filter.companyTags = company;
  if (topic) filter.topic = topic;
  if (difficulty) filter.difficulty = difficulty;
  if (search) filter.title = { $regex: search, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [questions, total] = await Promise.all([
    Question.find(filter).populate('topic', 'name').populate('companyTags', 'name slug').skip(skip).limit(Number(limit)),
    Question.countDocuments(filter),
  ]);

  // Attach the current user's personal status/bookmark/notes, filtering the raw userStates array.
  const withMyState = questions.map((q) => {
    const obj = q.toObject();
    // Questions saved before LeetCode links existed get the mapped link (the DB value wins when set).
    obj.leetcodeLink = obj.leetcodeLink || leetcodeLinkFor(obj.title);
    const mine = obj.userStates.find((s) => String(s.userId) === String(req.user._id));
    obj.myState = mine || { status: 'not-started', isBookmarked: false, notes: '' };
    delete obj.userStates;
    if (status && obj.myState.status !== status) return null;
    return obj;
  }).filter(Boolean);

  res.json({ success: true, data: withMyState, pagination: { page: Number(page), limit: Number(limit), total } });
});

exports.getQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id).populate('topic', 'name').populate('companyTags', 'name slug');
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, data: question });
});

exports.createQuestion = asyncHandler(async (req, res) => {
  const question = await Question.create(req.body);
  res.status(201).json({ success: true, data: question });
});

exports.updateQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, data: question });
});

exports.deleteQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findByIdAndDelete(req.params.id);
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, message: 'Question deleted.' });
});

async function upsertUserState(req, res, patch) {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });

  const idx = question.userStates.findIndex((s) => String(s.userId) === String(req.user._id));
  if (idx === -1) {
    question.userStates.push({ userId: req.user._id, ...patch });
  } else {
    Object.assign(question.userStates[idx], patch);
  }
  await question.save();
  const mine = question.userStates.find((s) => String(s.userId) === String(req.user._id));
  res.json({ success: true, data: mine });
}

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const patch = { status };
  if (status === 'completed') patch.completedAt = new Date();
  await upsertUserState(req, res, patch);
});

exports.toggleBookmark = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  const mine = question.userStates.find((s) => String(s.userId) === String(req.user._id));
  await upsertUserState(req, res, { isBookmarked: !(mine?.isBookmarked) });
});

exports.saveNotes = asyncHandler(async (req, res) => {
  await upsertUserState(req, res, { notes: req.body.notes || '' });
});
