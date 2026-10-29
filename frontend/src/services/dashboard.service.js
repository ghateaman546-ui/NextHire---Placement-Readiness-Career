import api from './api.js';

/** Powers the student Dashboard stat cards and profile snapshot */
export async function getSummary() {
  const res = await api.get('/dashboard/summary');
  return res.data.data;
}

/** Last-7-day bar chart of questions solved */
export async function getWeeklyProgress() {
  const res = await api.get('/dashboard/progress/weekly');
  return (res.data.data || []).map((d) => ({
    label: new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' }),
    value: d.questionsSolved || 0,
  }));
}

/** This-month bar chart of study hours */
export async function getMonthlyProgress() {
  const res = await api.get('/dashboard/progress/monthly');
  return (res.data.data || []).map((d) => ({
    label: new Date(d.date).getDate().toString(),
    value: d.studyHours || 0,
  }));
}

/** Skill/achievement progress */
export async function getAchievements() {
  const res = await api.get('/dashboard/skills');
  return res.data.data || [];
}
