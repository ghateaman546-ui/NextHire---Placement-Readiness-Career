const { CodingProblem } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/** GET /api/coding-problems — student: published problems only (list view, no test cases) */
exports.listCodingProblems = asyncHandler(async (req, res) => {
  const { difficulty, topic } = req.query;
  const filter = { isActive: true };
  if (difficulty) filter.difficulty = difficulty;
  if (topic) filter.topic = topic;
  const problems = await CodingProblem.find(filter)
    .select('title slug difficulty topic supportedLanguages')
    .populate('topic', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: problems });
});

/** GET /api/coding-problems/:slug — student: full problem incl. examples and example solution code (hidden test cases are never sent) */
exports.getCodingProblem = asyncHandler(async (req, res) => {
  const problem = await CodingProblem.findOne({ slug: req.params.slug, isActive: true }).populate('topic', 'name');
  if (!problem) return res.status(404).json({ success: false, message: 'Coding problem not found.' });
  const obj = problem.toObject();
  obj.testCases = (obj.testCases || []).filter((tc) => !tc.isHidden);
  res.json({ success: true, data: obj });
});

/* Coding Problems are learning-only: there is intentionally no run/submit/grading endpoint here.
   Experimenting with code happens in the Playground (/api/execute). */

/* ---------------- Admin ---------------- */

/** GET /api/coding-problems/admin/all */
exports.listCodingProblemsAdmin = asyncHandler(async (req, res) => {
  const problems = await CodingProblem.find().populate('topic', 'name').sort({ createdAt: -1 });
  res.json({ success: true, data: problems });
});

exports.getCodingProblemAdmin = asyncHandler(async (req, res) => {
  const problem = await CodingProblem.findById(req.params.id);
  if (!problem) return res.status(404).json({ success: false, message: 'Coding problem not found.' });
  res.json({ success: true, data: problem });
});

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

exports.createCodingProblem = asyncHandler(async (req, res) => {
  const slug = slugify(req.body.title || '');
  const problem = await CodingProblem.create({ ...req.body, slug });
  res.status(201).json({ success: true, data: problem });
});

exports.updateCodingProblem = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.title) payload.slug = slugify(payload.title);
  const problem = await CodingProblem.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!problem) return res.status(404).json({ success: false, message: 'Coding problem not found.' });
  res.json({ success: true, data: problem });
});

exports.deleteCodingProblem = asyncHandler(async (req, res) => {
  const problem = await CodingProblem.findByIdAndDelete(req.params.id);
  if (!problem) return res.status(404).json({ success: false, message: 'Coding problem not found.' });
  res.json({ success: true, message: 'Coding problem deleted.' });
});
