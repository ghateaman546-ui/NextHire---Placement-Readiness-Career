import api from './api.js';

export async function listInterviewQuestions(params) {
  const res = await api.get('/interview-questions', { params });
  return res.data.data;
}

/** Admin: every question incl. disabled ones, with expectedConcepts. */
export async function listInterviewQuestionsAdmin() {
  const res = await api.get('/interview-questions/admin/all');
  return res.data.data;
}

export async function createInterviewQuestion(payload) {
  const res = await api.post('/interview-questions', payload);
  return res.data.data;
}

export async function updateInterviewQuestion(id, payload) {
  const res = await api.put(`/interview-questions/${id}`, payload);
  return res.data.data;
}

export async function deleteInterviewQuestion(id) {
  await api.delete(`/interview-questions/${id}`);
}
