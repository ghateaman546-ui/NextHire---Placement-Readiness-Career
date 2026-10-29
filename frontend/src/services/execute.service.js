import api from './api.js';

export async function runCode({ language, code, stdin }) {
  const res = await api.post('/execute', { language, code, stdin });
  return res.data.data;
}
