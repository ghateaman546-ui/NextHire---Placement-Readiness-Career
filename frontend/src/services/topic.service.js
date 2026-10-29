import api from './api.js';

/** Student-facing: published topics only */
export async function listTopics() {
  const res = await api.get('/topics');
  return res.data.data;
}

/** Admin: every topic, including unpublished, with related question counts */
export async function listTopicsAdmin() {
  const res = await api.get('/topics/admin/all');
  return res.data.data;
}

export async function createTopic(payload) {
  const res = await api.post('/topics', payload);
  return res.data.data;
}

export async function updateTopic(id, payload) {
  const res = await api.put(`/topics/${id}`, payload);
  return res.data.data;
}

export async function deleteTopic(id) {
  await api.delete(`/topics/${id}`);
}
