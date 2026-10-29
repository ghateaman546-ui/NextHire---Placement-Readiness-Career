import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listAptitudeQuizzes, getQuiz, submitQuiz } from '../../services/quiz.service.js';

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard', 'Mixed'];
const DIFF_BADGE = {
  Easy: 'bg-green-500/15 text-green-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Hard: 'bg-red-500/15 text-red-400',
  Mixed: 'bg-primary/15 text-primary',
};

export default function Aptitude() {
  const [difficulty, setDifficulty] = useState('all');
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeQuizId, setActiveQuizId] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listAptitudeQuizzes(difficulty === 'all' ? undefined : difficulty)
      .then(setQuizzes)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load quizzes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [difficulty]);

  if (activeQuizId) {
    return <QuizRunner quizId={activeQuizId} onExit={() => setActiveQuizId(null)} />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Aptitude Practice</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Quantitative · Logical Reasoning · Verbal · Data Interpretation</p>
      <ErrorBanner message={error} onRetry={load} />

      <div className="flex gap-2 mb-5 flex-wrap">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${difficulty === d ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
          >
            {d === 'all' ? 'All' : d}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading quizzes…</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {quizzes.map((q) => (
            <Card key={q._id} onClick={() => setActiveQuizId(q._id)} className="p-5 cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-primary/40">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-accent font-bold uppercase tracking-wide">{q.category}</div>
                <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold ${DIFF_BADGE[q.difficulty] || DIFF_BADGE.Medium}`}>{q.difficulty || 'Medium'}</span>
              </div>
              <div className="text-base font-bold my-1.5">{q.title}</div>
              <div className="flex gap-3.5 text-xs text-gray-400">
                <span>📝 {q.questionCount} questions</span>
                <span>⏱ {Math.round((q.timerSeconds || 1200) / 60)} min</span>
              </div>
            </Card>
          ))}
          {quizzes.length === 0 && <p className="text-gray-500 text-sm">No quizzes published yet for this filter.</p>}
        </div>
      )}
    </div>
  );
}

export function QuizRunner({ quizId, onExit }) {
  const [quiz, setQuiz] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    getQuiz(quizId)
      .then((data) => {
        const normalized = {
          title: data.title,
          timerSeconds: data.timerSeconds || 60,
          questions: (data.questions || []).map((q) => ({
            id: q._id,
            question: q.question,
            options: q.options,
          })),
        };
        setQuiz(normalized);
        setSelected(Array(normalized.questions.length).fill(null));
        setTimeLeft(normalized.timerSeconds);
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load quiz.'));
  }, [quizId]);

  useEffect(() => {
    if (!quiz || finished) return;
    if (timeLeft <= 0) {
      finish();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished, quiz]);

  if (loadError) return <ErrorBanner message={loadError} onRetry={onExit} />;
  if (!quiz) return <p className="text-gray-500 text-sm">Loading quiz…</p>;

  const question = quiz.questions[idx];
  const progressPct = Math.round((idx / quiz.questions.length) * 100);

  const selectOption = (i) => {
    const next = [...selected];
    next[idx] = i;
    setSelected(next);
  };

  const next = () => {
    if (idx < quiz.questions.length - 1) setIdx(idx + 1);
    else finish();
  };

  async function finish() {
    setFinished(true);
    const answers = quiz.questions.map((q, i) => ({ questionId: q.id, selectedOptionIndex: selected[i] }));
    try {
      const data = await submitQuiz(quizId, answers, quiz.timerSeconds - timeLeft);
      setResult(data);
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit your quiz. Your answers were not saved.');
    }
  }

  if (finished) {
    if (submitError) {
      return (
        <Card className="p-6 max-w-2xl">
          <ErrorBanner message={submitError} />
          <Button onClick={onExit} className="w-auto px-6">Back to quizzes</Button>
        </Card>
      );
    }
    if (!result) return <p className="text-gray-500 text-sm">Scoring your quiz…</p>;

    const { result: r, questions: graded } = result;
    return (
      <Card className="p-6 max-w-2xl text-center">
        <div className="text-xs text-gray-400 font-bold uppercase">Instant Result</div>
        <div className="text-4xl font-extrabold my-2.5">{r.correctCount}/{r.totalQuestions}</div>
        <div className="text-gray-400 text-[13.5px] mb-1">Score: {r.score}</div>
        <div className="text-gray-400 text-[13.5px] mb-5">Accuracy: {Math.round((r.correctCount / r.totalQuestions) * 100)}%</div>
        <div className="text-left mb-5">
          {graded.map((q, i) => (
            <div key={q._id} className="py-2.5 border-t border-white/10 text-[13px]">
              <b>{i + 1}. {q.question}</b><br />
              <span className={selected[i] === q.correctOptionIndex ? 'text-green-400' : 'text-red-400'}>
                Your answer: {selected[i] != null ? q.options[selected[i]] : '(skipped)'}
              </span> · Correct: <span className="text-green-400">{q.options[q.correctOptionIndex]}</span>
              {q.explanation && <p className="text-gray-500 mt-1">{q.explanation}</p>}
            </div>
          ))}
        </div>
        <Button onClick={onExit} className="w-auto px-6">Back to quizzes</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-2xl">
      <div className="flex justify-between items-center mb-1">
        <div className="text-xs text-gray-400 font-bold">QUESTION {idx + 1} OF {quiz.questions.length}</div>
        <div className="text-sm text-amber-400 font-bold">⏱ {timeLeft}s</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-5">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="text-[16.5px] font-semibold mb-5">{question.question}</div>
      <div className="space-y-2.5">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => selectOption(i)}
            className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm text-left transition-colors ${
              selected[idx] === i ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.02] hover:border-primary/50'
            }`}
          >
            <span className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-[11.5px] font-bold flex-shrink-0">
              {String.fromCharCode(65 + i)}
            </span>
            {opt}
          </button>
        ))}
      </div>
      <div className="flex justify-end mt-4.5">
        <Button onClick={next} className="w-auto px-6">{idx === quiz.questions.length - 1 ? 'Submit' : 'Next →'}</Button>
      </div>
    </Card>
  );
}
