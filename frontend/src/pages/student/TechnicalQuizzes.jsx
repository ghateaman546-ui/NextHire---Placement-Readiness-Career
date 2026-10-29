import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listTechnicalQuizzes } from '../../services/quiz.service.js';
import { QuizRunner } from './Aptitude.jsx';

const technicalDomains = ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA'];
const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard', 'Mixed'];
const DIFF_BADGE = {
  Easy: 'bg-green-500/15 text-green-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Hard: 'bg-red-500/15 text-red-400',
  Mixed: 'bg-primary/15 text-primary',
};

/**
 * Domain-wise technical quiz modules — separate from the Aptitude quizzes.
 * Each domain (OS, DBMS, OOP, JavaScript, React, ...) has its own timed,
 * scored MCQ set, backed by Quiz documents with category='Technical'.
 */
export default function TechnicalQuizzes() {
  const [domain, setDomain] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeQuizId, setActiveQuizId] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listTechnicalQuizzes(domain === 'all' ? undefined : domain, difficulty === 'all' ? undefined : difficulty)
      .then(setQuizzes)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load quizzes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [domain, difficulty]);

  if (activeQuizId) {
    return <QuizRunner quizId={activeQuizId} onExit={() => setActiveQuizId(null)} />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Domain-wise Technical Quizzes</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Timed, scored quizzes for each core CS subject</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setDomain('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${domain === 'all' ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
        >
          All
        </button>
        {technicalDomains.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${domain === d ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${difficulty === d ? 'bg-secondary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
          >
            {d === 'all' ? 'All difficulties' : d}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading quizzes…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map((q) => (
            <Card
              key={q._id}
              onClick={() => setActiveQuizId(q._id)}
              className="p-5 cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-accent font-bold uppercase tracking-wide">{q.subject}</div>
                <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold ${DIFF_BADGE[q.difficulty] || DIFF_BADGE.Medium}`}>{q.difficulty || 'Medium'}</span>
              </div>
              <div className="text-base font-bold my-1.5">{q.title}</div>
              <div className="flex gap-3.5 text-xs text-gray-400">
                <span>📝 {q.questionCount} questions</span>
                <span>⏱ {Math.round((q.timerSeconds || 600) / 60)} min</span>
              </div>
            </Card>
          ))}
          {quizzes.length === 0 && <p className="text-gray-500 text-sm">No quizzes for this domain yet.</p>}
        </div>
      )}
    </div>
  );
}
