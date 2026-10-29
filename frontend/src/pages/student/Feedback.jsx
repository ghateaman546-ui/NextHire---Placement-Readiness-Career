import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import StarRating from '../../components/common/StarRating.jsx';
import { Tag } from '../../components/common/Badge.jsx';
import { submitFeedback, listMyFeedback } from '../../services/feedback.service.js';

const CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'bug', label: 'Bug report' },
  { key: 'feature-request', label: 'Feature request' },
  { key: 'content', label: 'Content issue' },
];

const statusStyles = {
  new: 'bg-white/10 text-gray-400',
  reviewed: 'bg-amber-500/15 text-amber-400',
  resolved: 'bg-green-500/15 text-green-400',
};

export default function Feedback() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [category, setCategory] = useState('general');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError('');
    listMyFeedback()
      .then(setHistory)
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load your feedback history.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setSubmitError('Please write a message before submitting.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const created = await submitFeedback({ category, rating: rating || undefined, message: message.trim() });
      setHistory((prev) => [created, ...prev]);
      setMessage('');
      setRating(0);
      setCategory('general');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Feedback</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">Report bugs, request features, or tell us what's working (and what isn't).</p>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
        <Card className="p-5">
          <ErrorBanner message={submitError} />
          <form onSubmit={submit}>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`text-[11.5px] px-3 py-1.5 rounded-full font-semibold ${category === c.key ? 'bg-primary text-white' : 'bg-white/[0.06] text-gray-400'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <StarRating label="Overall rating (optional)" value={rating} onChange={setRating} />

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Message</label>
              <textarea
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[130px]"
                placeholder="Tell us what happened, what you'd like to see, or how we can improve…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-auto px-6">
              {submitting ? 'Submitting…' : submitted ? 'Submitted ✓' : 'Submit feedback'}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Your feedback history</h3>
          <ErrorBanner message={loadError} onRetry={load} />
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : (
            <div className="space-y-3">
              {history.map((f) => (
                <div key={f._id} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Tag>{CATEGORIES.find((c) => c.key === f.category)?.label || f.category}</Tag>
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold capitalize ${statusStyles[f.status]}`}>{f.status}</span>
                    {f.rating && <span className="text-[11px] text-amber-400">{'★'.repeat(f.rating)}</span>}
                  </div>
                  <p className="text-[13px] text-gray-300">{f.message}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{new Date(f.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
              {history.length === 0 && <p className="text-gray-500 text-sm">You haven't submitted any feedback yet.</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
