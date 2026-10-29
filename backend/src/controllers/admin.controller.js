const mongoose = require('mongoose');
const { User, Notification, Question, Company, QuizResult, Quiz, Topic, Feedback, Progress } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

exports.listStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ role: 'student' }).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, data: students });
});

exports.blockStudent = asyncHandler(async (req, res) => {
  const student = await User.findByIdAndUpdate(req.params.id, { isBlocked: true }, { new: true });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  res.json({ success: true, data: student });
});

exports.unblockStudent = asyncHandler(async (req, res) => {
  const student = await User.findByIdAndUpdate(req.params.id, { isBlocked: false }, { new: true });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  res.json({ success: true, data: student });
});

exports.deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findByIdAndDelete(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  res.json({ success: true, message: 'Student deleted.' });
});

/** GET /api/admin/students/:id/detail — full admin view of one student's activity */
exports.getStudentDetail = asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const [student, quizAttempts, questionStats, feedback, recentProgress] = await Promise.all([
    User.findById(studentId).select('-password'),
    QuizResult.find({ userId: studentId }).sort({ completedAt: -1 }).populate('quizId', 'title category subject'),
    Question.aggregate([
      { $unwind: '$userStates' },
      { $match: { 'userStates.userId': new mongoose.Types.ObjectId(studentId) } },
      { $group: { _id: '$userStates.status', count: { $sum: 1 } } },
    ]),
    Feedback.find({ userId: studentId }).sort({ createdAt: -1 }),
    Progress.find({ userId: studentId }).sort({ date: -1 }).limit(14),
  ]);

  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const taskCounts = { 'not-started': 0, attempted: 0, completed: 0 };
  questionStats.forEach((s) => { taskCounts[s._id] = s.count; });

  res.json({
    success: true,
    data: {
      student,
      taskProgress: { completed: taskCounts.completed, attempted: taskCounts.attempted, notStarted: taskCounts['not-started'] },
      quizAttempts: quizAttempts.map((a) => ({
        id: a._id,
        quiz: a.quizId ? { id: a.quizId._id, title: a.quizId.title, category: a.quizId.category } : null,
        score: a.score,
        correctCount: a.correctCount,
        totalQuestions: a.totalQuestions,
        completedAt: a.completedAt,
      })),
      feedback,
      recentProgress,
    },
  });
});

exports.getPlatformAnalytics = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date();
  since7d.setDate(since7d.getDate() - 6);
  since7d.setHours(0, 0, 0, 0);

  const [
    totalStudents,
    totalQuestions,
    totalCompanies,
    quizzesTaken,
    totalQuizzes,
    publishedQuizzes,
    totalTopics,
    activeToday,
    avgResumeAgg,
    signupsAgg,
    totalFeedback,
    newFeedback,
    recentStudents,
    recentAttempts,
  ] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Question.countDocuments(),
    Company.countDocuments(),
    QuizResult.countDocuments(),
    Quiz.countDocuments(),
    Quiz.countDocuments({ isActive: true }),
    Topic.countDocuments(),
    User.countDocuments({ role: 'student', lastActiveDate: { $gte: since24h } }),
    User.aggregate([{ $match: { role: 'student' } }, { $group: { _id: null, avg: { $avg: '$resumeScore' } } }]),
    User.aggregate([
      { $match: { role: 'student', createdAt: { $gte: since7d } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Feedback.countDocuments(),
    Feedback.countDocuments({ status: 'new' }),
    User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(5).select('name email college createdAt'),
    QuizResult.find().sort({ completedAt: -1 }).limit(8).populate('userId', 'name').populate('quizId', 'title'),
  ]);

  // Build a real last-7-days signup series (zero-filled for days with no signups).
  const signupsByDay = new Map(signupsAgg.map((d) => [d._id, d.count]));
  const signupsLast7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    signupsLast7Days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), value: signupsByDay.get(key) || 0 });
  }

  const totalQuestionsSolved = await User.aggregate([
    { $match: { role: 'student' } },
    { $group: { _id: null, total: { $sum: '$questionsSolved' } } },
  ]);

  res.json({
    success: true,
    data: {
      totalStudents,
      totalQuestions,
      totalCompanies,
      quizzesTaken,
      totalQuizzes,
      publishedQuizzes,
      totalTopics,
      activeToday,
      avgResumeScore: Math.round(avgResumeAgg[0]?.avg || 0),
      totalQuestionsSolved: totalQuestionsSolved[0]?.total || 0,
      signupsLast7Days,
      totalFeedback,
      newFeedback,
      recentRegistrations: recentStudents,
      recentQuizAttempts: recentAttempts.map((a) => ({
        id: a._id,
        studentName: a.userId?.name || 'Unknown',
        quizTitle: a.quizId?.title || 'Unknown quiz',
        score: a.score,
        completedAt: a.completedAt,
      })),
    },
  });
});

exports.createNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, data: notification });
});

exports.listAllNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find().sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: notifications });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
  res.json({ success: true, message: 'Notification deleted.' });
});
