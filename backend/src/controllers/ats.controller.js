const mongoose = require('mongoose');
const { Resume } = require('../models');
const ATSAnalysis = require('../models/ATSAnalysis');
const { asyncHandler } = require('../middleware/errorHandler');
const { extractResumeText, AtsError } = require('../services/ats.extractor');
const { analyze, builderResumeToText } = require('../services/ats.service');

const MAX_JD_CHARS = 10000;
const MIN_JD_WORDS = 8;
const MAX_SAVED_PER_USER = 20;

function cleanJobDescription(raw) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new AtsError('Job description must be text.', 400, 'INVALID_JD');
  const jd = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .replace(/<[^>]*>/g, ' ') // strip any markup — the JD is treated as plain text only
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!jd) return '';
  if (jd.length > MAX_JD_CHARS) throw new AtsError(`Job description is too long (maximum ${MAX_JD_CHARS.toLocaleString()} characters).`, 400, 'JD_TOO_LONG');
  if (jd.split(/\s+/).length < MIN_JD_WORDS) {
    throw new AtsError('The job description is too short to analyze. Paste the complete description, or leave it empty for a general analysis.', 400, 'JD_TOO_SHORT');
  }
  return jd;
}

function toSummary(doc) {
  return {
    id: doc._id,
    score: doc.score,
    grade: doc.grade,
    mode: doc.mode,
    source: doc.source,
    fileName: doc.fileName,
    jobDescriptionProvided: Boolean(doc.jobDescription),
    createdAt: doc.createdAt,
  };
}

/** Rebuilds the same response shape that analyze returns, from a stored document. */
function toFullResult(doc) {
  const report = doc.report || {};
  return {
    ...report,
    id: doc._id,
    score: doc.score,
    grade: doc.grade,
    mode: doc.mode,
    source: doc.source,
    fileName: doc.fileName,
    fileType: doc.fileType,
    breakdown: doc.breakdown,
    sections: doc.sections,
    formatting: doc.formattingIssues,
    suggestions: doc.suggestions,
    skills: doc.skills,
    keywords: { ...(report.keywords || {}), matched: doc.matchedKeywords, missing: doc.missingKeywords },
    jobDescription: doc.jobDescription,
    createdAt: doc.createdAt,
  };
}

/**
 * POST /api/ats/analyze
 *   multipart/form-data: resume (file), jobDescription (optional text)           -> analyze an uploaded file
 *   JSON or form:        source=builder, jobDescription (optional), resumeId?     -> analyze the saved NextHire builder resume
 */
exports.analyze = asyncHandler(async (req, res) => {
  const source = req.body.source === 'builder' ? 'builder' : 'upload';
  const jobDescription = cleanJobDescription(req.body.jobDescription);

  let text;
  let meta = {};
  let fileName = '';
  let resumeId;

  if (source === 'builder') {
    const query = { userId: req.user._id, source: 'builder' };
    if (req.body.resumeId) {
      if (!mongoose.isValidObjectId(req.body.resumeId)) throw new AtsError('Invalid resume id.', 400, 'INVALID_RESUME_ID');
      query._id = req.body.resumeId;
    }
    const resume = await Resume.findOne(query).sort({ updatedAt: -1 });
    if (!resume) {
      throw new AtsError('You have not saved a resume in the Resume Builder yet. Build and save one first, or upload a file.', 404, 'NO_BUILDER_RESUME');
    }
    text = builderResumeToText(resume, req.user);
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < 80) {
      throw new AtsError('Your NextHire resume is almost empty. Fill in more sections in the Resume Builder, then analyze again.', 422, 'EMPTY_BUILDER_RESUME');
    }
    resumeId = resume._id;
    fileName = 'NextHire Resume';
    meta = { fileType: 'builder' };
  } else {
    if (!req.file) throw new AtsError('Please choose a resume file to upload.', 400, 'NO_FILE');
    const extracted = await extractResumeText(req.file);
    text = extracted.text;
    meta = { fileType: extracted.fileType, pages: extracted.pages, tables: extracted.tables, images: extracted.images };
    fileName = String(req.file.originalname || 'resume').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  }

  const result = analyze({ text, jobDescription, source, meta });

  // Persist (best-effort: a database hiccup must not lose the analysis the user is waiting for).
  let saved = null;
  try {
    const { keywords, skills, sections, formatting, suggestions, breakdown, score, grade, mode, ...rest } = result;
    saved = await ATSAnalysis.create({
      userId: req.user._id,
      source,
      resumeId,
      fileName,
      fileType: meta.fileType || '',
      jobDescription,
      mode,
      score,
      grade,
      breakdown,
      matchedKeywords: keywords.matched,
      missingKeywords: keywords.missing,
      skills,
      sections,
      formattingIssues: formatting,
      suggestions,
      report: { ...rest, keywords: { matchPercent: keywords.matchPercent, totalJobKeywords: keywords.totalJobKeywords } },
    });
    // Keep only the most recent analyses per user.
    const old = await ATSAnalysis.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(MAX_SAVED_PER_USER).select('_id').lean();
    if (old.length) await ATSAnalysis.deleteMany({ _id: { $in: old.map((d) => d._id) }, userId: req.user._id });
  } catch (err) {
    console.error('[ats] could not save analysis:', err.message);
  }

  res.json({
    success: true,
    data: { ...result, id: saved?._id || null, fileName, jobDescription, createdAt: saved?.createdAt || new Date() },
  });
});

/** GET /api/ats/history — the signed-in user's recent analyses (summaries only) */
exports.listHistory = asyncHandler(async (req, res) => {
  const docs = await ATSAnalysis.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(MAX_SAVED_PER_USER).select('score grade mode source fileName jobDescription createdAt');
  res.json({ success: true, data: docs.map(toSummary) });
});

/** GET /api/ats/:id — one of the user's own saved analyses */
exports.getAnalysis = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AtsError('Analysis not found.', 404, 'NOT_FOUND');
  const doc = await ATSAnalysis.findOne({ _id: req.params.id, userId: req.user._id });
  if (!doc) throw new AtsError('Analysis not found.', 404, 'NOT_FOUND');
  res.json({ success: true, data: toFullResult(doc) });
});

/** DELETE /api/ats/:id */
exports.deleteAnalysis = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AtsError('Analysis not found.', 404, 'NOT_FOUND');
  const doc = await ATSAnalysis.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!doc) throw new AtsError('Analysis not found.', 404, 'NOT_FOUND');
  res.json({ success: true, message: 'Analysis deleted.' });
});
