import api from './api.js';

/* ---------------- Student-facing ---------------- */

export async function listCodingProblems(params) {
  const res = await api.get('/coding-problems', { params });
  return res.data.data;
}

export async function getCodingProblem(slug) {
  const res = await api.get(`/coding-problems/${slug}`);
  return res.data.data;
}

/* ---------------- Admin ---------------- */

export async function listCodingProblemsAdmin() {
  const res = await api.get('/coding-problems/admin/all');
  return res.data.data;
}

export async function getCodingProblemAdmin(id) {
  const res = await api.get(`/coding-problems/admin/${id}`);
  return res.data.data;
}

export async function createCodingProblem(payload) {
  const res = await api.post('/coding-problems/admin', payload);
  return res.data.data;
}

export async function updateCodingProblem(id, payload) {
  const res = await api.put(`/coding-problems/admin/${id}`, payload);
  return res.data.data;
}

export async function deleteCodingProblem(id) {
  await api.delete(`/coding-problems/admin/${id}`);
}
