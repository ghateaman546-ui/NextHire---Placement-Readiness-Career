const mongoose = require('mongoose');
const { Quiz, QuizResult } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/quizzes — list quizzes.
 * ?category=Quantitative Aptitude|...|Technical
 * ?subject=OS|DBMS|OOP|... (only meaningful when category=Technical —
 *   this is what powers the domain-wise technical quiz modules)
 */
exports.listQuizzes = asyncHandler(async (req, res) => {
  const { category, subject, difficulty } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (subject) filter.subject = subject;
  if (difficulty) filter.difficulty = difficulty;

  // Don't leak correct answers in the list view.
  const quizzes = await Quiz.find(filter).select('title category subject difficulty timerSeconds questions').lean();
  const withCounts = quizzes.map((q) => ({ ...q, questionCount: q.questions.length, questions: undefined }));

  res.json({ success: true, data: withCounts });
});

/** GET /api/quizzes/:id — get quiz for attempt (correct answers withheld) */
exports.getQuizForAttempt = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id).lean();
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

  const sanitized = {
    ...quiz,
    questions: quiz.questions.map((q) => ({ _id: q._id, question: q.question, options: q.options })),
  };
  res.json({ success: true, data: sanitized });
});

/** POST /api/quizzes — create quiz (admin). Used for both aptitude and technical/domain-wise quizzes. */
exports.createQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.create(req.body);
  res.status(201).json({ success: true, data: quiz });
});

/** PUT /api/quizzes/:id — update quiz (admin) */
exports.updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
  res.json({ success: true, data: quiz });
});

/** DELETE /api/quizzes/:id — delete quiz (admin) */
exports.deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findByIdAndDelete(req.params.id);
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
  res.json({ success: true, message: 'Quiz deleted.' });
});

/** POST /api/quizzes/:id/submit — submit answers, get instant scored result */
exports.submitQuiz = asyncHandler(async (req, res) => {
  const { answers, timeTakenSeconds } = req.body; // answers: [{ questionId, selectedOptionIndex }]
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;

  const gradedAnswers = quiz.questions.map((q) => {
    const submitted = (answers || []).find((a) => String(a.questionId) === String(q._id));
    if (!submitted || submitted.selectedOptionIndex == null) {
      skippedCount++;
      return { questionId: q._id, selectedOptionIndex: null, isCorrect: false };
    }
    const isCorrect = submitted.selectedOptionIndex === q.correctOptionIndex;
    if (isCorrect) correctCount++;
    else incorrectCount++;
    return { questionId: q._id, selectedOptionIndex: submitted.selectedOptionIndex, isCorrect };
  });

  const rawScore =
    correctCount * quiz.marksPerCorrect -
    (quiz.negativeMarkingEnabled ? incorrectCount * quiz.negativeMarksPerWrong : 0);

  const result = await QuizResult.create({
    userId: req.user._id,
    quizId: quiz._id,
    answers: gradedAnswers,
    score: Math.max(0, rawScore),
    totalQuestions: quiz.questions.length,
    correctCount,
    incorrectCount,
    skippedCount,
    timeTakenSeconds,
  });

  // Return with explanations now that the attempt is submitted.
  const withExplanations = quiz.questions.map((q) => ({
    _id: q._id,
    question: q.question,
    options: q.options,
    correctOptionIndex: q.correctOptionIndex,
    explanation: q.explanation,
  }));

  res.json({ success: true, data: { result, questions: withExplanations } });
});

/** GET /api/quizzes/manage/list — admin: list ALL quizzes (published + unpublished), with attempt counts */
exports.listQuizzesAdmin = asyncHandler(async (req, res) => {
  const quizzes = await Quiz.find().sort({ createdAt: -1 }).lean();
  const attemptCounts = await QuizResult.aggregate([{ $group: { _id: '$quizId', count: { $sum: 1 } } }]);
  const countMap = new Map(attemptCounts.map((a) => [String(a._id), a.count]));
  const withCounts = quizzes.map((q) => ({
    ...q,
    questionCount: q.questions.length,
    attemptCount: countMap.get(String(q._id)) || 0,
  }));
  res.json({ success: true, data: withCounts });
});

/** GET /api/quizzes/manage/:id — admin: full quiz including correct answers, for editing */
exports.getQuizAdmin = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
  res.json({ success: true, data: quiz });
});

/** GET /api/quizzes/manage/:id/stats — admin: attempt stats + every individual attempt */
exports.getQuizStatsAdmin = asyncHandler(async (req, res) => {
  const quizId = req.params.id;
  const [quiz, attempts, agg] = await Promise.all([
    Quiz.findById(quizId).select('title category subject questions'),
    QuizResult.find({ quizId }).sort({ score: -1 }).populate('userId', 'name email college'),
    QuizResult.aggregate([
      { $match: { quizId: new mongoose.Types.ObjectId(quizId) } },
      { $group: { _id: null, avgScore: { $avg: '$score' }, highScore: { $max: '$score' }, lowScore: { $min: '$score' }, count: { $sum: 1 } } },
    ]),
  ]);
  if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

  const stats = agg[0] || { avgScore: 0, highScore: 0, lowScore: 0, count: 0 };
  res.json({
    success: true,
    data: {
      quiz: { _id: quiz._id, title: quiz.title, category: quiz.category, subject: quiz.subject, questionCount: quiz.questions.length },
      totalAttempts: stats.count,
      averageScore: Math.round((stats.avgScore || 0) * 100) / 100,
      highestScore: stats.highScore || 0,
      lowestScore: stats.count ? stats.lowScore : 0,
      attempts: attempts.map((a) => ({
        id: a._id,
        student: a.userId ? { id: a.userId._id, name: a.userId.name, email: a.userId.email, college: a.userId.college } : null,
        score: a.score,
        correctCount: a.correctCount,
        totalQuestions: a.totalQuestions,
        timeTakenSeconds: a.timeTakenSeconds,
        completedAt: a.completedAt,
      })),
    },
  });
});

/** GET /api/quizzes/:id/leaderboard — per-quiz leaderboard */
exports.getQuizLeaderboard = asyncHandler(async (req, res) => {
  const results = await QuizResult.find({ quizId: req.params.id })
    .sort({ score: -1, timeTakenSeconds: 1 })
    .limit(50)
    .populate('userId', 'name college');
  res.json({ success: true, data: results });
});
