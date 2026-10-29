import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import BarChart from '../../components/common/BarChart.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { getPlatformAnalytics } from '../../services/admin.service.js';

const quickActions = [
  { to: '/admin/topics', label: '+ Add Topic' },
  { to: '/admin/questions', label: '+ Add Task' },
  { to: '/admin/quizzes', label: '+ Add Quiz' },
  { to: '/admin/coding-problems', label: '+ Add Coding Problem' },
  { to: '/admin/notifications', label: '📣 Broadcast Notification' },
];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getPlatformAnalytics()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load platform analytics.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading dashboard…</p>;

  const d = data || {};

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Admin Dashboard</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Live platform statistics from the database</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex flex-wrap gap-2 mb-6">
        {quickActions.map((a) => (
          <Link key={a.to} to={a.to} className="text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] transition-colors">
            {a.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Students" value={d.totalStudents ?? 0} accentClass="bg-primary" />
        <StatCard label="Active Today" value={d.activeToday ?? 0} accentClass="bg-accent" />
        <StatCard label="Total Tasks (Questions)" value={d.totalQuestions ?? 0} accentClass="bg-secondary" />
        <StatCard label="Companies" value={d.totalCompanies ?? 0} accentClass="bg-green-500" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Quizzes (Published)" value={`${d.publishedQuizzes ?? 0}/${d.totalQuizzes ?? 0}`} accentClass="bg-primary" />
        <StatCard label="Quiz Attempts" value={d.quizzesTaken ?? 0} accentClass="bg-accent" />
        <StatCard label="Topics" value={d.totalTopics ?? 0} accentClass="bg-secondary" />
        <StatCard label="Avg Resume Score" value={d.avgResumeScore ?? 0} unit="/100" accentClass="bg-green-500" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <StatCard label="Total Feedback" value={d.totalFeedback ?? 0} accentClass="bg-primary" />
        <StatCard label="New (Unreviewed) Feedback" value={d.newFeedback ?? 0} accentClass="bg-amber-500" />
      </div>

      <Card className="p-5 mb-5">
        <h3 className="font-bold text-sm mb-1">New Signups</h3>
        <p className="text-xs text-gray-400 mb-2">Last 7 days</p>
        {(d.signupsLast7Days || []).length ? (
          <BarChart data={d.signupsLast7Days} max={Math.max(5, ...d.signupsLast7Days.map((b) => b.value))} />
        ) : (
          <p className="text-gray-500 text-sm">No signups recorded in the last 7 days.</p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Recent Registrations</h3>
          {(d.recentRegistrations || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No students registered yet.</p>
          ) : (
            <div className="space-y-2.5">
              {d.recentRegistrations.map((s) => (
                <Link key={s._id} to={`/admin/students/${s._id}`} className="flex items-center justify-between text-[13px] hover:text-primary">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-gray-500 text-xs">{s.college || s.email}</div>
                  </div>
                  <span className="text-gray-500 text-xs">{new Date(s.createdAt).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Recent Quiz Attempts</h3>
          {(d.recentQuizAttempts || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No quiz attempts yet.</p>
          ) : (
            <div className="space-y-2.5">
              {d.recentQuizAttempts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-[13px]">
                  <div>
                    <div className="font-semibold">{a.studentName}</div>
                    <div className="text-gray-500 text-xs">{a.quizTitle}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold">{a.score}</div>
                    <div className="text-gray-500 text-xs">{new Date(a.completedAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
