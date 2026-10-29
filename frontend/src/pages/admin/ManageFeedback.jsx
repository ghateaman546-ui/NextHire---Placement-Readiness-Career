import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { Tag } from '../../components/common/Badge.jsx';
import { listFeedbackAdmin, updateFeedbackStatus, deleteFeedback } from '../../services/feedback.service.js';

const CATEGORY_LABELS = { general: 'General', bug: 'Bug report', 'feature-request': 'Feature request', content: 'Content issue' };
const STATUSES = ['new', 'reviewed', 'resolved'];
const statusStyles = {
  new: 'bg-white/10 text-gray-400',
  reviewed: 'bg-amber-500/15 text-amber-400',
  resolved: 'bg-green-500/15 text-green-400',
};

export default function ManageFeedback() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    setLoading(true);
    setError('');
    listFeedbackAdmin()
      .then(setFeedback)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load feedback.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changeStatus = async (id, status) => {
    const prev = feedback;
    setFeedback((p) => p.map((f) => (f._id === id ? { ...f, status } : f)));
    setError('');
    try {
      await updateFeedbackStatus(id, status);
    } catch (err) {
      setFeedback(prev);
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this feedback? This cannot be undone.')) return;
    const prev = feedback;
    setFeedback((p) => p.filter((f) => f._id !== id));
    setError('');
    try {
      await deleteFeedback(id);
    } catch (err) {
      setFeedback(prev);
      setError(err.response?.data?.message || 'Failed to delete feedback.');
    }
  };

  const filtered = statusFilter === 'all' ? feedback : feedback.filter((f) => f.status === statusFilter);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">User Feedback</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">{feedback.length} submissions</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex gap-2 mb-4">
        {['all', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${statusFilter === s ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading feedback…</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <Card key={f._id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="font-semibold text-[13px]">{f.name}</span>
                    <span className="text-gray-500 text-xs">{f.email}</span>
                    <Tag>{CATEGORY_LABELS[f.category] || f.category}</Tag>
                    {f.rating && <span className="text-[11px] text-amber-400">{'★'.repeat(f.rating)}</span>}
                  </div>
                  <p className="text-[13.5px] text-gray-200 max-w-2xl">{f.message}</p>
                  <p className="text-[11px] text-gray-500 mt-1.5">{new Date(f.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={f.status}
                    onChange={(e) => changeStatus(f._id, e.target.value)}
                    className={`text-[11px] px-2 py-1.5 rounded-lg font-semibold capitalize border-0 outline-none ${statusStyles[f.status]}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => remove(f._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-gray-500 text-sm">No feedback in this category yet.</p>}
        </div>
      )}
    </div>
  );
}
