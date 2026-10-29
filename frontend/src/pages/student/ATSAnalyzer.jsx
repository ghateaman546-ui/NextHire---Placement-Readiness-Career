import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import Toast from '../../components/common/Toast.jsx';
import { useToast } from '../../hooks/useToast.js';
import { getMyBuilderResume } from '../../services/resume.service.js';
import {
  analyzeUploadedResume,
  analyzeBuilderResume,
  listAtsHistory,
  getAtsAnalysis,
  deleteAtsAnalysis,
  atsErrorMessage,
} from '../../services/ats.service.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'docx', 'doc'];
const MAX_JD_CHARS = 10000;

const LOADING_STEPS = [
  'Extracting resume text…',
  'Analyzing keywords…',
  'Checking skills…',
  'Checking ATS formatting…',
  'Generating recommendations…',
];

const STATUS = {
  good: { icon: '✓', cls: 'text-green-400', chip: 'bg-green-500/15 text-green-400', label: 'Good' },
  found: { icon: '✓', cls: 'text-green-400', chip: 'bg-green-500/15 text-green-400', label: 'Found' },
  warning: { icon: '⚠', cls: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-400', label: 'Needs improvement' },
  uncertain: { icon: '⚠', cls: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-400', label: 'Unconfirmed' },
  problem: { icon: '✗', cls: 'text-red-400', chip: 'bg-red-500/15 text-red-400', label: 'Problem detected' },
  missing: { icon: '✗', cls: 'text-red-400', chip: 'bg-red-500/15 text-red-400', label: 'Missing' },
};

const PRIORITY = {
  high: 'bg-red-500/15 text-red-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-white/10 text-gray-400',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function scoreTone(pct) {
  if (pct >= 75) return { color: '#22C55E', text: 'text-green-400', bar: 'bg-green-400' };
  if (pct >= 50) return { color: '#F59E0B', text: 'text-amber-400', bar: 'bg-amber-400' };
  return { color: '#EF4444', text: 'text-red-400', bar: 'bg-red-400' };
}

function validateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return 'Unsupported file type. Please upload a PDF, DOCX or DOC file.';
  if (file.size === 0) return 'This file is empty. Please choose a different file.';
  if (file.size > MAX_FILE_BYTES) return `File is too large (${formatSize(file.size)}). Maximum size is 5 MB.`;
  return '';
}

function buildReportText(r) {
  const L = [];
  L.push('NEXTHIRE — ATS RESUME REPORT');
  L.push(`Generated: ${new Date(r.createdAt || Date.now()).toLocaleString()}`);
  L.push(`Resume: ${r.fileName || 'Resume'}  |  Analysis: ${r.mode === 'job-match' ? 'Job match' : 'General'}`);
  L.push('');
  L.push(`ATS SCORE: ${r.score}/100 (${r.grade})`);
  L.push('');
  L.push('SCORE BREAKDOWN');
  r.breakdown.forEach((b) => L.push(`- ${b.label}: ${b.score}/${b.max} — ${b.explanation}`));
  if (r.mode === 'job-match') {
    L.push('');
    L.push(`KEYWORD MATCH: ${r.keywords.matchPercent}%`);
    L.push(`Matched: ${r.keywords.matched.map((k) => k.name).join(', ') || '—'}`);
    L.push(`Missing: ${r.keywords.missing.map((k) => k.name).join(', ') || '—'}`);
  }
  L.push('');
  L.push('SECTIONS');
  r.sections.forEach((s) => L.push(`${STATUS[s.status].icon} ${s.label}${s.note ? ` — ${s.note}` : ''}`));
  L.push('');
  L.push('ATS FORMATTING');
  r.formatting.forEach((f) => {
    L.push(`${STATUS[f.status].icon} ${f.label}: ${f.message}`);
    if (f.status !== 'good') {
      L.push(`    Problem: ${f.problem}`);
      L.push(`    Suggestion: ${f.suggestion}`);
    }
  });
  L.push('');
  L.push('HOW TO IMPROVE YOUR RESUME');
  r.suggestions.forEach((s, i) => L.push(`${i + 1}. [${s.priority.toUpperCase()}] ${s.title}\n   ${s.detail}`));
  if (r.notes?.length) {
    L.push('');
    L.push('NOTES');
    r.notes.forEach((n) => L.push(`- ${n}`));
  }
  return L.join('\n');
}

/* ───────────────────────── small presentational helpers ───────────────────────── */

function Bar({ percent, className = '' }) {
  const tone = scoreTone(percent);
  return (
    <div className={`h-2 rounded-full bg-white/[0.07] overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${tone.bar} transition-all duration-700`} style={{ width: `${Math.max(2, percent)}%` }} />
    </div>
  );
}

function ScoreRing({ score, size = 148 }) {
  const tone = scoreTone(score);
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `conic-gradient(${tone.color} ${score * 3.6}deg, rgba(255,255,255,0.07) 0)` }}
      role="img"
      aria-label={`ATS score ${score} out of 100`}
    >
      <div className="rounded-full bg-surface-card flex flex-col items-center justify-center" style={{ width: size - 26, height: size - 26 }}>
        <div className={`text-4xl font-extrabold leading-none ${tone.text}`}>{score}</div>
        <div className="text-[11px] text-gray-400 mt-1">out of 100</div>
      </div>
    </div>
  );
}

function Chip({ children, className = '', title }) {
  return (
    <span title={title} className={`inline-block px-2.5 py-1 rounded-lg text-[12px] font-semibold mr-1.5 mb-1.5 ${className}`}>
      {children}
    </span>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3">
      <h3 className="text-[15px] font-bold">{children}</h3>
      {hint && <p className="text-[12px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function StatusIcon({ status }) {
  const s = STATUS[status] || STATUS.warning;
  return <span className={`${s.cls} font-bold w-4 inline-block text-center shrink-0`}>{s.icon}</span>;
}

/* ───────────────────────── main page ───────────────────────── */

export default function ATSAnalyzer() {
  const [source, setSource] = useState('upload'); // 'upload' | 'builder'
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [jd, setJd] = useState('');

  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [builder, setBuilder] = useState({ loading: true, exists: false, error: '' });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const toast = useToast();
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const topRef = useRef(null);

  const loadHistory = useCallback(() => {
    listAtsHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
    getMyBuilderResume()
      .then((data) => setBuilder({ loading: false, exists: Boolean(data), error: '' }))
      .catch(() => setBuilder({ loading: false, exists: false, error: 'Could not check for a saved NextHire resume.' }));
  }, [loadHistory]);

  // cycle through the progress messages while the request is in flight
  useEffect(() => {
    if (!loading) return undefined;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [loading]);

  const pickFile = (f) => {
    if (!f) return;
    const problem = validateFile(f);
    setError('');
    if (problem) {
      setFile(null);
      setFileError(problem);
      return;
    }
    setFileError('');
    setFile(f);
  };

  const removeFile = () => {
    setFile(null);
    setFileError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    pickFile(e.dataTransfer.files?.[0]);
  };

  const canAnalyze = !loading && (source === 'upload' ? Boolean(file) : builder.exists);

  const run = async () => {
    if (!canAnalyze) return;
    if (jd.length > MAX_JD_CHARS) {
      setError(`Job description is too long (maximum ${MAX_JD_CHARS.toLocaleString()} characters).`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = source === 'upload' ? await analyzeUploadedResume(file, jd) : await analyzeBuilderResume(jd);
      setResult(data);
      loadHistory();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (err) {
      setError(atsErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const analyzeAgain = () => {
    if (source === 'upload' && !file) {
      setError('Upload your resume again to re-run the analysis.');
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    run();
  };

  const startNew = () => {
    setResult(null);
    removeFile();
    setError('');
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openHistory = async (id) => {
    setError('');
    try {
      const data = await getAtsAnalysis(id);
      setResult(data);
      if (data.jobDescription !== undefined) setJd(data.jobDescription || '');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (err) {
      setError(atsErrorMessage(err, 'Could not open that analysis.'));
    }
  };

  const removeHistory = async (id) => {
    try {
      await deleteAtsAnalysis(id);
      setHistory((h) => h.filter((x) => x.id !== id));
      if (result?.id === id) setResult(null);
    } catch (err) {
      setError(atsErrorMessage(err, 'Could not delete that analysis.'));
    }
  };

  const download = () => {
    const blob = new Blob([buildReportText(result)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ats-report-${result.score}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.show('ATS report downloaded');
  };

  return (
    <div className="ats-page">
      <style>{`
        @media print {
          aside, header, .ats-no-print { display: none !important; }
          body, main { background: #fff !important; }
          .ats-report, .ats-report * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
          .ats-report .glass-card { break-inside: avoid; }
        }
      `}</style>

      <div ref={topRef} className="ats-no-print">
        <h2 className="text-xl font-bold mb-1">ATS Resume Analyzer</h2>
        <p className="text-gray-400 text-[13.5px] mb-5">
          See how an Applicant Tracking System reads your resume — score, keyword match, formatting problems and specific fixes.
        </p>

        <ErrorBanner message={error} />

        <div className="grid lg:grid-cols-2 gap-5">
          {/* ───────── resume source ───────── */}
          <Card className="p-5">
            <SectionTitle>1. Choose your resume</SectionTitle>
            <div className="flex gap-1.5 mb-4" role="tablist">
              {[
                { key: 'upload', label: 'Upload Resume' },
                { key: 'builder', label: 'Analyze My NextHire Resume' },
              ].map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={source === t.key}
                  disabled={loading}
                  onClick={() => {
                    setSource(t.key);
                    setError('');
                  }}
                  className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition-colors disabled:opacity-50 ${
                    source === t.key ? 'bg-primary/20 border-primary/40 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {source === 'upload' ? (
              <div>
                {!file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-9 text-center transition-colors ${
                      dragging ? 'border-primary bg-primary/10' : 'border-white/15 hover:border-white/30 bg-white/[0.02]'
                    }`}
                  >
                    <div className="text-3xl mb-2">📄</div>
                    <div className="text-sm font-semibold">Drag & drop your resume here</div>
                    <div className="text-xs text-gray-400 mt-1">or click to browse · PDF, DOCX or DOC · max 5 MB</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-2xl">📄</div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{file.name}</div>
                        <div className="text-xs text-gray-400">{formatSize(file.size)}</div>
                      </div>
                    </div>
                    <button onClick={removeFile} disabled={loading} className="text-xs font-semibold text-red-300 hover:underline disabled:opacity-50 whitespace-nowrap">
                      Remove
                    </button>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
                {fileError && <p className="text-xs text-red-300 mt-2">{fileError}</p>}
                <p className="text-[11.5px] text-gray-500 mt-3">Use a text-based file. Scanned or image-only resumes cannot be read by an ATS (or by this analyzer).</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                {builder.loading ? (
                  <p className="text-sm text-gray-400">Checking for your saved resume…</p>
                ) : builder.exists ? (
                  <>
                    <div className="text-sm font-semibold mb-1">✓ Saved NextHire resume found</div>
                    <p className="text-xs text-gray-400">Your latest saved Resume Builder resume will be analyzed. Nothing in the builder is changed.</p>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold mb-1">{builder.error || 'No saved NextHire resume yet'}</div>
                    <p className="text-xs text-gray-400 mb-3">Build and save a resume in the Resume Builder first — or switch to “Upload Resume”.</p>
                    <Link to="/resume-builder" className="text-xs font-semibold text-primary hover:underline">
                      Open Resume Builder →
                    </Link>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* ───────── job description ───────── */}
          <Card className="p-5">
            <SectionTitle hint="Optional. Without one you get a general ATS quality analysis; with one you also get keyword and skill matching.">
              2. Target Job Description
            </SectionTitle>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              disabled={loading}
              rows={9}
              placeholder="Paste the complete job description here…"
              className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-3 text-[13px] text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-primary/60 resize-y"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-[11.5px] ${jd.length > MAX_JD_CHARS ? 'text-red-300' : 'text-gray-500'}`}>
                {jd.length.toLocaleString()} / {MAX_JD_CHARS.toLocaleString()}
              </span>
              <button onClick={() => setJd('')} disabled={!jd || loading} className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-40">
                Clear job description
              </button>
            </div>
          </Card>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={!canAnalyze} className="min-w-[180px]">
            {loading ? 'Analyzing…' : result ? 'Analyze Resume Again' : 'Analyze Resume'}
          </Button>
          {!canAnalyze && !loading && (
            <span className="text-xs text-gray-500">{source === 'upload' ? 'Choose a resume file to continue.' : 'Save a resume in the Resume Builder to use this option.'}</span>
          )}
        </div>

        {loading && (
          <Card className="p-5 mt-5" aria-live="polite">
            <div className="text-sm font-bold mb-3">Analyzing your resume…</div>
            <ul className="space-y-1.5">
              {LOADING_STEPS.map((s, i) => (
                <li key={s} className={`text-[13px] flex items-center gap-2 ${i < stepIdx ? 'text-green-400' : i === stepIdx ? 'text-white' : 'text-gray-600'}`}>
                  <span className="w-4 text-center">{i < stepIdx ? '✓' : i === stepIdx ? '…' : '·'}</span>
                  {s}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* ───────── report ───────── */}
      {result && !loading && (
        <div ref={resultRef} className="ats-report mt-8 scroll-mt-4">
          <Report result={result} onAgain={analyzeAgain} onNew={startNew} onClearJd={() => setJd('')} onDownload={download} jdSet={Boolean(jd)} />
        </div>
      )}

      {/* ───────── history ───────── */}
      {!historyLoading && history.length > 0 && (
        <Card className="p-5 mt-8 ats-no-print">
          <SectionTitle hint="Your most recent analyses are kept so you can compare versions.">Previous analyses</SectionTitle>
          <ul className="divide-y divide-white/10">
            {history.map((h) => {
              const tone = scoreTone(h.score);
              return (
                <li key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                  <button onClick={() => openHistory(h.id)} className="flex items-center gap-3 min-w-0 text-left hover:opacity-90">
                    <span className={`text-lg font-extrabold w-12 ${tone.text}`}>{h.score}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold truncate">{h.fileName || 'Resume'}</span>
                      <span className="block text-[11.5px] text-gray-500">
                        {new Date(h.createdAt).toLocaleString()} · {h.jobDescriptionProvided ? 'Job match' : 'General'}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => removeHistory(h.id)} className="text-xs text-gray-500 hover:text-red-300 whitespace-nowrap">
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Toast message={toast.message} onClose={toast.clear} />
    </div>
  );
}

/* ───────────────────────── report ───────────────────────── */

function Report({ result: r, onAgain, onNew, onClearJd, onDownload, jdSet }) {
  const job = r.mode === 'job-match';
  const matched = r.keywords?.matched || [];
  const missing = r.keywords?.missing || [];
  const relatedMissing = missing.filter((k) => k.advice === 'related');
  const gapMissing = missing.filter((k) => k.advice === 'gap');
  const skills = r.skills || {};
  const skillGroups = [
    ['Programming Languages', skills.programmingLanguages],
    ['Frameworks & Libraries', skills.frameworks],
    ['Databases', skills.databases],
    ['Tools & Platforms', skills.tools],
    ['Other Technical Skills', skills.otherSkills],
    ['Soft Skills', skills.soft],
  ].filter(([, list]) => list && list.length);
  const contentCards = [
    ['Summary', r.content?.summary],
    ['Experience', r.content?.experience],
    ['Projects', r.content?.projects],
    ['Skills', r.content?.skills],
    ['Education', r.content?.education],
  ];

  return (
    <div className="space-y-5">
      {/* header + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3 ats-no-print">
        <div>
          <h2 className="text-lg font-bold">ATS Report</h2>
          <p className="text-xs text-gray-400">
            {r.fileName || 'Resume'} · {job ? 'Job-match analysis' : 'General analysis'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onAgain}>Analyze Again</Button>
          <Button variant="ghost" onClick={onNew}>Upload Another Resume</Button>
          {jdSet && <Button variant="ghost" onClick={onClearJd}>Clear Job Description</Button>}
          <Button variant="ghost" onClick={onDownload}>Download Report</Button>
          <Button variant="ghost" onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/* score */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreRing score={r.score} />
          <div className="flex-1 w-full">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">ATS Score</div>
            <div className="text-2xl font-extrabold mb-0.5">
              {r.score}/100 <span className="text-base font-semibold text-gray-400">· {r.grade}</span>
            </div>
            <p className="text-[12.5px] text-gray-400 mb-4">
              {job
                ? 'Scored against the job description you provided.'
                : 'General analysis — no job description provided. Paste one to see keyword and skill match for a specific role.'}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Keyword Match', r.keywordMatch],
                ['Skills Match', r.skillsMatch],
                ['Formatting', r.formattingScore],
                ['Completeness', r.completenessScore],
              ].map(([label, pct]) => (
                <div key={label}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-gray-300">{label}</span>
                    <b>{pct}%</b>
                  </div>
                  <Bar percent={pct} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {r.notes?.length > 0 && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[12.5px] space-y-1">
          {r.notes.map((n) => (
            <p key={n}>ⓘ {n}</p>
          ))}
        </div>
      )}

      {/* breakdown */}
      <Card className="p-5">
        <SectionTitle hint="Every point comes from a fixed, repeatable rule — the same resume always gets the same score.">Score breakdown</SectionTitle>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          {r.breakdown.map((b) => (
            <div key={b.key}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[13px] font-semibold">{b.label}</span>
                <span className="text-[13px]">
                  <b>{b.score}</b>
                  <span className="text-gray-500">/{b.max}</span>
                </span>
              </div>
              <Bar percent={b.percent} />
              <p className="text-[11.5px] text-gray-400 mt-1">{b.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* job match */}
      {job && (
        <Card className="p-5">
          <SectionTitle hint={`${matched.length} of ${r.keywords.totalJobKeywords} job-description keywords found. Required keywords count double.`}>Job match</SectionTitle>
          <div className="flex items-center gap-3 mb-4">
            <div className={`text-3xl font-extrabold ${scoreTone(r.keywords.matchPercent).text}`}>{r.keywords.matchPercent}%</div>
            <div className="text-xs text-gray-400">keyword match</div>
          </div>

          <div className="mb-4">
            <div className="text-[12px] font-semibold text-gray-300 mb-2">Matched keywords</div>
            {matched.length ? (
              matched.map((k) => (
                <Chip key={k.name} className="bg-green-500/15 text-green-400" title={`${k.typeLabel} · ${k.priority}`}>
                  {k.name}
                </Chip>
              ))
            ) : (
              <p className="text-xs text-gray-500">None of the job-description keywords were found in your resume.</p>
            )}
          </div>

          {missing.length > 0 && (
            <div className="space-y-4">
              {relatedMissing.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-amber-300 mb-0.5">Missing — related to what you already have</div>
                  <p className="text-[11.5px] text-gray-500 mb-2">Add these only if you have genuinely used them.</p>
                  {relatedMissing.map((k) => (
                    <Chip key={k.name} className="bg-amber-500/15 text-amber-300" title={k.relatedTo?.length ? `Related to your: ${k.relatedTo.join(', ')}` : k.typeLabel}>
                      {k.name}
                      {k.priority === 'required' ? ' ★' : ''}
                    </Chip>
                  ))}
                </div>
              )}
              {gapMissing.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-red-300 mb-0.5">Missing — skill gaps</div>
                  <p className="text-[11.5px] text-gray-500 mb-2">Nothing in your resume points to these. Don’t add them unless you have real experience.</p>
                  {gapMissing.map((k) => (
                    <Chip key={k.name} className="bg-red-500/15 text-red-300" title={k.typeLabel}>
                      {k.name}
                      {k.priority === 'required' ? ' ★' : ''}
                    </Chip>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500">★ = listed as a requirement in the job description</p>
            </div>
          )}
        </Card>
      )}

      {/* skills */}
      <Card className="p-5">
        <SectionTitle>Skills found in your resume</SectionTitle>
        {skillGroups.length ? (
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
            {skillGroups.map(([label, list]) => (
              <div key={label}>
                <div className="text-[12px] font-semibold text-gray-300 mb-1.5">{label}</div>
                {list.map((s) => (
                  <Chip key={s} className="bg-secondary/20 text-indigo-300">
                    {s}
                  </Chip>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No recognised technical skills were found. Add a clear Skills section.</p>
        )}

        {job && (
          <div className="grid md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/10">
            {[
              ['Matched skills', skills.matched, 'bg-green-500/15 text-green-400', 'None of the technical skills in the job description were found.'],
              ['Missing skills', skills.missing, 'bg-red-500/15 text-red-300', 'You cover every technical skill in the job description.'],
              ['Additional skills', skills.additional, 'bg-white/10 text-gray-300', 'No extra skills beyond the job description.'],
            ].map(([label, list, cls, empty]) => (
              <div key={label}>
                <div className="text-[12px] font-semibold text-gray-300 mb-1.5">{label}</div>
                {list?.length ? list.map((s) => <Chip key={s} className={cls}>{s}</Chip>) : <p className="text-[11.5px] text-gray-500">{empty}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* sections + formatting */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <SectionTitle hint="⚠ means the section could not be confirmed — not necessarily that it’s missing.">Resume sections</SectionTitle>
          <ul className="space-y-2">
            {r.sections.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-[13px]">
                <StatusIcon status={s.status} />
                <div>
                  <span className="font-semibold">{s.label}</span>
                  {s.note && <div className="text-[11.5px] text-gray-400">{s.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle>ATS formatting</SectionTitle>
          <ul className="space-y-3">
            {r.formatting.map((f) => (
              <li key={f.id} className="text-[13px]">
                <div className="flex items-start gap-2">
                  <StatusIcon status={f.status} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{f.label}</span>
                      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-bold ${STATUS[f.status].chip}`}>{STATUS[f.status].label}</span>
                    </div>
                    <div className="text-[12px] text-gray-400">{f.message}</div>
                    {f.status !== 'good' && (
                      <div className="mt-1.5 text-[12px] space-y-1 rounded-lg bg-white/[0.04] px-3 py-2">
                        <div><b className="text-gray-200">Problem:</b> <span className="text-gray-400">{f.problem}</span></div>
                        <div><b className="text-gray-200">Suggestion:</b> <span className="text-gray-400">{f.suggestion}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* content analysis */}
      <Card className="p-5">
        <SectionTitle>Content analysis</SectionTitle>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contentCards.map(([label, c]) =>
            c ? (
              <div key={label} className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon status={c.status} />
                  <span className="text-[13px] font-bold">{label}</span>
                </div>
                <ul className="space-y-1.5">
                  {c.findings.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-[12px] text-gray-300">
                      <StatusIcon status={f.status} />
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      </Card>

      {/* suggestions */}
      <Card className="p-5">
        <SectionTitle hint="Specific to your resume, most important first.">How to improve your resume</SectionTitle>
        {r.suggestions.length ? (
          <ol className="space-y-3">
            {r.suggestions.map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-white/10 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{s.title}</span>
                    <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-bold uppercase ${PRIORITY[s.priority]}`}>{s.priority}</span>
                  </div>
                  <p className="text-[12.5px] text-gray-400 mt-0.5">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-green-400">Nothing major to fix — your resume looks ATS-ready.</p>
        )}
      </Card>
    </div>
  );
}
