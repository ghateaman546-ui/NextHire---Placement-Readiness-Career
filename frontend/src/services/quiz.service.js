import api from './api.js';

/* ---------------- Student-facing ---------------- */

/** Aptitude quizzes (category != 'Technical') */
export async function listAptitudeQuizzes(difficulty) {
  const res = await api.get('/quizzes', { params: { difficulty } });
  return res.data.data.filter((q) => q.category !== 'Technical');
}

/** Domain-wise technical quiz modules */
export async function listTechnicalQuizzes(subject, difficulty) {
  const res = await api.get('/quizzes', { params: { category: 'Technical', subject, difficulty } });
  return res.data.data;
}

export async function getQuiz(id) {
  const res = await api.get(`/quizzes/${id}`);
  return res.data.data;
}

export async function submitQuiz(id, answers, timeTakenSeconds) {
  const res = await api.post(`/quizzes/${id}/submit`, { answers, timeTakenSeconds });
  return res.data.data;
}

export async function getQuizLeaderboard(id) {
  const res = await api.get(`/quizzes/${id}/leaderboard`);
  return res.data.data;
}

/* ---------------- Admin (Manage Quizzes) ---------------- */

export async function listQuizzesAdmin() {
  const res = await api.get('/quizzes/manage/list');
  return res.data.data;
}

export async function getQuizAdmin(id) {
  const res = await api.get(`/quizzes/manage/${id}`);
  return res.data.data;
}

export async function createQuiz(payload) {
  const res = await api.post('/quizzes', payload);
  return res.data.data;
}

export async function updateQuiz(id, payload) {
  const res = await api.put(`/quizzes/${id}`, payload);
  return res.data.data;
}

export async function deleteQuiz(id) {
  await api.delete(`/quizzes/${id}`);
}

/** Attempt stats + individual attempts for one quiz */
export async function getQuizStatsAdmin(id) {
  const res = await api.get(`/quizzes/manage/${id}/stats`);
  return res.data.data;
}
