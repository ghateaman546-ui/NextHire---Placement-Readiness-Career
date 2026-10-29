import axios from 'axios';

/**
 * Token storage is per-tab first (sessionStorage), with localStorage as the
 * shared fallback for new tabs / page restarts. This stops an admin tab from
 * silently picking up a student token when someone signs in on another tab
 * (the cause of "Insufficient permissions" with empty data).
 */
export const tokenStore = {
  get: () => sessionStorage.getItem('token') || localStorage.getItem('token'),
  set: (t) => {
    sessionStorage.setItem('token', t);
    localStorage.setItem('token', t);
  },
  clear: () => {
    const mine = sessionStorage.getItem('token');
    sessionStorage.removeItem('token');
    if (!mine || localStorage.getItem('token') === mine) localStorage.removeItem('token');
  },
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      tokenStore.clear();
    }
    return Promise.reject(err);
  }
);

export default api;
