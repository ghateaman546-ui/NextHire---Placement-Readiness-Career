import api from './api.js';

const BLANK_RESUME = {
  summary: '',
  education: [],
  experience: [],
  projects: [],
  skills: [],
};

export function blankResume() {
  return BLANK_RESUME;
}

/** Fetch the user's saved builder resume (most recently updated one), if any. */
export async function getMyBuilderResume() {
  const res = await api.get('/resumes');
  const resumes = res.data.data || [];
  const builder = resumes.find((r) => r.source === 'builder');
  if (!builder) return null;
  return { id: builder._id, ...builder.sections };
}

export async function saveBuilderResume(resume) {
  const res = await api.post('/resumes/builder', { sections: resume });
  return res.data.data;
}

export async function updateBuilderResume(id, resume) {
  const res = await api.put(`/resumes/builder/${id}`, { sections: resume });
  return res.data.data;
}
