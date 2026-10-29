import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { getQuizStatsAdmin } from '../../services/quiz.service.js';

export default function QuizResults() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getQuizStatsAdmin(id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load quiz results.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <p className="text-gray-500 text-sm">Loading results…</p>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      <Link to="/admin/quizzes" className="text-xs text-primary hover:underline">← All quizzes</Link>
      <h2 className="text-xl font-bold mt-2 mb-1">{data.quiz.title}</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">{data.quiz.category}{data.quiz.subject ? ` · ${data.quiz.subject}` : ''} · {data.quiz.questionCount} questions</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Attempts" value={data.totalAttempts} accentClass="bg-primary" />
        <StatCard label="Average Score" value={data.averageScore} accentClass="bg-accent" />
        <StatCard label="Highest Score" value={data.highestScore} accentClass="bg-green-500" />
        <StatCard label="Lowest Score" value={data.lowestScore} accentClass="bg-secondary" />
      </div>

      <Card className="p-1.5 overflow-x-auto">
        <table className="w-full text-[13.5px] border-collapse min-w-[600px]">
          <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
            <th className="pb-2.5 px-3.5">Student</th><th className="pb-2.5 px-3.5">Score</th><th className="pb-2.5 px-3.5">Correct</th>
            <th className="pb-2.5 px-3.5">Time taken</th><th className="pb-2.5 px-3.5">Completed</th>
          </tr></thead>
          <tbody>
            {data.attempts.map((a) => (
              <tr key={a.id}>
                <td className="py-3 px-3.5 border-t border-white/10">
                  {a.student ? (
                    <>
                      <Link to={`/admin/students/${a.student.id}`} className="font-semibold hover:text-primary hover:underline">{a.student.name}</Link>
                      <div className="text-gray-500 text-xs">{a.student.college}</div>
                    </>
                  ) : <span className="text-gray-500">Deleted student</span>}
                </td>
                <td className="py-3 px-3.5 border-t border-white/10 font-mono font-bold">{a.score}</td>
                <td className="py-3 px-3.5 border-t border-white/10 font-mono">{a.correctCount}/{a.totalQuestions}</td>
                <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{a.timeTakenSeconds ? `${a.timeTakenSeconds}s` : '—'}</td>
                <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{new Date(a.completedAt).toLocaleString()}</td>
              </tr>
            ))}
            {data.attempts.length === 0 && <tr><td colSpan={5} className="text-center text-gray-500 py-8">No attempts yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
