import api from './api.js';

const STATUS_TO_UI = { 'not-started': 'todo', attempted: 'attempted', completed: 'done' };
const STATUS_TO_API = { todo: 'not-started', attempted: 'attempted', done: 'completed' };

/** Normalizes a real Question doc (populated topic/companyTags, per-user myState) into the flat
 * row shape the DSA Sheet ("Tasks") UI renders. */
function normalize(q) {
  return {
    id: q._id,
    title: q.title,
    topic: q.topic?.name || '—',
    topicId: q.topic?._id || q.topic,
    companies: (q.companyTags || []).map((c) => (typeof c === 'string' ? c : c.name)),
    difficulty: q.difficulty,
    status: STATUS_TO_UI[q.myState?.status] || 'todo',
    bookmarked: !!q.myState?.isBookmarked,
    notes: q.myState?.notes || '',
    leetcode: q.leetcodeLink || '',
    youtube: q.youtubeSolutionLink || '',
    isActive: q.isActive,
  };
}

/** Student-facing: list tasks/questions with the current user's progress state. */
export async function listQuestions(params) {
  const res = await api.get('/questions', { params });
  return res.data.data.map(normalize);
}

export async function toggleBookmark(id) {
  const res = await api.patch(`/questions/${id}/bookmark`);
  return res.data.data;
}

/** uiStatus: 'todo' | 'attempted' | 'done' */
export async function updateStatus(id, uiStatus) {
  const res = await api.patch(`/questions/${id}/status`, { status: STATUS_TO_API[uiStatus] || uiStatus });
  return res.data.data;
}

export async function saveNotes(id, notes) {
  const res = await api.put(`/questions/${id}/notes`, { notes });
  return res.data.data;
}

/* ---------------- Admin (raw, unnormalized — used by ManageQuestions) ---------------- */

export async function listQuestionsAdmin() {
  const res = await api.get('/questions', { params: { limit: 500 } });
  return res.data.data;
}

export async function getQuestion(id) {
  const res = await api.get(`/questions/${id}`);
  return res.data.data;
}

export async function createQuestion(payload) {
  const res = await api.post('/questions', payload);
  return res.data.data;
}

export async function updateQuestion(id, payload) {
  const res = await api.put(`/questions/${id}`, payload);
  return res.data.data;
}

export async function deleteQuestion(id) {
  await api.delete(`/questions/${id}`);
}
