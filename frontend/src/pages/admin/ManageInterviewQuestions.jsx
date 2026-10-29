import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge } from '../../components/common/Badge.jsx';
import {
  listInterviewQuestionsAdmin,
  createInterviewQuestion,
  updateInterviewQuestion,
  deleteInterviewQuestion,
} from '../../services/interviewQuestion.service.js';

const CATEGORIES = [
  { value: 'hr', label: 'HR' }, { value: 'technical', label: 'Technical' },
  { value: 'behavioral', label: 'Behavioral' }, { value: 'company-specific', label: 'Company-specific' },
];
const SUBJECTS = ['General', 'OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const PAGE_SIZE = 25;

const BLANK = { question: '', category: 'hr', subject: 'General', difficulty: 'Easy', expectedConcepts: '', answer: '', isActive: true };
const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label || v;
const selectCls = 'w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none';

/**
 * Admin management of the interview question bank that powers the AI Mock Interview:
 * add / edit / delete / enable-disable, with the expected core concepts the AI grades against.
 */
export default function ManageInterviewQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = () => {
    setLoading(true);
    setError('');
    listInterviewQuestionsAdmin()
      .then(setQuestions)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load interview questions.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => setVisible(PAGE_SIZE), [categoryFilter, search]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => (categoryFilter === 'all' || q.category === categoryFilter) && (!term || q.question.toLowerCase().includes(term)));
  }, [questions, categoryFilter, search]);

  const activeCount = questions.filter((q) => q.isActive).length;

  const afterSave = (saved) => {
    setQuestions((prev) => (prev.some((q) => q._id === saved._id) ? prev.map((q) => (q._id === saved._id ? saved : q)) : [saved, ...prev]));
    setFormOpen(false);
  };

  const toggleActive = async (q) => {
    const prev = questions;
    setQuestions((p) => p.map((x) => (x._id === q._id ? { ...x, isActive: !x.isActive } : x)));
    setError('');
    try {
      await updateInterviewQuestion(q._id, { isActive: !q.isActive });
    } catch (err) {
      setQuestions(prev);
      setError(err.response?.data?.message || 'Failed to update question.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this interview question? This cannot be undone.')) return;
    const prev = questions;
    setQuestions((p) => p.filter((q) => q._id !== id));
    setError('');
    try {
      await deleteInterviewQuestion(id);
    } catch (err) {
      setQuestions(prev);
      setError(err.response?.data?.message || 'Failed to delete question.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold">Interview Questions</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="w-auto px-4">+ Add Question</Button>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-5">{questions.length} questions · {activeCount} enabled — the AI Mock Interview draws only from enabled questions</p>
      <ErrorBanner message={error} onRetry={load} />

      {formOpen && <QuestionForm initial={editing} onCancel={() => setFormOpen(false)} onSaved={afterSave} />}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none focus:border-primary/60"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading questions…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[760px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Question</th><th className="pb-2.5 px-3.5">Category</th><th className="pb-2.5 px-3.5">Subject</th>
              <th className="pb-2.5 px-3.5">Difficulty</th><th className="pb-2.5 px-3.5">Concepts</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, visible).map((q) => (
                <tr key={q._id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold max-w-[320px]">{q.question}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{categoryLabel(q.category)}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{q.subject}</td>
                  <td className="py-3 px-3.5 border-t border-white/10"><DifficultyBadge level={q.difficulty} /></td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{q.expectedConcepts?.length ? q.expectedConcepts.length : <span className="text-gray-600" title="Uses the model answer for grading">—</span>}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${q.isActive ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{q.isActive ? 'enabled' : 'disabled'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => { setEditing(q); setFormOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-primary text-xs font-semibold mr-3 hover:underline">Edit</button>
                    <button onClick={() => toggleActive(q)} className="text-amber-400 text-xs font-semibold mr-3 hover:underline">{q.isActive ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => remove(q._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-gray-500 py-8">{questions.length === 0 ? 'No interview questions yet — add your first one.' : 'No questions match your filters.'}</td></tr>}
            </tbody>
          </table>
          {filtered.length > visible && (
            <div className="text-center py-3 border-t border-white/10">
              <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="text-primary text-xs font-semibold hover:underline">Show more ({filtered.length - visible} remaining)</button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function QuestionForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          question: initial.question,
          category: initial.category,
          subject: initial.subject || 'General',
          difficulty: initial.difficulty || 'Medium',
          expectedConcepts: (initial.expectedConcepts || []).join('\n'),
          answer: initial.answer || '',
          isActive: initial.isActive,
        }
      : { ...BLANK }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const conceptList = form.expectedConcepts.split('\n').map((c) => c.trim()).filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.question.trim()) return setError('Question text is required.');
    if (conceptList.length === 0) return setError('Add at least one expected core concept (one per line).');
    setSaving(true);
    setError('');
    // Model answer is required by the existing question model; default it to the concepts so admins only fill in what grading needs.
    const payload = { ...form, question: form.question.trim(), expectedConcepts: conceptList, answer: form.answer.trim() || conceptList.join('; ') };
    try {
      const saved = initial ? await updateInterviewQuestion(initial._id, payload) : await createInterviewQuestion(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const textareaCls = 'w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y';
  return (
    <Card className="p-5 mb-5">
      <h3 className="font-bold text-sm mb-3">{initial ? 'Edit Question' : 'New Question'}</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Question</label>
          <textarea className={`${textareaCls} min-h-[70px]`} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="e.g. What is polymorphism in object-oriented programming?" required />
        </div>

        <div className="grid sm:grid-cols-3 gap-x-4">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={selectCls}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Subject</label>
            <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={selectCls}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Difficulty</label>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className={selectCls}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Expected core concepts <span className="text-gray-500 font-normal">(one per line — the AI grades answers against these; students never see them)</span></label>
          <textarea className={`${textareaCls} min-h-[110px]`} value={form.expectedConcepts} onChange={(e) => setForm({ ...form, expectedConcepts: e.target.value })} placeholder={'Educational background\nRelevant experience\nTechnical skills\nCareer goals'} />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Model answer <span className="text-gray-500 font-normal">(optional — shown to students in Interview Prep; defaults to the concepts)</span></label>
          <textarea className={`${textareaCls} min-h-[70px]`} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 mb-5 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Enabled (can be asked in mock interviews)
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : 'Save question'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
