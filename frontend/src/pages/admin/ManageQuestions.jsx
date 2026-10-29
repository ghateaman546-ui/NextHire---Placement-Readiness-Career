import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge } from '../../components/common/Badge.jsx';
import { listQuestionsAdmin, createQuestion, updateQuestion, deleteQuestion } from '../../services/question.service.js';
import { listTopicsAdmin } from '../../services/topic.service.js';
import { listCompaniesAdmin } from '../../services/admin.service.js';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

const BLANK = { title: '', difficulty: 'Easy', topic: '', companyTags: [], leetcodeLink: '', youtubeSolutionLink: '', problemStatement: '', isActive: true };

/**
 * Admin "Tasks" management — full CRUD over the DSA Question bank that
 * powers the student DSA Sheet: create, edit, delete, view, publish/unpublish.
 */
export default function ManageQuestions() {
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // question object or null (create mode)

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([listQuestionsAdmin(), listTopicsAdmin(), listCompaniesAdmin()])
      .then(([qs, ts, cs]) => { setQuestions(qs); setTopics(ts); setCompanies(cs); })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load tasks.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (q) => { setEditing(q); setFormOpen(true); };
  const closeForm = () => setFormOpen(false);

  const afterSave = (saved) => {
    setQuestions((prev) => {
      const exists = prev.some((q) => q._id === saved._id);
      return exists ? prev.map((q) => (q._id === saved._id ? saved : q)) : [saved, ...prev];
    });
    setFormOpen(false);
  };

  const togglePublish = async (q) => {
    const prev = questions;
    setQuestions((p) => p.map((x) => (x._id === q._id ? { ...x, isActive: !x.isActive } : x)));
    setError('');
    try {
      await updateQuestion(q._id, { isActive: !q.isActive });
    } catch (err) {
      setQuestions(prev);
      setError(err.response?.data?.message || 'Failed to update task.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    const prev = questions;
    setQuestions((p) => p.filter((q) => q._id !== id));
    setError('');
    try {
      await deleteQuestion(id);
    } catch (err) {
      setQuestions(prev);
      setError(err.response?.data?.message || 'Failed to delete task.');
    }
  };

  const topicName = (t) => (typeof t === 'object' ? t?.name : topics.find((x) => x._id === t)?.name) || '—';
  const companyNames = (tags) => (tags || []).map((c) => (typeof c === 'object' ? c.name : companies.find((x) => x._id === c)?.name)).filter(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Manage Tasks</h2>
        <Button onClick={openCreate} className="w-auto px-4">+ Add Task</Button>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-5">{questions.length} tasks in the DSA bank</p>
      <ErrorBanner message={error} onRetry={load} />

      {formOpen && (
        <QuestionForm
          initial={editing}
          topics={topics}
          companies={companies}
          onCancel={closeForm}
          onSaved={afterSave}
        />
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading tasks…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[720px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Title</th><th className="pb-2.5 px-3.5">Topic</th><th className="pb-2.5 px-3.5">Companies</th>
              <th className="pb-2.5 px-3.5">Difficulty</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q._id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold">{q.title}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{topicName(q.topic)}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{companyNames(q.companyTags).join(', ') || '—'}</td>
                  <td className="py-3 px-3.5 border-t border-white/10"><DifficultyBadge level={q.difficulty} /></td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${q.isActive ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{q.isActive ? 'published' : 'unpublished'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => openEdit(q)} className="text-primary text-xs font-semibold mr-3 hover:underline">Edit</button>
                    <button onClick={() => togglePublish(q)} className="text-amber-400 text-xs font-semibold mr-3 hover:underline">{q.isActive ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => remove(q._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {questions.length === 0 && <tr><td colSpan={6} className="text-center text-gray-500 py-8">No tasks yet — add your first one.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function QuestionForm({ initial, topics, companies, onCancel, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          title: initial.title,
          difficulty: initial.difficulty,
          topic: typeof initial.topic === 'object' ? initial.topic._id : initial.topic,
          companyTags: (initial.companyTags || []).map((c) => (typeof c === 'object' ? c._id : c)),
          leetcodeLink: initial.leetcodeLink || '',
          youtubeSolutionLink: initial.youtubeSolutionLink || '',
          problemStatement: initial.problemStatement || '',
          isActive: initial.isActive,
        }
      : { ...BLANK, topic: topics[0]?._id || '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleCompany = (id) => {
    setForm((f) => ({
      ...f,
      companyTags: f.companyTags.includes(id) ? f.companyTags.filter((c) => c !== id) : [...f.companyTags, id],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.topic) {
      setError('Title and topic are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = initial ? await updateQuestion(initial._id, form) : await createQuestion(form);
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mb-5">
      <h3 className="font-bold text-sm mb-3">{initial ? 'Edit Task' : 'New Task'}</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />

        <div className="grid sm:grid-cols-2 gap-x-4">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Difficulty</label>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Topic</label>
            <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {topics.length === 0 && <option value="">No topics yet</option>}
              {topics.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Company tags</label>
          <div className="flex flex-wrap gap-1.5">
            {companies.map((c) => (
              <button
                type="button"
                key={c._id}
                onClick={() => toggleCompany(c._id)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${form.companyTags.includes(c._id) ? 'bg-primary text-white' : 'bg-white/[0.06] text-gray-400'}`}
              >
                {c.name}
              </button>
            ))}
            {companies.length === 0 && <span className="text-xs text-gray-500">No companies yet.</span>}
          </div>
        </div>

        <Input label="LeetCode link" value={form.leetcodeLink} onChange={(e) => setForm({ ...form, leetcodeLink: e.target.value })} />
        <Input label="YouTube solution link" value={form.youtubeSolutionLink} onChange={(e) => setForm({ ...form, youtubeSolutionLink: e.target.value })} />

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Problem statement</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[90px]" value={form.problemStatement} onChange={(e) => setForm({ ...form, problemStatement: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 mb-5 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Published (visible to students)
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : 'Save task'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
