import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge, Tag, StatusDot } from '../../components/common/Badge.jsx';
import { listQuestions, toggleBookmark as toggleBookmarkApi, updateStatus as updateStatusApi } from '../../services/question.service.js';
import { listTopics } from '../../services/topic.service.js';
import { LEETCODE_TOPIC_PROBLEMS } from '../../data/leetcodeTopicProblems.js';

/**
 * DSA Preparation sheet — this is the "Tasks" feature: each question is a
 * task a student can start, track (todo → attempted → done) and bookmark.
 * Progress is stored per-user on the backend (Question.userStates).
 */
export default function DsaSheet() {
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [company, setCompany] = useState('all');
  const [topic, setTopic] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([listQuestions(), listTopics()])
      .then(([qs, ts]) => {
        setQuestions(qs);
        setTopics(ts.map((t) => t.name));
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load tasks.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const allCompanies = useMemo(() => [...new Set(questions.flatMap((q) => q.companies || []))].sort(), [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (company !== 'all' && !(q.companies || []).includes(company)) return false;
      if (topic !== 'all' && q.topic !== topic) return false;
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false;
      if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [questions, company, topic, difficulty, search]);

  const toggleBookmark = async (id) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, bookmarked: !q.bookmarked } : q)));
    try {
      await toggleBookmarkApi(id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update bookmark.');
      load();
    }
  };

  const cycleStatus = async (id, current) => {
    // todo -> attempted -> done -> todo
    const next = current === 'todo' ? 'attempted' : current === 'attempted' ? 'done' : 'todo';
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, status: next } : q)));
    try {
      await updateStatusApi(id, next);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
      load();
    }
  };

  const solvedCount = questions.filter((q) => q.status === 'done').length;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">DSA Preparation — Tasks</h2>
      <p className="text-gray-400 text-[13.5px] mb-1">
        Company-wise sheet · {questions.length} tasks across {topics.length} topics
      </p>
      <p className="text-gray-500 text-xs mb-5">
        {solvedCount} / {questions.length} completed ({questions.length ? Math.round((solvedCount / questions.length) * 100) : 0}%)
      </p>
      <ErrorBanner message={error} onRetry={load} />

      {loading ? (
        <p className="text-gray-500 text-sm">Loading tasks…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5 mb-4">
            <Select value={company} onChange={setCompany} options={['all', ...allCompanies]} labelAll="All Companies" />
            <Select value={topic} onChange={setTopic} options={['all', ...topics]} labelAll="All Topics" />
            <Select value={difficulty} onChange={setDifficulty} options={['all', 'Easy', 'Medium', 'Hard']} labelAll="All Difficulty" />
            <input
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none focus:border-primary/60"
              placeholder="Search task…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {topic !== 'all' && LEETCODE_TOPIC_PROBLEMS[topic] && (
            <Card className="p-4 mb-4">
              <div className="text-[11px] text-gray-500 font-bold uppercase mb-2.5">Practice {topic} on LeetCode</div>
              <div className="flex flex-wrap gap-2">
                {LEETCODE_TOPIC_PROBLEMS[topic].map((p) => (
                  <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[12.5px] font-semibold text-primary">
                    {p.title} ↗ <DifficultyBadge level={p.difficulty} />
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-1.5 overflow-x-auto">
            <table className="w-full text-[13.5px] border-collapse min-w-[760px]">
              <thead>
                <tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
                  <th className="pb-2.5 px-3.5"></th>
                  <th className="pb-2.5 px-3.5">Title</th>
                  <th className="pb-2.5 px-3.5">Topic</th>
                  <th className="pb-2.5 px-3.5">Companies</th>
                  <th className="pb-2.5 px-3.5">Difficulty</th>
                  <th className="pb-2.5 px-3.5">Links</th>
                  <th className="pb-2.5 px-3.5">Status</th>
                  <th className="pb-2.5 px-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-3.5 border-t border-white/10"><StatusDot status={q.status} /></td>
                    <td className="py-3 px-3.5 border-t border-white/10">{q.title}</td>
                    <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{q.topic}</td>
                    <td className="py-3 px-3.5 border-t border-white/10">
                      {(q.companies || []).map((c) => <Tag key={c}>{c}</Tag>)}
                    </td>
                    <td className="py-3 px-3.5 border-t border-white/10"><DifficultyBadge level={q.difficulty} /></td>
                    <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                      {q.leetcode && <a href={q.leetcode} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold mr-3 hover:underline">LeetCode ↗</a>}
                      {q.youtube && <a href={q.youtube} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold hover:underline">Video ↗</a>}
                    </td>
                    <td className="py-3 px-3.5 border-t border-white/10">
                      <button
                        onClick={() => cycleStatus(q.id, q.status)}
                        className={`text-[11px] px-2.5 py-1 rounded-full font-semibold capitalize ${
                          q.status === 'done' ? 'bg-green-500/15 text-green-400' : q.status === 'attempted' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/10 text-gray-400'
                        }`}
                      >
                        {q.status === 'todo' ? 'Start' : q.status === 'attempted' ? 'Mark done' : 'Done ✓'}
                      </button>
                    </td>
                    <td className="py-3 px-3.5 border-t border-white/10">
                      <button onClick={() => toggleBookmark(q.id)} className={`text-sm ${q.bookmarked ? 'text-accent' : 'text-gray-500'}`} aria-label="Toggle bookmark">★</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-500 py-8">No tasks match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function Select({ value, onChange, options, labelAll }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none">
      {options.map((opt) => <option key={opt} value={opt}>{opt === 'all' ? labelAll : opt}</option>)}
    </select>
  );
}
