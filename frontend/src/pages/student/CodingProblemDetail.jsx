import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/common/Card.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { DifficultyBadge } from '../../components/common/Badge.jsx';
import { getCodingProblem } from '../../services/codingProblem.service.js';

/**
 * Learning view: problem statement → examples → read-only example solution.
 * There is intentionally no editor, Run or Submit here — experimenting with code
 * happens in the Playground.
 */
export default function CodingProblemDetail() {
  const { slug } = useParams();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [language, setLanguage] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    getCodingProblem(slug)
      .then((data) => {
        setProblem(data);
        const withCode = (data.supportedLanguages || []).filter((l) => data.starterCode?.[l]?.trim());
        setLanguage(withCode[0] || '');
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load this problem.'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <p className="text-gray-500 text-sm">Loading problem…</p>;
  if (loadError) return <ErrorBanner message={loadError} />;
  if (!problem) return null;

  const solutionLanguages = (problem.supportedLanguages || []).filter((l) => problem.starterCode?.[l]?.trim());

  return (
    <div>
      <Link to="/coding-problems" className="text-xs text-primary hover:underline">← All problems</Link>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 mt-2">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h2 className="text-xl font-bold">{problem.title}</h2>
            <DifficultyBadge level={problem.difficulty} />
          </div>
          <p className="text-gray-400 text-xs mb-4">{problem.topic?.name || 'General'}</p>

          <Card className="p-5 mb-4">
            <p className="text-[13.5px] text-gray-200 whitespace-pre-line mb-4">{problem.description}</p>
            {problem.inputFormat && <Section title="Input Format" text={problem.inputFormat} />}
            {problem.outputFormat && <Section title="Output Format" text={problem.outputFormat} />}
            {problem.constraints && <Section title="Constraints" text={problem.constraints} />}
          </Card>

          {(problem.examples || []).map((ex, i) => (
            <Card key={i} className="p-4 mb-3">
              <div className="text-[11px] text-gray-500 font-bold uppercase mb-2">Example {i + 1}</div>
              <pre className="text-[12.5px] font-mono text-gray-300 whitespace-pre-wrap mb-1"><b>Input:</b> {ex.input}</pre>
              <pre className="text-[12.5px] font-mono text-gray-300 whitespace-pre-wrap mb-1"><b>Output:</b> {ex.output}</pre>
              {ex.explanation && <p className="text-[12.5px] text-gray-500">{ex.explanation}</p>}
            </Card>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-[11px] text-gray-500 font-bold uppercase">Example solution</div>
            {solutionLanguages.length > 1 && (
              <div className="flex gap-2">
                {solutionLanguages.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${language === l ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {language ? (
            <Card className="p-0 overflow-hidden mb-3">
              <pre className="w-full overflow-x-auto bg-[#0a0f1c] text-gray-100 font-mono text-[13px] p-4 leading-relaxed whitespace-pre">{problem.starterCode[language]}</pre>
            </Card>
          ) : (
            <Card className="p-5 mb-3">
              <p className="text-gray-500 text-sm">No example solution is available for this problem yet.</p>
            </Card>
          )}
          <p className="text-[12px] text-gray-500">Read the problem, study the examples, and trace through the solution step by step to see how it works.</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, text }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] text-gray-500 font-bold uppercase mb-1">{title}</div>
      <p className="text-[13px] text-gray-300 whitespace-pre-line">{text}</p>
    </div>
  );
}
