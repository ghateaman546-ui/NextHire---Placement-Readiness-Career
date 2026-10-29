import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge } from '../../components/common/Badge.jsx';
import {
  listCodingProblemsAdmin, getCodingProblemAdmin, createCodingProblem, updateCodingProblem, deleteCodingProblem,
} from '../../services/codingProblem.service.js';
import { listTopicsAdmin } from '../../services/topic.service.js';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const LANGUAGES = ['JavaScript', 'Python', 'C++', 'Java'];

const BLANK = () => ({
  title: '', difficulty: 'Easy', topic: '', description: '', inputFormat: '', outputFormat: '', constraints: '',
  examples: [{ input: '', output: '', explanation: '' }],
  testCases: [{ input: '', expectedOutput: '', isHidden: false }],
  supportedLanguages: [...LANGUAGES],
  starterCode: { JavaScript: '', Python: '', 'C++': '', Java: '' },
  isActive: true,
});

/**
 * Admin Coding Problem management — a bank of practice problems that
 * appear in the student "Coding Problems" section. Submissions are graded
 * by running the student's code against these test cases through the same
 * sandboxed Piston executor that powers the Playground.
 */
export default function ManageCodingProblems() {
  const [problems, setProblems] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingProblem, setEditingProblem] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([listCodingProblemsAdmin(), listTopicsAdmin()])
      .then(([p, t]) => { setProblems(p); setTopics(t); })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load coding problems.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditingId(null); setEditingProblem(BLANK()); setFormOpen(true); };

  const openEdit = async (id) => {
    setFormOpen(true);
    setEditingId(id);
    setFormLoading(true);
    setError('');
    try {
      const full = await getCodingProblemAdmin(id);
      setEditingProblem({ ...full, topic: full.topic?._id || full.topic || '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load this problem.');
      setFormOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const afterSave = (saved) => {
    setProblems((prev) => {
      const exists = prev.some((p) => p._id === saved._id);
      return exists ? prev.map((p) => (p._id === saved._id ? saved : p)) : [saved, ...prev];
    });
    setFormOpen(false);
  };

  const togglePublish = async (p) => {
    const prev = problems;
    setProblems((list) => list.map((x) => (x._id === p._id ? { ...x, isActive: !x.isActive } : x)));
    setError('');
    try {
      await updateCodingProblem(p._id, { isActive: !p.isActive });
    } catch (err) {
      setProblems(prev);
      setError(err.response?.data?.message || 'Failed to update problem.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this coding problem? This cannot be undone.')) return;
    const prev = problems;
    setProblems((list) => list.filter((p) => p._id !== id));
    setError('');
    try {
      await deleteCodingProblem(id);
    } catch (err) {
      setProblems(prev);
      setError(err.response?.data?.message || 'Failed to delete problem.');
    }
  };

  const topicName = (t) => (typeof t === 'object' ? t?.name : topics.find((x) => x._id === t)?.name) || '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Manage Coding Problems</h2>
        <Button onClick={openCreate} className="w-auto px-4">+ Add Problem</Button>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-5">{problems.length} problems in the practice bank</p>
      <ErrorBanner message={error} onRetry={load} />

      {formOpen && (
        formLoading ? (
          <Card className="p-5 mb-5"><p className="text-gray-500 text-sm">Loading problem…</p></Card>
        ) : (
          <ProblemForm key={editingId || 'new'} initial={editingProblem} isEdit={!!editingId} topics={topics} onCancel={() => setFormOpen(false)} onSaved={afterSave} />
        )
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading problems…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[700px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Title</th><th className="pb-2.5 px-3.5">Topic</th><th className="pb-2.5 px-3.5">Difficulty</th>
              <th className="pb-2.5 px-3.5">Test cases</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p._id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold">{p.title}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{topicName(p.topic)}</td>
                  <td className="py-3 px-3.5 border-t border-white/10"><DifficultyBadge level={p.difficulty} /></td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{p.testCases?.length ?? 0}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${p.isActive ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{p.isActive ? 'published' : 'unpublished'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => openEdit(p._id)} className="text-primary text-xs font-semibold mr-3 hover:underline">Edit</button>
                    <button onClick={() => togglePublish(p)} className="text-amber-400 text-xs font-semibold mr-3 hover:underline">{p.isActive ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => remove(p._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {problems.length === 0 && <tr><td colSpan={6} className="text-center text-gray-500 py-8">No coding problems yet — add your first one.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ProblemForm({ initial, isEdit, topics, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleLanguage = (lang) => {
    setForm((f) => ({
      ...f,
      supportedLanguages: f.supportedLanguages.includes(lang) ? f.supportedLanguages.filter((l) => l !== lang) : [...f.supportedLanguages, lang],
    }));
  };

  const setExample = (i, key, value) => setForm((f) => { const ex = [...f.examples]; ex[i] = { ...ex[i], [key]: value }; return { ...f, examples: ex }; });
  const addExample = () => setForm((f) => ({ ...f, examples: [...f.examples, { input: '', output: '', explanation: '' }] }));
  const removeExample = (i) => setForm((f) => ({ ...f, examples: f.examples.filter((_, idx) => idx !== i) }));

  const setTestCase = (i, key, value) => setForm((f) => { const tc = [...f.testCases]; tc[i] = { ...tc[i], [key]: value }; return { ...f, testCases: tc }; });
  const addTestCase = () => setForm((f) => ({ ...f, testCases: [...f.testCases, { input: '', expectedOutput: '', isHidden: false }] }));
  const removeTestCase = (i) => setForm((f) => ({ ...f, testCases: f.testCases.filter((_, idx) => idx !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return setError('Title and description are required.');
    if (form.testCases.some((tc) => !tc.input.trim() && !tc.expectedOutput.trim())) return setError('Every test case needs at least an expected output.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, topic: form.topic || undefined };
      const saved = isEdit ? await updateCodingProblem(form._id, payload) : await createCodingProblem(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save problem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mb-5">
      <h3 className="font-bold text-sm mb-3">{isEdit ? 'Edit Coding Problem' : 'New Coding Problem'}</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <Input label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} required />

        <div className="grid sm:grid-cols-2 gap-x-4">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Difficulty</label>
            <select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Topic</label>
            <select value={form.topic || ''} onChange={(e) => set('topic', e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              <option value="">— None —</option>
              {topics.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[90px]" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="grid sm:grid-cols-3 gap-x-4">
          <TextField label="Input format" value={form.inputFormat} onChange={(v) => set('inputFormat', v)} />
          <TextField label="Output format" value={form.outputFormat} onChange={(v) => set('outputFormat', v)} />
          <TextField label="Constraints" value={form.constraints} onChange={(v) => set('constraints', v)} />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Supported languages</label>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button type="button" key={l} onClick={() => toggleLanguage(l)} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${form.supportedLanguages.includes(l) ? 'bg-primary text-white' : 'bg-white/[0.06] text-gray-400'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Starter code per language (optional)</label>
          <div className="space-y-2">
            {form.supportedLanguages.map((l) => (
              <div key={l}>
                <div className="text-[11px] text-gray-500 mb-1">{l}</div>
                <textarea className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-[12px] font-mono outline-none resize-y min-h-[60px]" value={form.starterCode[l] || ''} onChange={(e) => set('starterCode', { ...form.starterCode, [l]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-sm">Examples ({form.examples.length})</h4>
          <button type="button" onClick={addExample} className="text-xs text-primary hover:underline">+ Add example</button>
        </div>
        <div className="space-y-2.5 mb-5">
          {form.examples.map((ex, i) => (
            <div key={i} className="bg-white/[0.03] rounded-lg p-3 relative">
              <button type="button" onClick={() => removeExample(i)} className="absolute top-2 right-2 text-[11px] text-red-400 hover:underline">Remove</button>
              <div className="grid sm:grid-cols-2 gap-2 mb-2">
                <input className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[12.5px] font-mono outline-none" placeholder="Input" value={ex.input} onChange={(e) => setExample(i, 'input', e.target.value)} />
                <input className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[12.5px] font-mono outline-none" placeholder="Output" value={ex.output} onChange={(e) => setExample(i, 'output', e.target.value)} />
              </div>
              <input className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[12.5px] outline-none" placeholder="Explanation (optional)" value={ex.explanation} onChange={(e) => setExample(i, 'explanation', e.target.value)} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-sm">Test cases ({form.testCases.length}) — used to grade submissions</h4>
          <button type="button" onClick={addTestCase} className="text-xs text-primary hover:underline">+ Add test case</button>
        </div>
        <div className="space-y-2.5 mb-5">
          {form.testCases.map((tc, i) => (
            <div key={i} className="bg-white/[0.03] rounded-lg p-3 relative">
              <button type="button" onClick={() => removeTestCase(i)} className="absolute top-2 right-2 text-[11px] text-red-400 hover:underline">Remove</button>
              <div className="grid sm:grid-cols-2 gap-2 mb-2">
                <textarea className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[12.5px] font-mono outline-none resize-y min-h-[50px]" placeholder="Stdin" value={tc.input} onChange={(e) => setTestCase(i, 'input', e.target.value)} />
                <textarea className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[12.5px] font-mono outline-none resize-y min-h-[50px]" placeholder="Expected stdout" value={tc.expectedOutput} onChange={(e) => setTestCase(i, 'expectedOutput', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={tc.isHidden} onChange={(e) => setTestCase(i, 'isHidden', e.target.checked)} />
                Hidden (not shown to students, used only for grading)
              </label>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 mb-5 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          Published (visible to students)
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : 'Save problem'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
      <input className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
