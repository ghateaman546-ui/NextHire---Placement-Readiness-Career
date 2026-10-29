const { Resume } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/** GET /api/resumes — list own resumes */
exports.listMyResumes = asyncHandler(async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id }).sort({ updatedAt: -1 });
  res.json({ success: true, data: resumes });
});

/** POST /api/resumes/builder — create/save a builder resume */
exports.saveBuilderResume = asyncHandler(async (req, res) => {
  const { templateId, sections, sectionOrder } = req.body;
  const resume = await Resume.create({
    userId: req.user._id,
    source: 'builder',
    templateId: templateId || 'classic',
    sections: sections || {},
    sectionOrder,
  });
  res.status(201).json({ success: true, data: resume });
});

/** PUT /api/resumes/builder/:id — update a builder resume */
exports.updateBuilderResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, source: 'builder' },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found.' });
  res.json({ success: true, data: resume });
});

/** DELETE /api/resumes/:id */
exports.deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found.' });
  res.json({ success: true, message: 'Resume deleted.' });
});
