import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { Tag } from '../../components/common/Badge.jsx';
import { getStudentDetail } from '../../services/admin.service.js';

export default function StudentDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getStudentDetail(id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load student details.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <p className="text-gray-500 text-sm">Loading student…</p>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  const { student, taskProgress, quizAttempts, feedback, recentProgress } = data;
  const totalTasks = taskProgress.completed + taskProgress.attempted + taskProgress.notStarted;
  const avgQuizScore = quizAttempts.length ? Math.round(quizAttempts.reduce((s, a) => s + a.score, 0) / quizAttempts.length) : 0;

  return (
    <div>
      <Link to="/admin/students" className="text-xs text-primary hover:underline">← All students</Link>
      <div className="flex items-center gap-3 mt-2 mb-1">
        <h2 className="text-xl font-bold">{student.name}</h2>
        <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${student.isBlocked ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
          {student.isBlocked ? 'blocked' : 'active'}
        </span>
      </div>
      <p className="text-gray-400 text-[13.5px] mb-6">{student.email} · {student.college || 'No college on file'} · Joined {new Date(student.createdAt).toLocaleDateString()}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Profile Completion" value={student.profileCompletionPercent ?? 0} unit="%" accentClass="bg-primary" />
        <StatCard label="Current Streak" value={student.currentStreak ?? 0} unit="days" accentClass="bg-accent" />
        <StatCard label="Tasks Completed" value={taskProgress.completed} unit={`/${totalTasks}`} accentClass="bg-secondary" />
        <StatCard label="Avg Quiz Score" value={avgQuizScore} accentClass="bg-green-500" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Task Progress</h3>
          <ProgressRow label="Completed" value={taskProgress.completed} total={totalTasks} colorClass="bg-green-500" />
          <ProgressRow label="Attempted" value={taskProgress.attempted} total={totalTasks} colorClass="bg-amber-500" />
          <ProgressRow label="Not started" value={taskProgress.notStarted} total={totalTasks} colorClass="bg-white/20" />
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Profile snapshot</h3>
          <Row label="Resume score" value={`${student.resumeScore ?? 0}/100`} />
          <Row label="Mock interview avg" value={`${student.mockInterviewAvgScore ?? 0}/100`} />
          <Row label="Total points" value={(student.totalPoints ?? 0).toLocaleString()} />
          <Row label="Branch / Year" value={`${student.branch || '—'} · ${student.year || '—'}`} />
          <Row label="Last active" value={student.lastActiveDate ? new Date(student.lastActiveDate).toLocaleString() : 'Never'} />
        </Card>
      </div>

      <Card className="p-5 mb-5">
        <h3 className="font-bold text-sm mb-3">Quiz Attempts ({quizAttempts.length})</h3>
        {quizAttempts.length === 0 ? (
          <p className="text-gray-500 text-sm">No quiz attempts yet.</p>
        ) : (
          <div className="space-y-2">
            {quizAttempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-[13px] border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <div className="font-semibold">{a.quiz?.title || 'Deleted quiz'}</div>
                  <div className="text-gray-500 text-xs">{new Date(a.completedAt).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold">{a.score}</div>
                  <div className="text-gray-500 text-xs">{a.correctCount}/{a.totalQuestions} correct</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-sm mb-3">Feedback submitted ({feedback.length})</h3>
        {feedback.length === 0 ? (
          <p className="text-gray-500 text-sm">No feedback submitted.</p>
        ) : (
          <div className="space-y-2.5">
            {feedback.map((f) => (
              <div key={f._id} className="border-t border-white/10 pt-2.5 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Tag>{f.category}</Tag>
                  <span className="text-[10.5px] text-gray-500 capitalize">{f.status}</span>
                </div>
                <p className="text-[13px] text-gray-300">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProgressRow({ label, value, total, colorClass }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">{label}</span><b>{value}</b></div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-[13px] py-1">
      <span className="text-gray-400">{label}</span>
      <b>{value}</b>
    </div>
  );
}
