import { useEffect, useRef, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { startSession, getActiveSession, submitAnswer as submitAnswerApi, completeSession } from '../../services/mockInterview.service.js';

const STAGES = { LOADING: 'loading', INTRO: 'intro', QUESTION: 'question', DONE: 'done' };
const COUNT_OPTIONS = [5, 10, 15, 20];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Any category' }, { value: 'hr', label: 'HR' }, { value: 'technical', label: 'Technical' },
  { value: 'behavioral', label: 'Behavioral' }, { value: 'company-specific', label: 'Company-specific' },
];
const SUBJECT_OPTIONS = ['General', 'OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C++', 'C', 'Python', 'DSA'];

const SpeechRecognitionApi = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

const scoreColor = (n) => (n >= 7 ? 'text-green-400' : n >= 4 ? 'text-amber-400' : 'text-red-400');

export default function MockInterview() {
  const [stage, setStage] = useState(STAGES.LOADING);
  const [session, setSession] = useState(null); // server "public state": only the current question is ever present
  const [draft, setDraft] = useState('');
  const [answered, setAnswered] = useState(null); // { number, score } of the previous answer, shown above the next question
  const [filters, setFilters] = useState({ category: '', subject: '' });
  const [count, setCount] = useState(10);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const startedAtRef = useRef(Date.now());
  const recognitionRef = useRef(null);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
  };
  const stopSpeaking = () => { if (canSpeak) window.speechSynthesis.cancel(); };

  // Resume an unfinished interview after a refresh.
  useEffect(() => {
    let cancelled = false;
    getActiveSession()
      .then((s) => {
        if (cancelled) return;
        if (s?.currentQuestion) {
          setSession(s);
          startedAtRef.current = Date.now();
          setStage(STAGES.QUESTION);
        } else {
          setStage(STAGES.INTRO);
        }
      })
      .catch(() => !cancelled && setStage(STAGES.INTRO));
    return () => { cancelled = true; stopListening(); stopSpeaking(); };
  }, []);

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const payload = { count };
      if (filters.category) payload.category = filters.category;
      if (filters.subject) payload.subject = filters.subject;
      const s = await startSession(payload);
      setSession(s);
      setDraft('');
      setAnswered(null);
      startedAtRef.current = Date.now();
      setStage(STAGES.QUESTION);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start the mock interview.');
      setStage(STAGES.INTRO);
    } finally {
      setStarting(false);
    }
  };

  const submit = async () => {
    const q = session?.currentQuestion;
    const text = draft.trim();
    if (!q || submitting) return;
    if (!text) { setError('Please enter or speak an answer before submitting.'); return; }
    stopListening();
    stopSpeaking();
    setSubmitting(true);
    setError('');
    try {
      const { evaluation, session: next } = await submitAnswerApi(session.sessionId, q.id, text, Math.round((Date.now() - startedAtRef.current) / 1000));
      setAnswered({ number: q.number, score: evaluation.score });
      setSession(next);
      setDraft('');
      startedAtRef.current = Date.now();
      setStage(next.status === 'completed' || !next.currentQuestion ? STAGES.DONE : STAGES.QUESTION);
    } catch (err) {
      // Nothing was saved server-side, so the same answer can just be resubmitted.
      setError(err.response?.data?.message || 'Could not evaluate your answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const endEarly = async () => {
    if (!window.confirm('End the interview now? Unanswered questions will be skipped.')) return;
    stopListening();
    stopSpeaking();
    setError('');
    try {
      setSession(await completeSession(session.sessionId));
      setStage(STAGES.DONE);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not end the interview. Please try again.');
    }
  };

  const toggleMic = () => {
    if (listening) { stopListening(); return; }
    if (!SpeechRecognitionApi) return;
    const rec = new SpeechRecognitionApi();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interimText += t;
      }
      if (finalText) setDraft((d) => (d ? `${d.trimEnd()} ` : '') + finalText.trim());
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser, or type your answer.' : 'Voice input stopped. You can tap the mic to try again or type your answer.');
      setListening(false);
      setInterim('');
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    recognitionRef.current = rec;
    setError('');
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const speakQuestion = (text) => {
    if (!canSpeak) return;
    stopSpeaking();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  if (stage === STAGES.LOADING) {
    return <p className="text-gray-500 text-sm">Loading…</p>;
  }

  if (stage === STAGES.INTRO) {
    return (
      <Card className="p-8 sm:p-10 text-center max-w-lg mx-auto">
        <div className="text-4xl mb-3">🎙</div>
        <h3 className="font-bold mb-1">AI Mock Interview</h3>
        <p className="text-gray-400 text-sm mb-5">One question at a time. Answer by typing or speaking, then move on to the next one. Your score out of 10 and feedback for every answer are shown at the end.</p>
        <div className="grid sm:grid-cols-3 gap-3 mb-5 text-left">
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
            <option value="">Any subject</option>
            {SUBJECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none" aria-label="Number of questions">
            {COUNT_OPTIONS.map((n) => <option key={n} value={n}>{n} questions</option>)}
          </select>
        </div>
        <ErrorBanner message={error} />
        <Button onClick={start} disabled={starting} className="w-auto px-6">{starting ? 'Starting…' : 'Start mock interview'}</Button>
      </Card>
    );
  }

  if (stage === STAGES.DONE) {
    const avg = session?.summary?.averageScore;
    return (
      <div className="max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Interview complete</h2>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <ScoreTile label="Average score" value={avg == null ? '—' : `${avg}/10`} highlight />
          <ScoreTile label="Questions answered" value={`${session?.answeredCount ?? 0}/${session?.total ?? 0}`} />
        </div>
        <Card className="p-5 mb-5">
          <h3 className="font-bold text-sm mb-3">Your answers</h3>
          {session?.history?.some((h) => h.evaluationMode === 'local') && (
            <p className="text-[11.5px] text-gray-500 mb-3">AI evaluation was unavailable for some answers, so those scores are automatic estimates based on the expected key points.</p>
          )}
          {session?.history?.length ? (
            <div className="space-y-4">
              {session.history.map((h, i) => (
                <div key={h.id} className="text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-gray-200">Q{i + 1}. {h.question}</p>
                    <span className={`font-mono font-bold whitespace-nowrap ${scoreColor(h.score)}`}>{h.score}/10</span>
                  </div>
                  <p className="text-gray-400 mt-0.5 whitespace-pre-wrap break-words">{h.answerText}</p>
                  <p className="text-gray-300 mt-1">{h.feedback}</p>
                  <FeedbackList label="Strength" items={h.strengths} tone="text-green-400" />
                  <FeedbackList label="Missing" items={h.missingPoints} tone="text-amber-400" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No answers were submitted.</p>
          )}
        </Card>
        <ErrorBanner message={error} />
        <Button onClick={start} disabled={starting} className="w-full sm:w-auto px-6">{starting ? 'Starting…' : 'Retake interview'}</Button>
      </div>
    );
  }

  // QUESTION stage — exactly one question is on screen.
  const q = session.currentQuestion;
  const progressPct = Math.round((session.answeredCount / session.total) * 100);
  return (
    <Card className="p-5 sm:p-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400 font-bold">QUESTION {q.number} OF {session.total}</div>
        {session.answeredCount > 0 && (
          <button onClick={endEarly} className="text-xs text-gray-500 hover:text-gray-300 underline">End interview</button>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-5 mt-2">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${progressPct}%` }} />
      </div>
      <ErrorBanner message={error} />
      {answered && !error && (
        <p className="text-[12px] text-green-400 mb-3">✓ Question {answered.number} answered · scored {answered.score}/10</p>
      )}
      <div className="text-[16.5px] font-semibold mb-2">{q.text}</div>
      {canSpeak && (
        <button onClick={() => speakQuestion(q.text)} className="text-xs text-primary font-semibold mb-4 hover:underline">🔊 Read question aloud</button>
      )}
      <textarea
        className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3.5 text-sm outline-none focus:border-primary/60 resize-y min-h-[140px] disabled:opacity-60"
        placeholder="Type your answer, or tap the mic to speak it…"
        value={draft}
        disabled={submitting}
        onChange={(e) => setDraft(e.target.value)}
      />
      {interim && <p className="text-xs text-gray-500 italic mt-1.5">{interim}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        {SpeechRecognitionApi ? (
          <Button type="button" variant="ghost" onClick={toggleMic} disabled={submitting} className="w-full sm:w-auto px-4">
            {listening ? '⏹ Stop recording' : '🎤 Speak answer'}
          </Button>
        ) : (
          <span className="text-[11px] text-gray-500">Voice input isn't supported in this browser — please type your answer.</span>
        )}
        <Button onClick={submit} disabled={submitting || !draft.trim()} className="w-full sm:w-auto px-6">
          {submitting ? 'Submitting…' : session.currentQuestion.number >= session.total ? 'Submit & finish' : 'Submit & next'}
        </Button>
      </div>
    </Card>
  );
}

function FeedbackList({ label, items, tone }) {
  if (!items?.length) return null;
  return (
    <ul className="text-[13px] text-gray-300 space-y-1 mb-1">
      {items.map((it, i) => (
        <li key={`${it}-${i}`}><span className={`font-semibold ${tone}`}>{label}:</span> {it}</li>
      ))}
    </ul>
  );
}

function ScoreTile({ label, value, highlight }) {
  return (
    <Card className={`p-4 text-center ${highlight ? 'border-primary/50' : ''}`}>
      <div className="text-2xl font-extrabold font-mono">{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{label}</div>
    </Card>
  );
}
