import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { Tag } from '../../components/common/Badge.jsx';
import { listInterviewQuestions } from '../../services/interviewQuestion.service.js';

const interviewSubjects = ['General', 'OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'Python'];

const categories = [
  { key: 'all', label: 'All' }, { key: 'hr', label: 'HR' }, { key: 'technical', label: 'Technical' },
  { key: 'behavioral', label: 'Behavioral' }, { key: 'company-specific', label: 'Company-specific' },
];

export default function InterviewPrep() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [subject, setSubject] = useState('all');
  const [openId, setOpenId] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listInterviewQuestions()
      .then(setQuestions)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load questions.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (category !== 'all' && q.category !== category) return false;
      if (subject !== 'all' && q.subject !== subject) return false;
      return true;
    });
  }, [questions, category, subject]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Interview Preparation</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">HR, Technical, Behavioral & Company-specific questions with answers and follow-ups</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex gap-2 mb-3 flex-wrap">
        {categories.map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${category === c.key ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <select value={subject} onChange={(e) => setSubject(e.target.value)} className="mb-5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none">
        <option value="all">All Subjects</option>
        {interviewSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading questions…</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const isOpen = openId === q._id;
            return (
              <Card key={q._id} className="overflow-hidden">
                <button onClick={() => setOpenId(isOpen ? null : q._id)} className="w-full text-left px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex gap-1.5 mb-1.5">
                      <Tag>{q.category}</Tag><Tag>{q.subject}</Tag>
                      {q.company && <Tag>{q.company.name}</Tag>}
                    </div>
                    <div className="font-semibold text-sm">{q.question}</div>
                  </div>
                  <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-[13.5px] text-gray-300 border-t border-white/10 pt-4">
                    <p className="mb-3 leading-relaxed">{q.answer}</p>
                    {(q.followUpQuestions || []).length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-gray-400 mb-1.5">Follow-up questions</div>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                          {q.followUpQuestions.map((f) => <li key={f}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {filtered.length === 0 && <p className="text-gray-500 text-sm">No questions match these filters.</p>}
        </div>
      )}
    </div>
  );
}
