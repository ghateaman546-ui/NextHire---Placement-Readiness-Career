import api from './api.js';

// Parsing a resume can take a few seconds, so give this endpoint more room than the default.
const ANALYZE_TIMEOUT_MS = 60000;

/** Analyze an uploaded resume file (PDF / DOCX / DOC), optionally against a job description. */
export async function analyzeUploadedResume(file, jobDescription = '') {
  const form = new FormData();
  form.append('resume', file);
  if (jobDescription.trim()) form.append('jobDescription', jobDescription.trim());
  const res = await api.post('/ats/analyze', form, { timeout: ANALYZE_TIMEOUT_MS });
  return res.data.data;
}

/** Analyze the user's saved NextHire Resume Builder resume (read server-side — nothing from the builder is sent). */
export async function analyzeBuilderResume(jobDescription = '') {
  const res = await api.post('/ats/analyze', { source: 'builder', jobDescription: jobDescription.trim() }, { timeout: ANALYZE_TIMEOUT_MS });
  return res.data.data;
}

export async function listAtsHistory() {
  const res = await api.get('/ats/history');
  return res.data.data || [];
}

export async function getAtsAnalysis(id) {
  const res = await api.get(`/ats/${id}`);
  return res.data.data;
}

export async function deleteAtsAnalysis(id) {
  await api.delete(`/ats/${id}`);
}

/** Turns an axios error into a message that is safe and useful to show the student. */
export function atsErrorMessage(err, fallback = 'Something went wrong while analyzing your resume. Please try again.') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'The analysis took too long. Please try again, or upload a smaller / simpler file.';
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') return 'Network error — please check your connection and try again.';
  return fallback;
}
