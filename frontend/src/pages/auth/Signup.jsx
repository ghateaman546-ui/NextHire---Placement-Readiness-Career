import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', college: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signup(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-[420px] p-9">
      <h1 className="text-[22px] font-bold mb-1.5">Create your NextHire account</h1>
      <p className="text-gray-400 text-[13.5px] mb-6">Start tracking your placement prep in one place.</p>

      <form onSubmit={handleSubmit}>
        <Input label="Full name" placeholder="Ananya Sharma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="College email" type="email" placeholder="you@college.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input label="College" placeholder="VIT Vellore" value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} />
        <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <div className="mt-5 text-center text-[12.5px] text-gray-400">
        Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
      </div>
    </Card>
  );
}
