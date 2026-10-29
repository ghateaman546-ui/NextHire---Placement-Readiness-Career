const { User, Question, QuizResult } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * The leaderboard is computed LIVE from real student activity, so every student shows up
 * automatically and rankings are always current (there is no separate table to keep in sync).
 *
 *   points = 10 x questions marked "completed"
 *          +  5 x correct quiz answers (best attempt of each quiz, so retaking can't farm points)
 *          +  5 x current streak (days)
 *          +  any points already stored on the student (User.totalPoints, e.g. awarded by seed/admin)
 *
 * Weekly / monthly rankings count only questions and quizzes completed inside that window.
 * Every active student is listed, including those with 0 points; admins and blocked users are not.
 */
const POINTS_PER_QUESTION = 10;
const POINTS_PER_CORRECT_ANSWER = 5;
const POINTS_PER_STREAK_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Map of userId(string) -> activity-based points since `since` (or all-time when null). */
async function activityPoints(userIds, since) {
  const questionMatch = { 'userStates.status': 'completed', 'userStates.userId': { $in: userIds } };
  if (since) questionMatch['userStates.completedAt'] = { $gte: since };
  const quizMatch = { userId: { $in: userIds } };
  if (since) quizMatch.completedAt = { $gte: since };

  const [questions, quizzes] = await Promise.all([
    Question.aggregate([
      { $unwind: '$userStates' },
      { $match: questionMatch },
      { $group: { _id: '$userStates.userId', completed: { $sum: 1 } } },
    ]),
    QuizResult.aggregate([
      { $match: quizMatch },
      { $group: { _id: { userId: '$userId', quizId: '$quizId' }, best: { $max: '$correctCount' } } },
      { $group: { _id: '$_id.userId', correct: { $sum: '$best' } } },
    ]),
  ]);

  const points = new Map();
  const add = (id, n) => points.set(String(id), (points.get(String(id)) || 0) + n);
  questions.forEach((r) => add(r._id, r.completed * POINTS_PER_QUESTION));
  quizzes.forEach((r) => add(r._id, r.correct * POINTS_PER_CORRECT_ANSWER));
  return points;
}

/** Ranked rows for every active student, sorted by the requested range (all-time by default). */
async function buildRanking(range = 'all-time') {
  const students = await User.find({ role: 'student', isBlocked: { $ne: true } }).select('name college totalPoints currentStreak');
  const ids = students.map((s) => s._id);

  const now = Date.now();
  const [allTime, weekly, monthly] = await Promise.all([
    activityPoints(ids, null),
    range === 'weekly' ? activityPoints(ids, new Date(now - 7 * DAY_MS)) : Promise.resolve(new Map()),
    range === 'monthly' ? activityPoints(ids, new Date(now - 30 * DAY_MS)) : Promise.resolve(new Map()),
  ]);

  const rows = students.map((s) => {
    const id = String(s._id);
    return {
      _id: s._id,
      userId: { _id: s._id, name: s.name, college: s.college || '' },
      totalPoints: (allTime.get(id) || 0) + (s.currentStreak || 0) * POINTS_PER_STREAK_DAY + (s.totalPoints || 0),
      weeklyPoints: weekly.get(id) || 0,
      monthlyPoints: monthly.get(id) || 0,
      badges: [],
    };
  });

  const field = range === 'weekly' ? 'weeklyPoints' : range === 'monthly' ? 'monthlyPoints' : 'totalPoints';
  rows.sort((a, b) => b[field] - a[field] || a.userId.name.localeCompare(b.userId.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

exports.getLeaderboard = asyncHandler(async (req, res) => {
  const { range = 'all-time' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const rows = await buildRanking(range);
  res.json({ success: true, data: rows.slice((page - 1) * limit, page * limit) });
});

/** Current student's own standing (used by the Dashboard's "Leaderboard Rank"). */
exports.getMyRank = asyncHandler(async (req, res) => {
  const rows = await buildRanking('all-time');
  const mine = rows.find((r) => String(r._id) === String(req.user._id));
  res.json({ success: true, data: mine || null });
});
