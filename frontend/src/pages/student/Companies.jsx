import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listCompanies } from '../../services/company.service.js';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    listCompanies()
      .then(setCompanies)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load companies.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Company Preparation</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">Overview, selection process, salary bands, and past interview questions by company</p>

      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <p className="text-gray-500 text-sm">Loading companies…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {companies.map((c) => (
            <Link key={c._id || c.slug} to={`/companies/${c.slug}`}>
              <Card className="p-4.5 text-center cursor-pointer transition-transform hover:-translate-y-1">
                <div className="w-[46px] h-[46px] rounded-xl mx-auto mb-2.5 flex items-center justify-center font-extrabold text-base bg-gradient-to-br from-primary to-secondary">
                  {c.name[0]}
                </div>
                <div className="text-[13.5px] font-bold">{c.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{c.salary?.ctcRange || ''}</div>
              </Card>
            </Link>
          ))}
          {companies.length === 0 && <p className="text-gray-500 text-sm col-span-full">No companies added yet.</p>}
        </div>
      )}
    </div>
  );
}
