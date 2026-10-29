const { InterviewQuestion } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Accepts expectedConcepts as an array or a newline-separated string and returns
 * a clean array (trimmed, non-empty, capped) — or undefined when the key is absent.
 */
function normalizeConcepts(value) {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : String(value || '').split('\n');
  return arr
    .map((c) => String(c).replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((c) => c.slice(0, 300));
}

const EDITABLE_FIELDS = ['question', 'category', 'subject', 'company', 'answer', 'explanation', 'followUpQuestions', 'difficulty', 'isActive'];

function pickBody(body) {
  const data = {};
  for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.company === '') delete data.company;
  const concepts = normalizeConcepts(body.expectedConcepts);
  if (concepts !== undefined) data.expectedConcepts = concepts;
  return data;
}

/** GET /api/interview-questions?category=&subject=&company=&difficulty= (students: active only, no expectedConcepts) */
exports.list = asyncHandler(async (req, res) => {
  const { category, subject, company, difficulty } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (subject) filter.subject = subject;
  if (company) filter.company = company;
  if (difficulty) filter.difficulty = difficulty;

  const questions = await InterviewQuestion.find(filter)
    .select('-expectedConcepts')
    .populate('company', 'name slug')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: questions });
});

/** GET /api/interview-questions/admin/all — admin only; includes disabled questions and expectedConcepts. */
exports.listAll = asyncHandler(async (req, res) => {
  const questions = await InterviewQuestion.find({}).populate('company', 'name slug').sort({ createdAt: -1 });
  res.json({ success: true, data: questions });
});

exports.getOne = asyncHandler(async (req, res) => {
  const query = InterviewQuestion.findById(req.params.id).populate('company', 'name slug');
  if (req.user?.role !== 'admin') query.select('-expectedConcepts');
  const question = await query;
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, data: question });
});

exports.create = asyncHandler(async (req, res) => {
  const data = pickBody(req.body);
  if (!data.question || !String(data.question).trim()) {
    return res.status(400).json({ success: false, message: 'Question text is required.' });
  }
  if (!data.expectedConcepts || data.expectedConcepts.length === 0) {
    return res.status(400).json({ success: false, message: 'Add at least one expected core concept.' });
  }
  const question = await InterviewQuestion.create(data);
  res.status(201).json({ success: true, data: question });
});

exports.update = asyncHandler(async (req, res) => {
  const data = pickBody(req.body);
  if (data.question !== undefined && !String(data.question).trim()) {
    return res.status(400).json({ success: false, message: 'Question text is required.' });
  }
  if (data.expectedConcepts && data.expectedConcepts.length === 0) {
    return res.status(400).json({ success: false, message: 'Add at least one expected core concept.' });
  }
  const question = await InterviewQuestion.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, data: question });
});

exports.remove = asyncHandler(async (req, res) => {
  const question = await InterviewQuestion.findByIdAndDelete(req.params.id);
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
  res.json({ success: true, message: 'Question deleted.' });
});
