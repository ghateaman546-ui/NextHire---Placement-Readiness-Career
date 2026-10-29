import api from './api.js';

/** Peer mock interview scheduler + evaluation feedback */
export async function listAvailableSlots() {
  const res = await api.get('/peer-mock-interviews/available');
  return res.data.data;
}

export async function listMySessions() {
  const res = await api.get('/peer-mock-interviews/my');
  return res.data.data;
}

export async function scheduleSlot(payload) {
  const res = await api.post('/peer-mock-interviews', payload);
  return res.data.data;
}

export async function joinSlot(id) {
  const res = await api.post(`/peer-mock-interviews/${id}/join`);
  return res.data.data;
}

export async function completePeerSession(id) {
  const res = await api.post(`/peer-mock-interviews/${id}/complete`);
  return res.data.data;
}

export async function cancelSlot(id) {
  const res = await api.post(`/peer-mock-interviews/${id}/cancel`);
  return res.data.data;
}

export async function submitPeerFeedback(id, feedback) {
  const res = await api.post(`/peer-mock-interviews/${id}/feedback`, feedback);
  return res.data.data;
}

/**
 * Fetches the real meeting link + live status for a session — the only
 * endpoint that ever returns a meeting URL, and only to a participant of
 * that exact session. Called fresh each time "Join Meeting" is clicked so
 * cancellation/auth are re-checked at the moment of joining, not just when
 * the page first loaded.
 */
export async function getMeetingDetails(id) {
  const res = await api.get(`/peer-mock-interviews/${id}/meeting`);
  return res.data.data;
}
