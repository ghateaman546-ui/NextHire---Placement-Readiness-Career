import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';

export default function Login() {
  const { login } = useAuth();
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
      navigate(res.data?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-[400px] p-9">
      <div className="flex items-center gap-2.5 mb-7">
        <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-extrabold text-sm shadow-lg shadow-primary/40">
          NH
        </div>
        <div>
          <div className="font-bold text-sm">NextHire</div>
          <div className="text-[11px] text-gray-400">Placement Readiness & Career</div>
        </div>
      </div>

      <h1 className="text-[22px] font-bold mb-1.5">Welcome back</h1>
      <p className="text-gray-400 text-[13.5px] mb-6">Sign in to continue your placement prep journey.</p>

      <form onSubmit={handleSubmit}>
        <Input label="Email" type="email" placeholder="you@college.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-3 text-right">
        <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
      </div>

      <div className="mt-5 text-center text-[12.5px] text-gray-400">
        No account? <Link to="/signup" className="text-primary font-semibold hover:underline">Create one</Link>
      </div>

      <div className="mt-2 text-center text-[11.5px] text-gray-500">
        <Link to="/admin/login" className="hover:text-gray-300 hover:underline">Admin sign in →</Link>
      </div>

    </Card>
  );
}
