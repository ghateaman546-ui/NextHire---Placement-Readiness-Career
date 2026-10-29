import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import Input from '../../components/common/Input.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import ProgressRing from '../../components/common/ProgressRing.jsx';
import api from '../../services/api.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '', college: user?.college || '', branch: user?.branch || '',
    year: user?.year || '', cgpa: user?.cgpa || '', linkedin: user?.linkedin || '', github: user?.github || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.put('/users/profile', form);
      setUser(res.data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Profile</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Keep this up to date — it feeds your resume and dashboard.</p>

      <div className="grid lg:grid-cols-[1fr_260px] gap-5">
        <Card className="p-6">
          <ErrorBanner message={error} />
          <form onSubmit={save}>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="College" value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} />
              <Input label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
              <Input label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              <Input label="CGPA" type="number" step="0.1" value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: e.target.value })} />
              <Input label="LinkedIn URL" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
              <Input label="GitHub URL" value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} />
            </div>
            <Button type="submit" disabled={saving} className="w-auto px-6 mt-1">
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 text-center">
          <ProgressRing percent={user?.profileCompletionPercent ?? 0} size={110} label="COMPLETE" />
          <p className="text-xs text-gray-400 mt-4">Add your GitHub and LinkedIn links to boost profile completion.</p>
        </Card>
      </div>
    </div>
  );
}
