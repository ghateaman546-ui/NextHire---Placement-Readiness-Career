import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import BarChart from '../../components/common/BarChart.jsx';
import ProgressRing from '../../components/common/ProgressRing.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { getSummary, getWeeklyProgress, getMonthlyProgress, getAchievements } from '../../services/dashboard.service.js';
import { getMyRank } from '../../services/leaderboard.service.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [weeklyBars, setWeeklyBars] = useState([]);
  const [monthlyBars, setMonthlyBars] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([getSummary(), getWeeklyProgress(), getMonthlyProgress(), getAchievements(), getMyRank()])
      .then(([s, w, m, a, r]) => {
        setSummary(s);
        setWeeklyBars(w);
        setMonthlyBars(m);
        setAchievements(a);
        setMyRank(r);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const u = summary || user || {};
  const firstName = (user?.name || u.name || 'Student').split(' ')[0];

  if (loading) return <p className="text-gray-500 text-sm">Loading dashboard…</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Welcome back, {firstName} 👋</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">Here's where your placement prep stands today.</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Profile Completion" value={u.profileCompletionPercent ?? 0} unit="%" accentClass="bg-primary" />
        <StatCard label="Current Streak" value={u.currentStreak ?? 0} unit="days" accentClass="bg-accent" />
        <StatCard label="Questions Solved" value={u.questionsSolved ?? 0} unit="/450" accentClass="bg-secondary" />
        <StatCard label="Resume Score" value={u.resumeScore ?? 0} unit="/100" accentClass="bg-green-500" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-1">Weekly Progress — Questions Solved</h3>
          <p className="text-xs text-gray-400 mb-2">Last 7 days</p>
          {weeklyBars.length ? <BarChart data={weeklyBars} max={Math.max(16, ...weeklyBars.map((b) => b.value))} /> : <p className="text-gray-500 text-sm">No activity recorded yet.</p>}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4">Profile & Prep Snapshot</h3>
          <div className="flex items-center gap-5">
            <ProgressRing percent={u.profileCompletionPercent ?? 0} label="PROFILE" />
            <div className="flex-1 space-y-2 text-[12.5px]">
              <Row label="Mock Interview Avg" value={`${u.mockInterviewAvgScore ?? 0}/100`} />
              <Row label="Total Points" value={(u.totalPoints ?? 0).toLocaleString()} />
              <Row label="Leaderboard Rank" value={myRank?.rank ? `#${myRank.rank}` : '—'} />
              <Row label="Courses Completed" value={u.coursesCompleted ?? 0} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-1">Study Hours</h3>
          <p className="text-xs text-gray-400 mb-2">This month</p>
          {monthlyBars.length ? <BarChart data={monthlyBars} max={Math.max(18, ...monthlyBars.map((b) => b.value))} /> : <p className="text-gray-500 text-sm">No activity recorded yet.</p>}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-4">Achievements</h3>
          <div className="space-y-2.5">
            {achievements.map((a) => (
              <div key={a.title || a._id} className="flex items-center gap-2.5 text-[13px]">
                <div className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[15px] flex-shrink-0 ${toneClasses(a.tone)}`}>
                  {a.icon || '🏆'}
                </div>
                <div>
                  <div>{a.title || a.name}</div>
                  <div className="text-[11.5px] text-gray-400">{a.meta || ''}</div>
                </div>
              </div>
            ))}
            {achievements.length === 0 && <p className="text-gray-500 text-sm">No achievements yet — keep solving to earn some!</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function toneClasses(tone) {
  const map = { amber: 'bg-amber-500/15 text-amber-400', green: 'bg-green-500/15 text-green-400', cyan: 'bg-cyan-500/15 text-cyan-400' };
  return map[tone] || 'bg-white/10';
}
