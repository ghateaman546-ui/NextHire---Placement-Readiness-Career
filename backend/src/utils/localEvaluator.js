/**
 * localEvaluator.js — offline fallback for AI Mock Interview scoring.
 *
 * Used ONLY when the AI provider can't be reached/used (missing or invalid ANTHROPIC_API_KEY,
 * network error, rate limit, bad output…). It makes NO network calls. It is a keyword-coverage
 * estimate: how many of the admin's expected core concepts does the answer mention?
 * Results are flagged as local so the UI can say the score is an estimate.
 *
 * Returns the same shape as the AI evaluator: { score 0-10, feedback, strengths[], missingPoints[] }.
 */

const STOPWORDS = new Set((
  'a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being ' +
  'it its i you your we our they their he she his her them my me do does did done have has had will would can could should ' +
  'may might must about into over under between through during before after so such very just also not no yes how what why ' +
  'when where which who whom whose here there more most some any each other another own same too able like use used using ' +
  'give example concrete stated tied explain describe mention'
).split(' '));

/** Lowercase word tokens with very light stemming so "learning/learned/learns" match. */
function keywords(text) {
  const out = [];
  for (const raw of String(text || '').toLowerCase().match(/[a-z0-9+#]+/g) || []) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function evaluateLocally({ expectedConcepts = [], answerText = '' }) {
  const answer = String(answerText).trim();
  const words = (answer.match(/\S+/g) || []).length;
  const answerStems = new Set(keywords(answer));
  // Allow prefix matches ("polymorph" ~ "polymorphism") for longer stems.
  const hasStem = (k) => answerStems.has(k) || (k.length >= 6 && [...answerStems].some((a) => a.length >= 5 && (a.startsWith(k.slice(0, 5)) || k.startsWith(a.slice(0, 5)))));

  const concepts = expectedConcepts.map((c) => String(c).trim()).filter(Boolean);
  const results = concepts.map((concept) => {
    const ks = [...new Set(keywords(concept))];
    if (!ks.length) return { concept, fraction: 0, missing: [], ks };
    const hit = ks.filter(hasStem);
    const needed = Math.max(1, Math.ceil(ks.length * 0.6)); // ~60% of a concept's key terms = full credit
    return { concept, fraction: Math.min(1, hit.length / needed), missing: ks.filter((k) => !hasStem(k)), ks };
  });

  let coverage;
  if (results.length) coverage = results.reduce((s, r) => s + r.fraction, 0) / results.length;
  else coverage = Math.min(1, words / 40); // no criteria at all: judge on substance only

  let score = Math.round(coverage * 10);
  // A few words can't fully answer an interview question, however well they match.
  if (words < 3) score = Math.min(score, 1);
  else if (words < 8) score = Math.min(score, 3);
  else if (words < 15) score = Math.min(score, 6);
  score = Math.max(0, Math.min(10, score));

  const label = (r) => (r.concept.split(/\s+/).length > 8 ? `Key ideas: ${r.ks.slice(0, 4).join(', ')}` : r.concept);
  const covered = results.filter((r) => r.fraction >= 0.99);
  const partial = results.filter((r) => r.fraction > 0 && r.fraction < 0.99);
  const uncovered = results.filter((r) => r.fraction < 0.99);

  const strengths = [...covered, ...partial.filter((r) => r.fraction >= 0.5)].slice(0, 3).map((r) => clip(`Addressed: ${label(r)}`, 120));
  const missingPoints = uncovered.slice(0, 3).map((r) => clip(r.fraction > 0 && r.missing.length ? `Add detail on: ${r.missing.slice(0, 4).join(', ')}` : label(r), 120));

  const total = results.length;
  const got = covered.length;
  let feedback;
  if (!total) feedback = `Automatic estimate (no expected points set): your answer has ${words} words.`;
  else if (score >= 8) feedback = `Automatic estimate: you covered ${got} of ${total} expected points well.`;
  else if (score >= 4) feedback = `Automatic estimate: you covered ${got} of ${total} expected points. Add the missing points to strengthen it.`;
  else feedback = `Automatic estimate: few of the ${total} expected points were found in your answer.`;
  if (words < 15 && total) feedback += ' A longer, more detailed answer would help.';

  return { score, feedback, strengths, missingPoints };
}

module.exports = { evaluateLocally };
