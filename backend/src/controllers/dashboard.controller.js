const { Progress } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

exports.getSummary = asyncHandler(async (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    data: {
      profileCompletionPercent: u.profileCompletionPercent,
      currentStreak: u.currentStreak,
      coursesCompleted: u.coursesCompleted,
      questionsSolved: u.questionsSolved,
      resumeScore: u.resumeScore,
      mockInterviewAvgScore: u.mockInterviewAvgScore,
      totalPoints: u.totalPoints,
    },
  });
});

async function seriesFor(userId, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return Progress.find({ userId, date: { $gte: since } }).sort({ date: 1 });
}

exports.getDailyProgress = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await seriesFor(req.user._id, 30) });
});

exports.getWeeklyProgress = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await seriesFor(req.user._id, 12 * 7) });
});

exports.getMonthlyProgress = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await seriesFor(req.user._id, 365) });
});

exports.getSkillProgress = asyncHandler(async (req, res) => {
  const latest = await Progress.findOne({ userId: req.user._id }).sort({ date: -1 });
  res.json({ success: true, data: latest?.skillProgress || [] });
});
