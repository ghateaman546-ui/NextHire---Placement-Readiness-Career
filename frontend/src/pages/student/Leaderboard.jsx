import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { getLeaderboard } from '../../services/leaderboard.service.js';
import { useAuth } from '../../context/AuthContext.jsx';

const rankColor = { 1: 'text-amber-300', 2: 'text-gray-300', 3: 'text-orange-400' };

export default function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getLeaderboard('all-time')
      .then(setRows)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the leaderboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Leaderboard</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">All-time ranking based on total points earned across questions, quizzes, and streaks</p>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <p className="text-gray-500 text-sm">Loading leaderboard…</p>
      ) : (
        <Card>
          {rows.map((p) => {
            const isMe = user && p.name === user.name;
            return (
              <div key={p.rank} className={`flex items-center gap-3.5 px-4 py-3 border-b border-white/10 last:border-b-0 ${isMe ? 'bg-primary/[0.08]' : ''}`}>
                <div className={`w-7 font-extrabold text-sm text-gray-400 ${rankColor[p.rank] || ''}`}>#{p.rank}</div>
                <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center font-bold text-xs">
                  {p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <div><div className="font-semibold text-[13.5px]">{p.name}</div><div className="text-[11px] text-gray-400">{p.college}</div></div>
                <div className="ml-auto font-extrabold text-[14.5px] font-mono tabular-nums">{p.points.toLocaleString()} pts</div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-gray-500 text-sm p-4">No leaderboard entries yet.</p>}
        </Card>
      )}
    </div>
  );
}
