import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listQuizzesAdmin, getQuizAdmin, createQuiz, updateQuiz, deleteQuiz } from '../../services/quiz.service.js';

const CATEGORIES = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation', 'Technical'];
const SUBJECTS = ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA'];
// Difficulty drives the standard question-count convention students see:
// Easy quizzes are typically 5 Qs, Medium 15, Hard 30, Mixed is a blend of all three.
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'];
const RECOMMENDED_COUNT = { Easy: 5, Medium: 15, Hard: 30, Mixed: 20 };

const BLANK_QUESTION = () => ({ question: '', options: ['', ''], correctOptionIndex: 0, explanation: '' });
const BLANK_QUIZ = () => ({
  title: '', category: 'Quantitative Aptitude', subject: null, difficulty: 'Easy',
  timerSeconds: 600, marksPerCorrect: 1, negativeMarkingEnabled: false, negativeMarksPerWrong: 0.25,
  isActive: true, questions: [BLANK_QUESTION()],
});

/**
 * Admin Quiz management — create/edit quizzes (both Aptitude and
 * Technical/domain-wise modules), add/edit/delete questions & options,
 * set correct answers + marks, and publish/unpublish.
 */
export default function ManageQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    listQuizzesAdmin()
      .then(setQuizzes)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load quizzes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditingId(null); setEditingQuiz(BLANK_QUIZ()); setFormOpen(true); };

  const openEdit = async (id) => {
    setFormOpen(true);
    setEditingId(id);
    setFormLoading(true);
    setError('');
    try {
      const full = await getQuizAdmin(id);
      setEditingQuiz(full);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load this quiz.');
      setFormOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const closeForm = () => setFormOpen(false);

  const afterSave = (saved) => {
    setQuizzes((prev) => {
      const exists = prev.some((q) => q._id === saved._id);
      const withMeta = { ...saved, questionCount: saved.questions.length, attemptCount: prev.find((q) => q._id === saved._id)?.attemptCount || 0 };
      return exists ? prev.map((q) => (q._id === saved._id ? withMeta : q)) : [withMeta, ...prev];
    });
    setFormOpen(false);
  };

  const togglePublish = async (q) => {
    const prev = quizzes;
    setQuizzes((p) => p.map((x) => (x._id === q._id ? { ...x, isActive: !x.isActive } : x)));
    setError('');
    try {
      await updateQuiz(q._id, { isActive: !q.isActive });
    } catch (err) {
      setQuizzes(prev);
      setError(err.response?.data?.message || 'Failed to update quiz.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this quiz and all its questions? This cannot be undone.')) return;
    const prev = quizzes;
    setQuizzes((p) => p.filter((q) => q._id !== id));
    setError('');
    try {
      await deleteQuiz(id);
    } catch (err) {
      setQuizzes(prev);
      setError(err.response?.data?.message || 'Failed to delete quiz.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Manage Quizzes</h2>
        <Button onClick={openCreate} className="w-auto px-4">+ Add Quiz</Button>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-5">{quizzes.length} quizzes (Aptitude + Technical)</p>
      <ErrorBanner message={error} onRetry={load} />

      {formOpen && (
        formLoading ? (
          <Card className="p-5 mb-5"><p className="text-gray-500 text-sm">Loading quiz…</p></Card>
        ) : (
          <QuizForm key={editingId || 'new'} initial={editingQuiz} isEdit={!!editingId} onCancel={closeForm} onSaved={afterSave} />
        )
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading quizzes…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[760px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Title</th><th className="pb-2.5 px-3.5">Category</th><th className="pb-2.5 px-3.5">Difficulty</th><th className="pb-2.5 px-3.5">Questions</th>
              <th className="pb-2.5 px-3.5">Attempts</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q._id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold">{q.title}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{q.category}{q.subject ? ` · ${q.subject}` : ''}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                      q.difficulty === 'Easy' ? 'bg-green-500/15 text-green-400' :
                      q.difficulty === 'Medium' ? 'bg-amber-500/15 text-amber-400' :
                      q.difficulty === 'Hard' ? 'bg-red-500/15 text-red-400' : 'bg-primary/15 text-primary'
                    }`}>{q.difficulty || 'Medium'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{q.questionCount}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{q.attemptCount}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${q.isActive ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{q.isActive ? 'published' : 'unpublished'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => openEdit(q._id)} className="text-primary text-xs font-semibold mr-3 hover:underline">Edit</button>
                    <Link to={`/admin/quizzes/${q._id}/results`} className="text-secondary text-xs font-semibold mr-3 hover:underline">Results</Link>
                    <button onClick={() => togglePublish(q)} className="text-amber-400 text-xs font-semibold mr-3 hover:underline">{q.isActive ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => remove(q._id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {quizzes.length === 0 && <tr><td colSpan={7} className="text-center text-gray-500 py-8">No quizzes yet — add your first one.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function QuizForm({ initial, isEdit, onCancel, onSaved }) {
  const [quiz, setQuiz] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (key, value) => setQuiz((q) => ({ ...q, [key]: value }));

  const setQuestionField = (qi, key, value) => {
    setQuiz((q) => {
      const questions = [...q.questions];
      questions[qi] = { ...questions[qi], [key]: value };
      return { ...q, questions };
    });
  };

  const setOption = (qi, oi, value) => {
    setQuiz((q) => {
      const questions = [...q.questions];
      const options = [...questions[qi].options];
      options[oi] = value;
      questions[qi] = { ...questions[qi], options };
      return { ...q, questions };
    });
  };

  const addOption = (qi) => {
    setQuiz((q) => {
      const questions = [...q.questions];
      questions[qi] = { ...questions[qi], options: [...questions[qi].options, ''] };
      return { ...q, questions };
    });
  };

  const removeOption = (qi, oi) => {
    setQuiz((q) => {
      const questions = [...q.questions];
      const current = questions[qi];
      if (current.options.length <= 2) return q; // keep a minimum of 2 options
      const options = current.options.filter((_, i) => i !== oi);
      const correctOptionIndex = current.correctOptionIndex === oi ? 0 : current.correctOptionIndex > oi ? current.correctOptionIndex - 1 : current.correctOptionIndex;
      questions[qi] = { ...current, options, correctOptionIndex };
      return { ...q, questions };
    });
  };

  const addQuestion = () => setQuiz((q) => ({ ...q, questions: [...q.questions, BLANK_QUESTION()] }));
  const removeQuestion = (qi) => setQuiz((q) => ({ ...q, questions: q.questions.filter((_, i) => i !== qi) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!quiz.title.trim()) return setError('Quiz title is required.');
    if (quiz.questions.length === 0) return setError('Add at least one question.');
    for (const [i, q] of quiz.questions.entries()) {
      if (!q.question.trim()) return setError(`Question ${i + 1} needs text.`);
      if (q.options.some((o) => !o.trim())) return setError(`Question ${i + 1} has an empty option.`);
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...quiz, subject: quiz.category === 'Technical' ? quiz.subject || SUBJECTS[0] : null };
      const saved = isEdit ? await updateQuiz(quiz._id, payload) : await createQuiz(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save quiz.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mb-5">
      <h3 className="font-bold text-sm mb-3">{isEdit ? 'Edit Quiz' : 'New Quiz'}</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <Input label="Title" value={quiz.title} onChange={(e) => setField('title', e.target.value)} required />

        <div className="grid sm:grid-cols-3 gap-x-4">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Category</label>
            <select value={quiz.category} onChange={(e) => setField('category', e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {quiz.category === 'Technical' && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Subject</label>
              <select value={quiz.subject || SUBJECTS[0]} onChange={(e) => setField('subject', e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Difficulty</label>
            <select value={quiz.difficulty || 'Medium'} onChange={(e) => setField('difficulty', e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d} (recommended {RECOMMENDED_COUNT[d]} Qs)</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 -mt-2.5 mb-4">
          Convention: Easy → 5 questions, Medium → 15, Hard → 30, Mixed → a blend of easy/medium/hard questions. You can add any number of questions below — the count you add becomes this quiz's question count.
        </p>

        <div className="grid sm:grid-cols-3 gap-x-4">
          <Input label="Timer (seconds)" type="number" value={quiz.timerSeconds} onChange={(e) => setField('timerSeconds', Number(e.target.value))} />
          <Input label="Marks per correct" type="number" step="0.5" value={quiz.marksPerCorrect} onChange={(e) => setField('marksPerCorrect', Number(e.target.value))} />
          <Input label="Negative marks per wrong" type="number" step="0.25" value={quiz.negativeMarksPerWrong} onChange={(e) => setField('negativeMarksPerWrong', Number(e.target.value))} />
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input type="checkbox" checked={quiz.negativeMarkingEnabled} onChange={(e) => setField('negativeMarkingEnabled', e.target.checked)} />
          Enable negative marking
        </label>
        <label className="flex items-center gap-2 mb-5 text-sm">
          <input type="checkbox" checked={quiz.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
          Published (visible to students)
        </label>

        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-sm">Questions ({quiz.questions.length})</h4>
          <button type="button" onClick={addQuestion} className="text-xs text-primary hover:underline">+ Add question</button>
        </div>

        <div className="space-y-4 mb-5">
          {quiz.questions.map((q, qi) => (
            <div key={qi} className="bg-white/[0.03] rounded-xl p-4 relative">
              <button type="button" onClick={() => removeQuestion(qi)} className="absolute top-3 right-3 text-[11px] text-red-400 hover:underline">Remove question</button>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Question {qi + 1}</label>
                <input className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none" value={q.question} onChange={(e) => setQuestionField(qi, 'question', e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Options — select the correct one</label>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input type="radio" name={`correct-${qi}`} checked={q.correctOptionIndex === oi} onChange={() => setQuestionField(qi, 'correctOptionIndex', oi)} />
                      <input className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none" value={opt} onChange={(e) => setOption(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} />
                      {q.options.length > 2 && (
                        <button type="button" onClick={() => removeOption(qi, oi)} className="text-[11px] text-red-400 hover:underline whitespace-nowrap">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addOption(qi)} className="text-xs text-primary hover:underline mt-1.5">+ Add option</button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Explanation (shown after submission)</label>
                <input className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none" value={q.explanation} onChange={(e) => setQuestionField(qi, 'explanation', e.target.value)} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : 'Save quiz'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
