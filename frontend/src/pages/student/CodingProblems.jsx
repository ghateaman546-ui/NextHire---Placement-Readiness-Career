import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge } from '../../components/common/Badge.jsx';
import { listCodingProblems } from '../../services/codingProblem.service.js';

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard'];

export default function CodingProblems() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [difficulty, setDifficulty] = useState('all');

  const load = () => {
    setLoading(true);
    setError('');
    listCodingProblems(difficulty === 'all' ? undefined : { difficulty })
      .then(setProblems)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load coding problems.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [difficulty]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Coding Problems</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Learn how problems are solved — read the statement, study the examples, and follow the example solution</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex gap-2 mb-4">
        {DIFFICULTIES.map((d) => (
          <button key={d} onClick={() => setDifficulty(d)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${difficulty === d ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}>
            {d === 'all' ? 'All' : d}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading problems…</p>
      ) : (
        <Card className="p-1.5">
          {problems.map((p) => (
            <Link key={p._id} to={`/coding-problems/${p.slug}`} className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 last:border-b-0 hover:bg-white/[0.03] rounded-lg">
              <div>
                <div className="font-semibold text-[13.5px]">{p.title}</div>
                <div className="text-gray-400 text-xs mt-0.5">{p.topic?.name || 'General'}</div>
              </div>
              <DifficultyBadge level={p.difficulty} />
            </Link>
          ))}
          {problems.length === 0 && <p className="text-gray-500 text-sm p-4">No coding problems available yet.</p>}
        </Card>
      )}
    </div>
  );
}
