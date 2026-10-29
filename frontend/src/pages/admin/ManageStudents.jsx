import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listStudents, blockStudent, unblockStudent, deleteStudent } from '../../services/admin.service.js';

function normalize(s) {
  return {
    id: s._id,
    name: s.name,
    email: s.email,
    college: s.college || '—',
    questionsSolved: s.questionsSolved ?? 0,
    status: s.isBlocked ? 'blocked' : 'active',
  };
}

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    listStudents()
      .then((data) => setStudents(data.map(normalize)))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load students.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleBlock = async (id) => {
    const target = students.find((s) => s.id === id);
    const willBlock = target.status !== 'blocked';
    const prev = students;
    setStudents((p) => p.map((s) => (s.id === id ? { ...s, status: willBlock ? 'blocked' : 'active' } : s)));
    setError('');
    try {
      if (willBlock) await blockStudent(id);
      else await unblockStudent(id);
    } catch (err) {
      setStudents(prev);
      setError(err.response?.data?.message || 'Failed to update this student.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this student? This cannot be undone.')) return;
    const prev = students;
    setStudents((p) => p.filter((s) => s.id !== id));
    setError('');
    try {
      await deleteStudent(id);
    } catch (err) {
      setStudents(prev);
      setError(err.response?.data?.message || 'Failed to delete this student.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Manage Students</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">{students.length} students</p>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <p className="text-gray-500 text-sm">Loading students…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[640px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Name</th><th className="pb-2.5 px-3.5">College</th><th className="pb-2.5 px-3.5">Questions Solved</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <Link to={`/admin/students/${s.id}`} className="font-semibold hover:text-primary hover:underline">{s.name}</Link>
                    <div className="text-gray-500 text-xs">{s.email}</div>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 text-gray-400">{s.college}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{s.questionsSolved}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${s.status === 'blocked' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>{s.status}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => toggleBlock(s.id)} className="text-primary text-xs font-semibold mr-3 hover:underline">{s.status === 'blocked' ? 'Unblock' : 'Block'}</button>
                    <button onClick={() => remove(s.id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && <tr><td colSpan={5} className="text-center text-gray-500 py-8">No students yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
