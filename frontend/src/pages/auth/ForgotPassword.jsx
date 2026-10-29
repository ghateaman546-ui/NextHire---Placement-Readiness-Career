import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';
import api from '../../services/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (err) {
      console.warn('[auth] forgot-password endpoint unavailable:', err.message);
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <Card className="w-full max-w-[400px] p-9">
      <h1 className="text-[22px] font-bold mb-1.5">Reset your password</h1>
      <p className="text-gray-400 text-[13.5px] mb-6">Enter your account email and we'll send a reset link.</p>

      {sent ? (
        <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          If an account exists for <b>{email}</b>, a reset link is on its way.
        </div>
      ) : (
        <form onSubmit={submit}>
          <Input label="Email" type="email" placeholder="you@college.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}

      <div className="mt-5 text-center text-[12.5px] text-gray-400">
        <Link to="/login" className="text-primary font-semibold hover:underline">← Back to sign in</Link>
      </div>
    </Card>
  );
}
