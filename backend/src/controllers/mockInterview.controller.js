const mongoose = require('mongoose');
const { MockInterview, InterviewQuestion, User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { evaluateAnswer } = require('../utils/llm');

const DEFAULT_QUESTION_COUNT = 10;
const MAX_QUESTION_COUNT = 20;
const MAX_ANSWER_LENGTH = 3000;
const ACTIVE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NO_QUESTIONS_MESSAGE = 'No interview questions are currently available. Please contact the administrator.';

const CATEGORIES = InterviewQuestion.schema.path('category').enumValues;
const SUBJECTS = InterviewQuestion.schema.path('subject').enumValues;
const DIFFICULTIES = InterviewQuestion.schema.path('difficulty').enumValues;

/**
 * The ONLY shape of a session that leaves the server. It never includes
 * expectedConcepts, and only reveals the single current (unanswered) question —
 * later questions stay server-side until the previous one has been scored.
 */
function toPublicState(session) {
  const qs = session.questions || [];
  const currentIdx = qs.findIndex((q) => !q.evaluatedAt);
  const answered = qs.filter((q) => q.evaluatedAt);
  const inProgress = session.status === 'in-progress';

  return {
    sessionId: session._id,
    status: session.status,
    total: qs.length,
    answeredCount: answered.length,
    currentQuestion:
      inProgress && currentIdx >= 0
        ? { id: qs[currentIdx]._id, text: qs[currentIdx].question, number: currentIdx + 1 }
        : null,
    history: answered.map((q) => ({
      id: q._id,
      question: q.question,
      answerText: q.answerText,
      score: q.score,
      feedback: q.feedback,
      strengths: q.strengths || [],
      missingPoints: q.missingPoints || [],
      evaluationMode: q.evalModel === 'local-fallback' ? 'local' : 'ai',
    })),
    summary:
      session.status === 'completed'
        ? { averageScore: session.averageScore ?? null, answeredCount: answered.length, total: qs.length }
        : null,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  };
}

function toEvaluation(q) {
  return { score: q.score, feedback: q.feedback, strengths: q.strengths || [], missingPoints: q.missingPoints || [], mode: q.evalModel === 'local-fallback' ? 'local' : 'ai' };
}

/** Marks the session completed, computes the average score and syncs the dashboard average. Idempotent. */
async function finalizeSession(session) {
  if (session.status === 'completed') return session;

  const scored = session.questions.filter((q) => q.evaluatedAt && typeof q.score === 'number');
  const averageScore = scored.length
    ? Math.round((scored.reduce((sum, q) => sum + q.score, 0) / scored.length) * 10) / 10
    : undefined;

  session.status = 'completed';
  session.completedAt = new Date();
  session.averageScore = averageScore;
  if (scored.length) {
    const missing = [...new Set(scored.flatMap((q) => q.missingPoints || []))].slice(0, 5);
    session.aiFeedback = {
      // Kept on the 0-100 scale the rest of the app (dashboard/profile) already uses.
      overallRating: Math.round(averageScore * 10),
      suggestions: missing,
      detailedFeedback: `Average score ${averageScore}/10 across ${scored.length} answered question${scored.length === 1 ? '' : 's'}.`,
      llmModel: scored[scored.length - 1].evalModel,
      generatedAt: new Date(),
    };
  }
  await session.save();

  const completed = await MockInterview.find({ userId: session.userId, status: 'completed' }).select('aiFeedback.overallRating');
  const rated = completed.filter((s) => typeof s.aiFeedback?.overallRating === 'number');
  if (rated.length) {
    const avg = rated.reduce((sum, s) => sum + s.aiFeedback.overallRating, 0) / rated.length;
    await User.updateOne({ _id: session.userId }, { $set: { mockInterviewAvgScore: Math.round(avg) } });
  }
  return session;
}

/**
 * POST /api/mock-interviews
 * Body (all optional): { category, subject, difficulty, company, count }
 * Picks random ACTIVE questions from the admin-managed bank. No AI-invented questions.
 */
exports.startSession = asyncHandler(async (req, res) => {
  const { category, subject, difficulty, company, mode } = req.body || {};
  const requested = parseInt(req.body?.count, 10);
  const count = Math.min(MAX_QUESTION_COUNT, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_QUESTION_COUNT));

  const match = { isActive: true };
  if (CATEGORIES.includes(category)) match.category = category;
  if (SUBJECTS.includes(subject)) match.subject = subject;
  if (DIFFICULTIES.includes(difficulty)) match.difficulty = difficulty;
  if (company && mongoose.isValidObjectId(company)) match.company = new mongoose.Types.ObjectId(company);

  const picked = await InterviewQuestion.aggregate([{ $match: match }, { $sample: { size: count } }]);
  if (picked.length === 0) {
    return res.status(404).json({ success: false, code: 'NO_QUESTIONS', message: NO_QUESTIONS_MESSAGE });
  }

  const session = await MockInterview.create({
    userId: req.user._id,
    company: match.company,
    mode: mode === 'voice' ? 'voice' : 'text',
    version: 2,
    questions: picked.map((q) => ({
      questionId: q._id,
      question: q.question,
      // Fall back to the model answer so questions without explicit concepts can still be evaluated.
      expectedConcepts: q.expectedConcepts?.length ? q.expectedConcepts : q.answer ? [q.answer] : [],
    })),
  });

  res.status(201).json({ success: true, data: toPublicState(session) });
});

/** GET /api/mock-interviews/active — the caller's unfinished (v2) session, so a page refresh can resume. */
exports.getActiveSession = asyncHandler(async (req, res) => {
  const session = await MockInterview.findOne({
    userId: req.user._id,
    version: 2,
    status: 'in-progress',
    createdAt: { $gte: new Date(Date.now() - ACTIVE_SESSION_MAX_AGE_MS) },
  }).sort({ createdAt: -1 });
  res.json({ success: true, data: session ? toPublicState(session) : null });
});

exports.listMySessions = asyncHandler(async (req, res) => {
  const sessions = await MockInterview.find({ userId: req.user._id }).sort({ createdAt: -1 });
  const data = sessions.map((s) => {
    const { sessionId, status, total, answeredCount, summary, startedAt, completedAt } = toPublicState(s);
    return { sessionId, status, total, answeredCount, averageScore: summary?.averageScore ?? null, startedAt, completedAt };
  });
  res.json({ success: true, data });
});

exports.getSession = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Session not found.' });
  const session = await MockInterview.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
  res.json({ success: true, data: toPublicState(session) });
});

/**
 * PUT /api/mock-interviews/:id/answers/:qId   Body: { answerText, timeTakenSeconds? }
 * Evaluates the answer server-side. The client can never supply a score. If the AI call
 * or its output is invalid, nothing is saved and the same question can simply be resubmitted.
 */
exports.submitAnswer = asyncHandler(async (req, res) => {
  const answerText = typeof req.body?.answerText === 'string' ? req.body.answerText.trim() : '';
  if (!answerText) return res.status(400).json({ success: false, message: 'Please enter an answer before submitting.' });
  if (answerText.length > MAX_ANSWER_LENGTH) {
    return res.status(400).json({ success: false, message: `Your answer is too long (max ${MAX_ANSWER_LENGTH} characters).` });
  }
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Session not found.' });

  const session = await MockInterview.findOne({ _id: req.params.id, userId: req.user._id, version: 2 });
  if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
  if (session.status === 'completed') return res.status(409).json({ success: false, message: 'This interview is already completed.' });

  const idx = session.questions.findIndex((q) => String(q._id) === req.params.qId);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Question not found in this session.' });
  const q = session.questions[idx];

  // Already scored (e.g. double-click / retry after a dropped response): return the saved result, never re-score.
  if (q.evaluatedAt) return res.json({ success: true, data: { evaluation: toEvaluation(q), session: toPublicState(session) } });

  if (session.questions.findIndex((x) => !x.evaluatedAt) !== idx) {
    return res.status(409).json({ success: false, message: 'This is not the current question.' });
  }

  const evaluation = await evaluateAnswer({ question: q.question, expectedConcepts: q.expectedConcepts, answerText });

  const timeTaken = Number(req.body?.timeTakenSeconds);
  const updated = await MockInterview.findOneAndUpdate(
    { _id: session._id, userId: req.user._id, questions: { $elemMatch: { _id: q._id, evaluatedAt: null } } },
    {
      $set: {
        'questions.$.answerText': answerText,
        'questions.$.score': evaluation.score,
        'questions.$.feedback': evaluation.feedback,
        'questions.$.strengths': evaluation.strengths,
        'questions.$.missingPoints': evaluation.missingPoints,
        'questions.$.evalModel': evaluation.llmModel,
        'questions.$.evaluatedAt': new Date(),
        ...(Number.isFinite(timeTaken) && timeTaken >= 0 && timeTaken <= 86400 ? { 'questions.$.timeTakenSeconds': Math.round(timeTaken) } : {}),
      },
    },
    { new: true }
  );

  // Lost a race with a concurrent submit of the same question: return whatever was saved first.
  let fresh = updated || (await MockInterview.findById(session._id));
  const saved = fresh.questions.id(q._id);

  if (fresh.questions.every((x) => x.evaluatedAt)) fresh = await finalizeSession(fresh);

  res.json({ success: true, data: { evaluation: toEvaluation(saved), session: toPublicState(fresh) } });
});

/** POST /api/mock-interviews/:id/complete — finish (also used to end early). Idempotent; no AI call. */
exports.completeSession = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Session not found.' });
  const session = await MockInterview.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

  await finalizeSession(session);
  res.json({ success: true, data: toPublicState(session) });
});
