import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';

/**
 * Dedicated admin sign-in — uses the same real /auth/login endpoint and
 * AuthContext as the student login. The only difference is that a
 * successful login is rejected here (and the session cleared) unless the
 * account's role is 'admin', so this page can never be used to reach
 * student-only dashboards, and a student account can never bluff its way
 * into /admin through here either.
 */
export default function AdminLogin() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await login(form);
      if (res.data?.role !== 'admin') {
        logout();
        setError('This account does not have admin access.');
        return;
      }
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-[400px] p-9">
      <div className="flex items-center gap-2.5 mb-7">
        <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center font-extrabold text-sm shadow-lg shadow-primary/40">
          NH
        </div>
        <div>
          <div className="font-bold text-sm">NextHire Admin</div>
          <div className="text-[11px] text-gray-400">Platform administration</div>
        </div>
      </div>

      <h1 className="text-[22px] font-bold mb-1.5">Admin sign in</h1>
      <p className="text-gray-400 text-[13.5px] mb-6">Restricted to platform administrators only.</p>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit}>
        <Input label="Admin email" type="email" placeholder="admin@nexthire.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in as admin'}
        </Button>
      </form>

      <div className="mt-5 text-center text-[12.5px] text-gray-400">
        Not an admin? <Link to="/login" className="text-primary font-semibold hover:underline">Go to student login</Link>
      </div>
    </Card>
  );
}
