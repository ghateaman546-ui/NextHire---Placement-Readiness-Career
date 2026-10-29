import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listCompaniesAdmin, createCompany, updateCompany, deleteCompany } from '../../services/admin.service.js';

function normalize(c) {
  return { id: c._id, name: c.name, questions: c.previousYearQuestions?.length ?? 0, active: c.isActive ?? true };
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function ManageCompanies() {
  const [companies, setCompanies] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    listCompaniesAdmin()
      .then((data) => setCompanies(data.map(normalize)))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load companies.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addCompany = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError('');
    try {
      const data = await createCompany({ name, slug: slugify(name) });
      setCompanies((prev) => [...prev, normalize(data)]);
      setNewName('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add company.');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (id) => {
    const target = companies.find((c) => c.id === id);
    const nextActive = !target.active;
    const prev = companies;
    setCompanies((p) => p.map((c) => (c.id === id ? { ...c, active: nextActive } : c)));
    setError('');
    try {
      await updateCompany(id, { isActive: nextActive });
    } catch (err) {
      setCompanies(prev);
      setError(err.response?.data?.message || 'Failed to update company.');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this company? This cannot be undone.')) return;
    const prev = companies;
    setCompanies((p) => p.filter((c) => c.id !== id));
    setError('');
    try {
      await deleteCompany(id);
    } catch (err) {
      setCompanies(prev);
      setError(err.response?.data?.message || 'Failed to delete company.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Manage Companies</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">{companies.length} companies tracked</p>
      <ErrorBanner message={error} onRetry={load} />

      <Card className="p-4 mb-4">
        <form onSubmit={addCompany} className="flex gap-3 items-end">
          <div className="flex-1"><Input label="Add a company" placeholder="e.g. Salesforce" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          <Button type="submit" disabled={adding} className="w-auto px-5 mb-4">{adding ? 'Adding…' : 'Add'}</Button>
        </form>
      </Card>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading companies…</p>
      ) : (
        <Card className="p-1.5 overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse min-w-[560px]">
            <thead><tr className="text-left text-gray-400 text-[11.5px] uppercase tracking-wide">
              <th className="pb-2.5 px-3.5">Company</th><th className="pb-2.5 px-3.5">PYQs</th><th className="pb-2.5 px-3.5">Status</th><th className="pb-2.5 px-3.5"></th>
            </tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 px-3.5 border-t border-white/10 font-semibold">{c.name}</td>
                  <td className="py-3 px-3.5 border-t border-white/10 font-mono">{c.questions}</td>
                  <td className="py-3 px-3.5 border-t border-white/10">
                    <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${c.active ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>{c.active ? 'active' : 'inactive'}</span>
                  </td>
                  <td className="py-3 px-3.5 border-t border-white/10 whitespace-nowrap">
                    <button onClick={() => toggleActive(c.id)} className="text-primary text-xs font-semibold mr-3 hover:underline">{c.active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => remove(c.id)} className="text-red-400 text-xs font-semibold hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && <tr><td colSpan={4} className="text-center text-gray-500 py-8">No companies yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
