import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listTopicsAdmin, createTopic, updateTopic, deleteTopic } from '../../services/topic.service.js';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'];
const BLANK = { name: '', description: '', category: '', difficulty: 'Mixed', order: 0, icon: '', isActive: true };

/** Admin Topic Management — full CRUD; topics feed the DSA Sheet (Tasks) filters and question tagging. */
export default function ManageTopics() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listTopicsAdmin()
      .then(setTopics)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load topics.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t) => { setEditing(t); setFormOpen(true); };

  const afterSave = (saved) => {
    setTopics((prev) => {
      const exists = prev.some((t) => t._id === saved._id);
      return exists ? prev.map((t) => (t._id === saved._id ? { ...t, ...saved } : t)) : [...prev, saved];
    });
    setFormOpen(false);
  };

  const togglePublish = async (t) => {
    const prev = topics;
    setTopics((p) => p.map((x) => (x._id === t._id ? { ...x, isActive: !x.isActive } : x)));
    setError('');
    try {
      await updateTopic(t._id, { isActive: !t.isActive });
    } catch (err) {
      setTopics(prev);
      setError(err.response?.data?.message || 'Failed to update topic.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this topic? Questions tagged with it will keep their reference, but this cannot be undone.')) return;
    const prev = topics;
    setTopics((p) => p.filter((t) => t._id !== id));
    setError('');
    try {
      await deleteTopic(id);
    } catch (err) {
      setTopics(prev);
      setError(err.response?.data?.message || 'Failed to delete topic.');
    }
  };

  const filtered = topics.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Manage Topics</h2>
        <Button onClick={openCreate} className="w-auto px-4">+ Add Topic</Button>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-5">{topics.length} topics — power the DSA Sheet filters and task tagging</p>
      <ErrorBanner message={error} onRetry={load} />

      {formOpen && <TopicForm initial={editing} onCancel={() => setFormOpen(false)} onSaved={afterSave} />}

      <input
        className="w-full max-w-xs px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none mb-4"
        placeholder="Search topics…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-gray-500 text-sm">Loading topics…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[680px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Order</th><th className="pb-2.5 px-3.5">Name</th><th className="pb-2.5 px-3.5">Category</th>
              <th className="pb-2.5 px-3.5">Difficulty</th><th className="pb-2.5 px-3.5">Related tasks</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t._id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono text-gray-500">{t.order}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold">{t.icon ? `${t.icon} ` : ''}{t.name}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{t.category || '—'}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{t.difficulty}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{t.relatedQuestionCount ?? 0}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${t.isActive ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{t.isActive ? 'published' : 'unpublished'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => openEdit(t)} className="text-primary text-xs font-semibold mr-3 hover:underline">Edit</button>
                    <button onClick={() => togglePublish(t)} className="text-amber-400 text-xs font-semibold mr-3 hover:underline">{t.isActive ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => remove(t._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-gray-500 py-8">No topics found.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function TopicForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial ? { ...initial } : BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Topic name is required.');
    setSaving(true);
    setError('');
    try {
      const saved = initial ? await updateTopic(initial._id, form) : await createTopic(form);
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save topic.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mb-5">
      <h3 className="font-bold text-sm mb-3">{initial ? 'Edit Topic' : 'New Topic'}</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Icon (emoji, optional)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Data Structures" />
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Difficulty</label>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <Input label="Order / sequence" type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 mb-5 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Published (visible to students)
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : 'Save topic'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
