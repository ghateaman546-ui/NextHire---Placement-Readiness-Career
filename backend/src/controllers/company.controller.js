const { Company } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const cloudinary = require('../config/cloudinary');

/** GET /api/companies */
exports.listCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({ isActive: true }).select('name slug logoUrl tags salary').lean();
  res.json({ success: true, data: companies });
});

/** GET /api/companies/admin/all — admin: includes inactive companies too */
exports.listCompaniesAdmin = asyncHandler(async (req, res) => {
  const companies = await Company.find().select('name slug logoUrl tags salary previousYearQuestions isActive').lean();
  res.json({ success: true, data: companies });
});

/**
 * GET /api/companies/:slug
 * Full company page — overview, process, salary, FAQs, and the
 * company-specific past interview question bank (previousYearQuestions).
 * ?category=coding|aptitude|hr|technical filters the PYQ bank.
 */
exports.getCompanyBySlug = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ slug: req.params.slug, isActive: true }).populate(
    'interviewExperiences.userId',
    'name college'
  );
  if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });

  const { category } = req.query;
  const data = company.toObject();
  if (category) {
    data.previousYearQuestions = data.previousYearQuestions.filter((q) => q.category === category);
  }

  res.json({ success: true, data });
});

/** POST /api/companies (admin) */
exports.createCompany = asyncHandler(async (req, res) => {
  let logoUrl = '';
  if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'nexthire/companies' }, (err, result) =>
        err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    logoUrl = uploadResult.secure_url;
  }

  const slug = req.body.name.toLowerCase().trim().replace(/\s+/g, '-');
  const company = await Company.create({ ...req.body, slug, logoUrl });
  res.status(201).json({ success: true, data: company });
});

/** PUT /api/companies/:id (admin) */
exports.updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });
  res.json({ success: true, data: company });
});

/** DELETE /api/companies/:id (admin) */
exports.deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndDelete(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });
  res.json({ success: true, message: 'Company deleted.' });
});

/** POST /api/companies/:id/interview-experience */
exports.addInterviewExperience = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });

  company.interviewExperiences.push({ ...req.body, userId: req.user._id });
  await company.save();
  res.status(201).json({ success: true, data: company.interviewExperiences.at(-1) });
});

/** POST /api/companies/:id/previous-year-questions (admin) — grow the question bank */
exports.addPreviousYearQuestion = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ success: false, message: 'Company not found.' });

  company.previousYearQuestions.push(req.body);
  await company.save();
  res.status(201).json({ success: true, data: company.previousYearQuestions.at(-1) });
});
