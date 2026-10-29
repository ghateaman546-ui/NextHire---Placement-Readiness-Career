import api from './api.js';

export async function submitFeedback(payload) {
  const res = await api.post('/feedback', payload);
  return res.data.data;
}

export async function listMyFeedback() {
  const res = await api.get('/feedback');
  return res.data.data;
}

/* ---------------- Admin ---------------- */

export async function listFeedbackAdmin(params) {
  const res = await api.get('/feedback/admin', { params });
  return res.data.data;
}

export async function updateFeedbackStatus(id, status) {
  const res = await api.patch(`/feedback/${id}/status`, { status });
  return res.data.data;
}

export async function deleteFeedback(id) {
  await api.delete(`/feedback/${id}`);
}
