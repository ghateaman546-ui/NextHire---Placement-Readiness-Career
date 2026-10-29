import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listNotificationsAdmin, createNotification, deleteNotification } from '../../services/admin.service.js';

const TYPES = ['general', 'daily-goal', 'quiz-reminder', 'interview-reminder', 'placement-update', 'company-visit'];

/** Admin Notifications — broadcast an announcement to all students (userId left null on the backend = global). */
export default function ManageNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'general', title: '', message: '', link: '' });
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    listNotificationsAdmin()
      .then(setNotifications)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load notifications.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return setError('Title and message are required.');
    setSending(true);
    setError('');
    try {
      const created = await createNotification(form);
      setNotifications((prev) => [created, ...prev]);
      setForm({ type: 'general', title: '', message: '', link: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    const prev = notifications;
    setNotifications((list) => list.filter((n) => n._id !== id));
    setError('');
    try {
      await deleteNotification(id);
    } catch (err) {
      setNotifications(prev);
      setError(err.response?.data?.message || 'Failed to delete notification.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Notifications</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Broadcast announcements to all students</p>
      <ErrorBanner message={error} onRetry={load} />

      <Card className="p-5 mb-5">
        <form onSubmit={send}>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Input label="Link (optional)" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/companies" />
          </div>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Message</label>
            <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[80px]" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <Button type="submit" disabled={sending} className="w-auto px-6">{sending ? 'Sending…' : 'Send to all students'}</Button>
        </form>
      </Card>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading notifications…</p>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <Card key={n._id} className="p-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10.5px] bg-secondary/20 text-indigo-300 px-2 py-0.5 rounded-md">{n.type}</span>
                  <span className="text-[11px] text-gray-500">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p className="font-semibold text-[13.5px]">{n.title}</p>
                <p className="text-gray-400 text-[13px]">{n.message}</p>
              </div>
              <button onClick={() => remove(n._id)} className="text-red-400 text-xs font-semibold hover:underline whitespace-nowrap">Delete</button>
            </Card>
          ))}
          {notifications.length === 0 && <p className="text-gray-500 text-sm">No notifications sent yet.</p>}
        </div>
      )}
    </div>
  );
}
