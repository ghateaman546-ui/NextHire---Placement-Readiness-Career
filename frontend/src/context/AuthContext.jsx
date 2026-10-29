import { createContext, useContext, useState, useEffect } from 'react';
import api, { tokenStore } from '../services/api';

const AuthContext = createContext(null);

/**
 * Real authentication only. login()/signup() call the backend; on failure
 * they throw so the calling form can show the actual error message. There
 * is no local/demo session fallback — a failed request must fail visibly.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.get();
    if (token) sessionStorage.setItem('token', token);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    try {
      const res = await api.post('/auth/login', credentials);
      tokenStore.set(res.data.token);
      setUser(res.data.data);
      return res.data;
    } catch (err) {
      console.error('[login] request failed:', err);
      if (!err.response) {
        // The request never got a response — the API is unreachable, CORS blocked it,
        // or the wrong URL is configured. This is a setup problem, not bad credentials.
        throw new Error('Cannot reach the server. Check that the backend is running and VITE_API_BASE_URL is correct.');
      }
      throw new Error(err.response?.data?.message || 'Unable to sign in. Please try again.');
    }
  };

  const signup = async (payload) => {
    try {
      const res = await api.post('/auth/signup', payload);
      tokenStore.set(res.data.token);
      setUser(res.data.data);
      return res.data;
    } catch (err) {
      console.error('[signup] request failed:', err);
      if (!err.response) {
        throw new Error('Cannot reach the server. Check that the backend is running and VITE_API_BASE_URL is correct.');
      }
      throw new Error(err.response?.data?.message || 'Unable to create your account. Please try again.');
    }
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.data);
    } catch {
      /* ignore — /auth/me failures are handled by the axios 401 interceptor */
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, signup, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
