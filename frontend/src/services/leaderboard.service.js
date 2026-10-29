import api from './api.js';

/** Normalizes the real Leaderboard document shape into the row shape the UI renders. */
function normalize(entry, index) {
  return {
    rank: index + 1,
    name: entry.userId?.name || 'Anonymous',
    college: entry.userId?.college || '',
    points: entry.totalPoints ?? entry.weeklyPoints ?? entry.monthlyPoints ?? 0,
  };
}

export async function getLeaderboard(range = 'all-time') {
  const res = await api.get('/leaderboard', { params: { range } });
  return (res.data.data || []).map(normalize);
}

export async function getMyRank() {
  const res = await api.get('/leaderboard/me');
  return res.data.data;
}
