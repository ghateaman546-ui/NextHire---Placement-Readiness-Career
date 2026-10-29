import api from './api.js';

/** Student: notifications addressed to me plus admin broadcasts (stored in the database). */
export async function listMyNotifications() {
  const res = await api.get('/notifications');
  return res.data.data;
}

/** Marks my personal notifications as read (admin broadcasts are shared, so they're not touched). */
export async function markAllMyNotificationsRead() {
  await api.patch('/notifications/read-all');
}
