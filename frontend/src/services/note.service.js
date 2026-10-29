import api from './api.js';

export async function listNotes() {
  const res = await api.get('/notes');
  return res.data.data;
}

export async function createNote(payload) {
  const res = await api.post('/notes', payload);
  return res.data.data;
}

export async function updateNote(id, payload) {
  const res = await api.put(`/notes/${id}`, payload);
  return res.data.data;
}

export async function togglePin(id) {
  const res = await api.patch(`/notes/${id}/pin`);
  return res.data.data;
}

export async function deleteNote(id) {
  await api.delete(`/notes/${id}`);
}
