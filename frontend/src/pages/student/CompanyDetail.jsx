import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { getCompany } from '../../services/company.service.js';

const categoryFilters = ['all', 'coding', 'aptitude', 'hr', 'technical'];

/**
 * Company-specific past interview questions bank — full detail page:
 * overview, selection process, salary, and a filterable PYQ list.
 */
export default function CompanyDetail() {
  const { slug } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    setError('');
    getCompany(slug)
      .then(setCompany)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load company.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [slug]);

  if (loading) return <p className="text-gray-500 text-sm">Loading company profile…</p>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!company) return null;

  const pyqs = (company.previousYearQuestions || []).filter((q) => filter === 'all' || q.category === filter);

  return (
    <div>
      <Link to="/companies" className="text-xs text-primary hover:underline">← All companies</Link>
      <h2 className="text-xl font-bold mt-2 mb-1">{company.name}</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">{company.overview}</p>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4 mb-5">
        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Selection Process</h3>
          {(company.selectionProcess || []).length ? (
            <ol className="space-y-2.5">
              {company.selectionProcess.map((s, i) => (
                <li key={i} className="text-[13px]">
                  <span className="inline-flex w-5 h-5 rounded-full bg-primary/20 text-primary items-center justify-center text-[11px] font-bold mr-2">{i + 1}</span>
                  <b>{s.stage}</b> — <span className="text-gray-400">{s.description}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-gray-500 text-sm">No process details yet.</p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-sm mb-3">Salary Band</h3>
          <div className="text-2xl font-extrabold font-mono">{company.salary?.ctcRange || '—'}</div>
          <p className="text-gray-400 text-xs mt-1">{company.salary?.role || 'SDE'} · {company.salary?.notes || ''}</p>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">Past Interview Questions Bank</h3>
        <div className="flex gap-1.5">
          {categoryFilters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-[11px] font-semibold capitalize ${filter === f ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {pyqs.map((q, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-gray-500">{q.year}</span>
              <span className="text-[10px] bg-secondary/20 text-indigo-300 px-2 py-0.5 rounded-md capitalize">{q.category}</span>
              {q.askedInRound && <span className="text-[10px] text-gray-500">· {q.askedInRound}</span>}
            </div>
            <p className="text-[13.5px]">{q.question}</p>
          </Card>
        ))}
        {pyqs.length === 0 && <p className="text-gray-500 text-sm">No questions in this category yet.</p>}
      </div>
    </div>
  );
}
