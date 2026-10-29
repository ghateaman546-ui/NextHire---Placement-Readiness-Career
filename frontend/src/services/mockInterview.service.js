import api from './api.js';

/**
 * Every call returns the server's "public state":
 * { sessionId, status, total, answeredCount, currentQuestion: {id,text,number}|null, history[], summary|null }
 * Only the CURRENT question is ever sent; scores are computed server-side.
 */

/** Starts a session from the admin question bank. Optional filters: { category, subject, difficulty }. */
export async function startSession(filters = {}) {
  const res = await api.post('/mock-interviews', filters);
  return res.data.data;
}

/** Returns the caller's unfinished session (for resume-after-refresh) or null. */
export async function getActiveSession() {
  const res = await api.get('/mock-interviews/active');
  return res.data.data;
}

/** Submits the answer; resolves to { evaluation: {score, feedback, strengths, missingPoints}, session }. */
export async function submitAnswer(sessionId, questionId, answerText, timeTakenSeconds) {
  const res = await api.put(`/mock-interviews/${sessionId}/answers/${questionId}`, { answerText, timeTakenSeconds });
  return res.data.data;
}

/** Finishes (or ends early) and returns the final session state. */
export async function completeSession(sessionId) {
  const res = await api.post(`/mock-interviews/${sessionId}/complete`);
  return res.data.data;
}
