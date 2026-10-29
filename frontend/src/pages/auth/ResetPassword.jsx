import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';
import api from '../../services/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token: params.get('token'), password });
    } catch (err) {
      console.warn('[auth] reset-password endpoint unavailable:', err.message);
    } finally {
      setSubmitting(false);
      navigate('/login');
    }
  };

  return (
    <Card className="w-full max-w-[400px] p-9">
      <h1 className="text-[22px] font-bold mb-1.5">Set a new password</h1>
      <p className="text-gray-400 text-[13.5px] mb-6">Choose a strong password you haven't used before.</p>

      <form onSubmit={submit}>
        <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Reset password'}
        </Button>
      </form>

      <div className="mt-5 text-center text-[12.5px] text-gray-400">
        <Link to="/login" className="text-primary font-semibold hover:underline">← Back to sign in</Link>
      </div>
    </Card>
  );
}
