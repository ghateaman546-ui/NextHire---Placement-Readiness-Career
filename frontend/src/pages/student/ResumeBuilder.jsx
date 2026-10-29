import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { blankResume, getMyBuilderResume, saveBuilderResume, updateBuilderResume } from '../../services/resume.service.js';

export default function ResumeBuilder() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Resume</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Build and manage your resume</p>

      <BuilderTab />
    </div>
  );
}

function BuilderTab() {
  const { user } = useAuth();
  const [resume, setResume] = useState(blankResume());
  const [resumeId, setResumeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getMyBuilderResume()
      .then((data) => {
        if (data) {
          const { id, ...sections } = data;
          setResumeId(id);
          setResume({ ...blankResume(), ...sections });
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your saved resume.'))
      .finally(() => setLoading(false));
  }, []);

  const update = (field, value) => setResume((r) => ({ ...r, [field]: value }));

  const updateItem = (field, index, key, value) => {
    setResume((r) => {
      const items = [...r[field]];
      items[index] = { ...items[index], [key]: value };
      return { ...r, [field]: items };
    });
  };

  const addItem = (field, blank) => setResume((r) => ({ ...r, [field]: [...r[field], blank] }));
  const removeItem = (field, index) => setResume((r) => ({ ...r, [field]: r[field].filter((_, i) => i !== index) }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = resumeId ? await updateBuilderResume(resumeId, resume) : await saveBuilderResume(resume);
      setResumeId(data._id);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save your resume.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Loading your resume…</p>;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card className="p-5 space-y-5">
        <ErrorBanner message={error} />

        <Field label="Summary">
          <textarea className="input-area" rows={3} value={resume.summary} onChange={(e) => update('summary', e.target.value)} />
        </Field>
        <Field label="Skills (comma-separated)">
          <input className="input-line" value={resume.skills.join(', ')} onChange={(e) => update('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
        </Field>

        <RepeatingSection
          title="Education" field="education" resume={resume}
          blank={{ institution: '', degree: '', year: '', cgpa: '' }}
          addItem={addItem} removeItem={removeItem}
          render={(ed, i) => (
            <div className="grid grid-cols-2 gap-2">
              <input className="input-line" placeholder="Institution" value={ed.institution} onChange={(e) => updateItem('education', i, 'institution', e.target.value)} />
              <input className="input-line" placeholder="Degree" value={ed.degree} onChange={(e) => updateItem('education', i, 'degree', e.target.value)} />
              <input className="input-line" placeholder="Year" value={ed.year} onChange={(e) => updateItem('education', i, 'year', e.target.value)} />
              <input className="input-line" placeholder="CGPA" value={ed.cgpa} onChange={(e) => updateItem('education', i, 'cgpa', e.target.value)} />
            </div>
          )}
        />

        <RepeatingSection
          title="Projects" field="projects" resume={resume}
          blank={{ title: '', tech: '', description: '' }}
          addItem={addItem} removeItem={removeItem}
          render={(p, i) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <input className="input-line" placeholder="Project title" value={p.title} onChange={(e) => updateItem('projects', i, 'title', e.target.value)} />
                <input className="input-line" placeholder="Tech stack" value={p.tech} onChange={(e) => updateItem('projects', i, 'tech', e.target.value)} />
              </div>
              <textarea className="input-area" rows={2} placeholder="Description" value={p.description} onChange={(e) => updateItem('projects', i, 'description', e.target.value)} />
            </div>
          )}
        />

        <RepeatingSection
          title="Experience" field="experience" resume={resume}
          blank={{ role: '', company: '', duration: '', description: '' }}
          addItem={addItem} removeItem={removeItem}
          render={(ex, i) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <input className="input-line" placeholder="Role" value={ex.role} onChange={(e) => updateItem('experience', i, 'role', e.target.value)} />
                <input className="input-line" placeholder="Company" value={ex.company} onChange={(e) => updateItem('experience', i, 'company', e.target.value)} />
              </div>
              <input className="input-line" placeholder="Duration" value={ex.duration} onChange={(e) => updateItem('experience', i, 'duration', e.target.value)} />
              <textarea className="input-area" rows={2} placeholder="Description" value={ex.description} onChange={(e) => updateItem('experience', i, 'description', e.target.value)} />
            </div>
          )}
        />

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="w-auto px-6">{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save resume'}</Button>
          <Button onClick={() => window.print()} variant="ghost" className="w-auto px-5">Print / Save as PDF</Button>
        </div>
      </Card>

      <Card className="p-6 bg-white text-gray-900 !border-0" id="resume-preview">
        <div className="max-w-md mx-auto font-serif">
          <h1 className="text-xl font-bold">{user?.name}</h1>
          <p className="text-xs text-gray-600 mb-3">{user?.email} {user?.linkedin ? `· ${user.linkedin}` : ''} {user?.github ? `· ${user.github}` : ''}</p>
          <p className="text-[12.5px] mb-3">{resume.summary}</p>

          <h2 className="text-[13px] font-bold uppercase border-b border-gray-300 mt-3 mb-1.5">Education</h2>
          {resume.education.map((ed, i) => <p key={i} className="text-[12px]"><b>{ed.institution}</b> — {ed.degree}, {ed.year} (CGPA {ed.cgpa})</p>)}

          <h2 className="text-[13px] font-bold uppercase border-b border-gray-300 mt-3 mb-1.5">Experience</h2>
          {resume.experience.map((ex, i) => (
            <div key={i} className="mb-1.5">
              <p className="text-[12px] font-semibold">{ex.role} <span className="font-normal text-gray-600">— {ex.company} · {ex.duration}</span></p>
              <p className="text-[11.5px] text-gray-700">{ex.description}</p>
            </div>
          ))}

          <h2 className="text-[13px] font-bold uppercase border-b border-gray-300 mt-3 mb-1.5">Projects</h2>
          {resume.projects.map((p, i) => (
            <div key={i} className="mb-1.5">
              <p className="text-[12px] font-semibold">{p.title} <span className="font-normal text-gray-600">— {p.tech}</span></p>
              <p className="text-[11.5px] text-gray-700">{p.description}</p>
            </div>
          ))}

          <h2 className="text-[13px] font-bold uppercase border-b border-gray-300 mt-3 mb-1.5">Skills</h2>
          <p className="text-[12px]">{resume.skills.join(' · ')}</p>
        </div>
      </Card>

      <style>{`
        .input-area { width:100%; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px 12px; font-size:13px; color:#fff; outline:none; }
        .input-area:focus { border-color:#3B82F6; }
        .input-line { width:100%; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:9px 12px; font-size:13px; color:#fff; outline:none; }
        .input-line:focus { border-color:#3B82F6; }
        @media print {
          body * { visibility: hidden; }
          #resume-preview, #resume-preview * { visibility: visible; }
          #resume-preview { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function RepeatingSection({ title, field, resume, blank, addItem, removeItem, render }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-400">{title}</div>
        <button onClick={() => addItem(field, blank)} className="text-xs text-primary hover:underline">+ Add</button>
      </div>
      {resume[field].map((item, i) => (
        <div key={i} className="bg-white/[0.03] rounded-lg p-3 mb-2 relative">
          {render(item, i)}
          <button onClick={() => removeItem(field, i)} className="absolute top-2 right-2 text-[11px] text-red-400 hover:underline">Remove</button>
        </div>
      ))}
      {resume[field].length === 0 && <p className="text-[12px] text-gray-500">None added yet.</p>}
    </div>
  );
}

function Field({ label, children }) {
  return <div><div className="text-xs font-semibold text-gray-400 mb-1.5">{label}</div>{children}</div>;
}
