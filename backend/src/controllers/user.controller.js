const { User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const cloudinary = require('../config/cloudinary');

function calcProfileCompletion(u) {
  const fields = [u.photoUrl, u.college, u.branch, u.year, u.cgpa, u.linkedin, u.github, u.resumeUrl];
  const filled = fields.filter(Boolean).length + (u.skills?.length ? 1 : 0) + (u.projects?.length ? 1 : 0);
  return Math.round((filled / (fields.length + 2)) * 100);
}

exports.getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name', 'college', 'branch', 'year', 'cgpa', 'skills', 'programmingLanguages', 'projects', 'linkedin', 'github'];
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) req.user[f] = req.body[f];
  });
  req.user.profileCompletionPercent = calcProfileCompletion(req.user);
  await req.user.save();
  res.json({ success: true, data: req.user });
});

exports.uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'An image file is required.' });
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(501).json({ success: false, message: 'Cloudinary is not configured on this server.' });
  }
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'nexthire/avatars' }, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    stream.end(req.file.buffer);
  });
  req.user.photoUrl = uploadResult.secure_url;
  req.user.profileCompletionPercent = calcProfileCompletion(req.user);
  await req.user.save();
  res.json({ success: true, data: req.user });
});

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    data: {
      profileCompletionPercent: u.profileCompletionPercent,
      currentStreak: u.currentStreak,
      questionsSolved: u.questionsSolved,
      resumeScore: u.resumeScore,
      mockInterviewAvgScore: u.mockInterviewAvgScore,
      totalPoints: u.totalPoints,
    },
  });
});
