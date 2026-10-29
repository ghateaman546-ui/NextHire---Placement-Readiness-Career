const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/topics', require('./topic.routes'));
router.use('/companies', require('./company.routes'));
router.use('/questions', require('./question.routes'));
router.use('/interview-questions', require('./interviewQuestion.routes'));
router.use('/quizzes', require('./quiz.routes'));
router.use('/resumes', require('./resume.routes'));
router.use('/ats', require('./ats.routes'));
router.use('/mock-interviews', require('./mockInterview.routes'));
router.use('/peer-mock-interviews', require('./peerMockInterview.routes'));
router.use('/notes', require('./note.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/leaderboard', require('./leaderboard.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/feedback', require('./feedback.routes'));
router.use('/execute', require('./execute.routes'));
router.use('/coding-problems', require('./codingProblem.routes'));

module.exports = router;
