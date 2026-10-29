import api from './api.js';

/** Platform-wide analytics for AdminDashboard */
export async function getPlatformAnalytics() {
  const res = await api.get('/admin/analytics');
  return res.data.data;
}

/** Students */
export async function listStudents() {
  const res = await api.get('/admin/students');
  return res.data.data;
}

export async function blockStudent(id) {
  const res = await api.patch(`/admin/students/${id}/block`);
  return res.data.data;
}

export async function unblockStudent(id) {
  const res = await api.patch(`/admin/students/${id}/unblock`);
  return res.data.data;
}

export async function deleteStudent(id) {
  await api.delete(`/admin/students/${id}`);
}

/** Full admin detail view of a single student — profile, task progress, quiz attempts, feedback */
export async function getStudentDetail(id) {
  const res = await api.get(`/admin/students/${id}/detail`);
  return res.data.data;
}

/** Notifications (admin broadcast) */
export async function listNotificationsAdmin() {
  const res = await api.get('/admin/notifications');
  return res.data.data;
}

export async function createNotification(payload) {
  const res = await api.post('/admin/notifications', payload);
  return res.data.data;
}

export async function deleteNotification(id) {
  await api.delete(`/admin/notifications/${id}`);
}

/** Companies (admin CRUD) — includes inactive companies, unlike the public list */
export async function listCompaniesAdmin() {
  const res = await api.get('/companies/admin/all');
  return res.data.data;
}

export async function createCompany(payload) {
  const res = await api.post('/companies', payload);
  return res.data.data;
}

export async function updateCompany(id, payload) {
  const res = await api.put(`/companies/${id}`, payload);
  return res.data.data;
}

export async function deleteCompany(id) {
  await api.delete(`/companies/${id}`);
}
