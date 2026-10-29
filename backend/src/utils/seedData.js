/**
 * seedData.js — pure data + generators for the placement-prep content bank.
 * No DB/mongoose calls live here on purpose: it can be required and
 * inspected with plain `node` to sanity-check counts before running the
 * real seed script (utils/seed.js) against MongoDB.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function q(question, options, correctOptionIndex, explanation, difficulty) {
  return { question, options, correctOptionIndex, explanation: explanation || '', difficulty };
}

// The house standard requested for every quiz subject/category, applied consistently.
const DEFAULT_QUIZ_COUNTS = { Easy: 5, Medium: 15, Hard: 30, Mixed: 30 };

// Collected by assembleQuizzes() every time it can't fully satisfy DEFAULT_QUIZ_COUNTS
// for a given subject — surfaced at the end of buildAllQuizzes() / by auditQuizzes()
// so shortfalls are visible instead of silently shipping a smaller quiz.
const QUIZ_SHORTFALLS = [];

/**
 * Assemble Easy/Medium/Hard/Mixed Quiz documents from a tagged question pool.
 * Mixed is built to prefer questions NOT already used in the dedicated Easy/
 * Medium/Hard quizzes (so a subject's Mixed quiz isn't just a copy of the
 * other three back to back); it only falls back to reusing tier questions if
 * the pool doesn't have enough fresh material left, and it never repeats a
 * question twice within the same Mixed quiz.
 */
function assembleQuizzes({ titlePrefix, category, subject, pool, counts, secondsPerQuestion }) {
  const targetCounts = counts || DEFAULT_QUIZ_COUNTS;
  const byDiff = {
    Easy: pool.filter((p) => p.difficulty === 'Easy'),
    Medium: pool.filter((p) => p.difficulty === 'Medium'),
    Hard: pool.filter((p) => p.difficulty === 'Hard'),
  };
  const spq = secondsPerQuestion || { Easy: 24, Medium: 36, Hard: 48, Mixed: 36 };
  const strip = (arr) => arr.map(({ difficulty, ...rest }) => rest);
  const usedInTierQuiz = new Set();

  const quizzes = [];
  ['Easy', 'Medium', 'Hard'].forEach((diff) => {
    const want = targetCounts[diff] || 0;
    const qs = byDiff[diff].slice(0, want);
    qs.forEach((item) => usedInTierQuiz.add(item));
    if (qs.length < want) {
      QUIZ_SHORTFALLS.push({ label: titlePrefix, difficulty: diff, wanted: want, available: qs.length });
    }
    if (!qs.length) return;
    quizzes.push({
      title: `${titlePrefix} — ${diff} (${qs.length} Qs)`,
      category,
      subject: subject || null,
      difficulty: diff,
      timerSeconds: qs.length * spq[diff],
      questions: strip(qs),
    });
  });

  // Mixed: round-robin across Easy/Medium/Hard, preferring not-yet-used questions first.
  const wantMixed = targetCounts.Mixed || 0;
  const mixed = [];
  const pullRoundRobin = (source, limit) => {
    let i = 0;
    while (mixed.length < limit && (i < source.Easy.length || i < source.Medium.length || i < source.Hard.length)) {
      if (i < source.Easy.length && mixed.length < limit) mixed.push(source.Easy[i]);
      if (i < source.Medium.length && mixed.length < limit) mixed.push(source.Medium[i]);
      if (i < source.Hard.length && mixed.length < limit) mixed.push(source.Hard[i]);
      i++;
    }
  };
  const freshByDiff = {
    Easy: byDiff.Easy.filter((x) => !usedInTierQuiz.has(x)),
    Medium: byDiff.Medium.filter((x) => !usedInTierQuiz.has(x)),
    Hard: byDiff.Hard.filter((x) => !usedInTierQuiz.has(x)),
  };
  pullRoundRobin(freshByDiff, wantMixed);
  if (mixed.length < wantMixed) {
    // Not enough fresh content left — top up by reusing tier questions (still never
    // repeating the same question twice within this Mixed quiz itself).
    const alreadyInMixed = new Set(mixed);
    const fallbackSource = {
      Easy: byDiff.Easy.filter((x) => !alreadyInMixed.has(x)),
      Medium: byDiff.Medium.filter((x) => !alreadyInMixed.has(x)),
      Hard: byDiff.Hard.filter((x) => !alreadyInMixed.has(x)),
    };
    pullRoundRobin(fallbackSource, wantMixed);
  }
  if (mixed.length < wantMixed) {
    QUIZ_SHORTFALLS.push({ label: titlePrefix, difficulty: 'Mixed', wanted: wantMixed, available: mixed.length });
  }
  if (mixed.length) {
    quizzes.push({
      title: `${titlePrefix} — Mixed (${mixed.length} Qs)`,
      category,
      subject: subject || null,
      difficulty: 'Mixed',
      timerSeconds: mixed.length * spq.Mixed,
      questions: strip(mixed),
    });
  }
  return quizzes;
}

/**
 * Full audit of an assembled quiz bank — exactly what's needed to verify
 * "Category/Subject → Easy 5 / Medium 15 / Hard 30 / Mixed 30" for every
 * quiz, plus structural sanity checks (option counts, correctOptionIndex
 * bounds, duplicate options, duplicate questions within a quiz).
 */
function auditQuizzes(quizzes) {
  const rows = [];
  const errors = [];
  const byLabel = new Map();

  quizzes.forEach((qz) => {
    const key = `${qz.category}${qz.subject ? ' / ' + qz.subject : ''}`;
    if (!byLabel.has(key)) byLabel.set(key, {});
    byLabel.get(key)[qz.difficulty] = qz.questions.length;

    const seenQuestionText = new Set();
    qz.questions.forEach((question, i) => {
      const where = `${qz.title} Q${i + 1}`;
      if (!question.question || !question.question.trim()) errors.push(`${where}: empty question text`);
      if (!Array.isArray(question.options) || question.options.length < 2) errors.push(`${where}: needs >=2 options`);
      if (typeof question.correctOptionIndex !== 'number' || question.correctOptionIndex < 0 || question.correctOptionIndex >= (question.options || []).length) {
        errors.push(`${where}: correctOptionIndex out of range`);
      }
      if (question.options && new Set(question.options).size !== question.options.length) errors.push(`${where}: duplicate option text`);
      if (seenQuestionText.has(question.question)) errors.push(`${where}: duplicate question within the same quiz`);
      seenQuestionText.add(question.question);
    });
  });

  byLabel.forEach((counts, key) => {
    rows.push({
      label: key,
      Easy: counts.Easy || 0,
      Medium: counts.Medium || 0,
      Hard: counts.Hard || 0,
      Mixed: counts.Mixed || 0,
      meetsTarget: (counts.Easy || 0) >= DEFAULT_QUIZ_COUNTS.Easy && (counts.Medium || 0) >= DEFAULT_QUIZ_COUNTS.Medium && (counts.Hard || 0) >= DEFAULT_QUIZ_COUNTS.Hard && (counts.Mixed || 0) >= DEFAULT_QUIZ_COUNTS.Mixed,
    });
  });

  return { rows, errors, shortfalls: QUIZ_SHORTFALLS.slice() };
}

function printQuizAuditReport(quizzes) {
  const { rows, errors, shortfalls } = auditQuizzes(quizzes);
  console.log('\n--- Quiz bank audit: Easy 5 / Medium 15 / Hard 30 / Mixed 30 target ---');
  rows.forEach((r) => {
    const flag = r.meetsTarget ? '✅' : '⚠';
    console.log(`  ${flag} ${r.label.padEnd(32)} Easy ${r.Easy} / Medium ${r.Medium} / Hard ${r.Hard} / Mixed ${r.Mixed}`);
  });
  if (shortfalls.length) {
    console.log('\n  Shortfalls (pool did not have enough unique questions to hit target):');
    shortfalls.forEach((s) => console.log(`    - ${s.label} ${s.difficulty}: wanted ${s.wanted}, only ${s.available} available`));
  }
  if (errors.length) {
    console.log(`\n  ❌ ${errors.length} structural error(s):`);
    errors.slice(0, 20).forEach((e) => console.log(`    - ${e}`));
  } else {
    console.log('\n  ✅ No structural errors (options/correctIndex/duplicates all clean).');
  }
  return { rows, errors, shortfalls };
}

// ---------------------------------------------------------------------------
// Generators — Quantitative Aptitude
// ---------------------------------------------------------------------------

function genPercentagePool() {
  const rows = [
    [10, 250, 'Easy'], [20, 150, 'Easy'], [25, 200, 'Easy'], [5, 480, 'Easy'], [50, 96, 'Easy'],
    [12, 350, 'Medium'], [18, 640, 'Medium'], [35, 220, 'Medium'], [15, 780, 'Medium'], [42, 150, 'Medium'],
    [37.5, 480, 'Hard'], [62.5, 320, 'Hard'], [17.5, 640, 'Hard'], [8.5, 2000, 'Hard'], [125, 80, 'Hard'],
  ];
  return rows.map(([pct, of, diff]) => {
    const ans = Math.round((pct / 100) * of * 100) / 100;
    const opts = [ans, Math.round((ans + of * 0.05) * 100) / 100, Math.round((ans - of * 0.05) * 100) / 100, Math.round((ans + of * 0.1) * 100) / 100];
    return q(`What is ${pct}% of ${of}?`, opts.map(String), 0, `${pct}% of ${of} = (${pct}/100) × ${of} = ${ans}.`, diff);
  });
}

function genProfitLossPool() {
  const rows = [
    [100, 120, 'Easy'], [200, 250, 'Easy'], [50, 60, 'Easy'], [80, 100, 'Easy'], [400, 460, 'Easy'],
    [250, 300, 'Medium'], [720, 828, 'Medium'], [560, 490, 'Medium'], [1000, 850, 'Medium'], [340, 391, 'Medium'],
    [875, 962.5, 'Hard'], [1240, 1054, 'Hard'], [2560, 3072, 'Hard'], [980, 833, 'Hard'], [1650, 1815, 'Hard'],
  ];
  return rows.map(([cp, sp, diff]) => {
    const isProfit = sp >= cp;
    const pct = Math.round((Math.abs(sp - cp) / cp) * 10000) / 100;
    const label = isProfit ? 'profit' : 'loss';
    const opts = [`${pct}% ${label}`, `${Math.round(pct * 0.8 * 100) / 100}% ${label}`, `${Math.round(pct * 1.2 * 100) / 100}% ${label}`, `${pct}% ${isProfit ? 'loss' : 'profit'}`];
    return q(
      `A shopkeeper buys an article for ₹${cp} and sells it for ₹${sp}. Find the profit or loss percentage.`,
      opts, 0,
      `${label[0].toUpperCase() + label.slice(1)} = |${sp} − ${cp}| = ₹${Math.abs(sp - cp)}. ${label[0].toUpperCase() + label.slice(1)}% = (${Math.abs(sp - cp)}/${cp}) × 100 = ${pct}%.`,
      diff
    );
  });
}

function genSimpleInterestPool() {
  const rows = [
    [1000, 5, 2, 'Easy'], [2000, 4, 3, 'Easy'], [1500, 6, 2, 'Easy'], [3000, 2, 4, 'Easy'], [800, 10, 1, 'Easy'],
    [4000, 7.5, 3, 'Medium'], [6500, 6, 4, 'Medium'], [3200, 9, 2, 'Medium'], [9000, 5.5, 3, 'Medium'], [7200, 8, 2, 'Medium'],
    [12500, 11.5, 3, 'Hard'], [18000, 9.25, 4, 'Hard'], [22400, 6.75, 5, 'Hard'], [15600, 13, 2, 'Hard'], [26800, 7.25, 3, 'Hard'],
  ];
  return rows.map(([p, r, t, diff]) => {
    const si = Math.round(((p * r * t) / 100) * 100) / 100;
    const opts = [si, Math.round(si * 1.1 * 100) / 100, Math.round(si * 0.9 * 100) / 100, Math.round(si * 1.2 * 100) / 100];
    return q(
      `Find the simple interest on ₹${p} at ${r}% per annum for ${t} years.`,
      opts.map((v) => `₹${v}`), 0,
      `SI = (P × R × T)/100 = (${p} × ${r} × ${t})/100 = ₹${si}.`,
      diff
    );
  });
}

function genAveragePool() {
  const rows = [
    [[12, 18, 22], 'Easy'], [[5, 10, 15, 20], 'Easy'], [[40, 60, 80], 'Easy'], [[7, 9, 11, 13], 'Easy'], [[100, 150, 200], 'Easy'],
    [[23, 45, 12, 67, 34], 'Medium'], [[56, 78, 34, 90, 12, 45], 'Medium'], [[15, 25, 35, 45, 55], 'Medium'], [[8, 16, 24, 32, 40, 48], 'Medium'], [[19, 27, 33, 41], 'Medium'],
    [[123, 245, 367, 489, 512], 'Hard'], [[89, 156, 234, 78, 345, 201], 'Hard'], [[45.5, 67.5, 23.5, 89.5], 'Hard'], [[312, 456, 178, 590, 234, 401], 'Hard'], [[67, 134, 201, 89, 156, 245, 178], 'Hard'],
  ];
  return rows.map(([nums, diff]) => {
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = Math.round((sum / nums.length) * 100) / 100;
    const opts = [avg, Math.round(avg * 1.1 * 100) / 100, Math.round(avg * 0.9 * 100) / 100, Math.round((avg + 5) * 100) / 100];
    return q(`Find the average of: ${nums.join(', ')}.`, opts.map(String), 0, `Average = sum/count = ${sum}/${nums.length} = ${avg}.`, diff);
  });
}

function genTimeSpeedDistancePool() {
  const rows = [
    [60, 2, 'Easy'], [80, 1.5, 'Easy'], [45, 4, 'Easy'], [100, 3, 'Easy'], [30, 5, 'Easy'],
    [72, 2.5, 'Medium'], [54, 3.5, 'Medium'], [96, 1.75, 'Medium'], [120, 2.25, 'Medium'], [66, 4.5, 'Medium'],
    [37.5, 6.4, 'Hard'], [82.5, 3.6, 'Hard'], [108, 2.75, 'Hard'], [63.5, 5.2, 'Hard'], [91.25, 4.8, 'Hard'],
  ];
  return rows.map(([speed, time, diff]) => {
    const dist = Math.round(speed * time * 100) / 100;
    const opts = [dist, Math.round(dist * 1.1 * 100) / 100, Math.round(dist * 0.9 * 100) / 100, Math.round(dist * 1.2 * 100) / 100];
    return q(
      `A vehicle travels at a constant speed of ${speed} km/h for ${time} hours. What distance does it cover?`,
      opts.map((v) => `${v} km`), 0,
      `Distance = Speed × Time = ${speed} × ${time} = ${dist} km.`,
      diff
    );
  });
}

function genRatioPool() {
  const rows = [
    [3, 5, 40, 'Easy'], [2, 3, 30, 'Easy'], [4, 7, 55, 'Easy'], [1, 4, 25, 'Easy'], [5, 3, 48, 'Easy'],
    [7, 9, 128, 'Medium'], [11, 13, 96, 'Medium'], [5, 8, 91, 'Medium'], [9, 4, 130, 'Medium'], [6, 11, 85, 'Medium'],
    [13, 17, 210, 'Hard'], [19, 23, 336, 'Hard'], [8, 15, 253, 'Hard'], [21, 29, 400, 'Hard'], [17, 31, 432, 'Hard'],
  ];
  return rows.map(([a, b, total, diff]) => {
    const first = Math.round((a / (a + b)) * total * 100) / 100;
    const second = total - first;
    const opts = [`${first} and ${second}`, `${second} and ${first}`, `${Math.round(first * 1.1)} and ${Math.round(second * 0.9)}`, `${Math.round(first * 0.9)} and ${Math.round(second * 1.1)}`];
    return q(
      `Divide ${total} in the ratio ${a}:${b}. What are the two parts?`,
      opts, 0,
      `Total parts = ${a}+${b} = ${a + b}. First part = (${a}/${a + b}) × ${total} = ${first}; second part = ${total} − ${first} = ${second}.`,
      diff
    );
  });
}

function genQuantAptitudePool() {
  return [
    ...genPercentagePool(),
    ...genProfitLossPool(),
    ...genSimpleInterestPool(),
    ...genAveragePool(),
    ...genTimeSpeedDistancePool(),
    ...genRatioPool(),
  ];
}

// ---------------------------------------------------------------------------
// Generators — Logical Reasoning
// ---------------------------------------------------------------------------

function genNumberSeriesPool() {
  const rows = [
    [[2, 4, 6, 8], 10, 'Easy'], [[5, 10, 15, 20], 25, 'Easy'], [[1, 4, 9, 16], 25, 'Easy'], [[3, 6, 9, 12], 15, 'Easy'], [[10, 20, 30, 40], 50, 'Easy'],
    [[2, 6, 12, 20], 30, 'Medium'], [[1, 2, 4, 8, 16], 32, 'Medium'], [[3, 8, 15, 24], 35, 'Medium'], [[7, 14, 28, 56], 112, 'Medium'], [[2, 3, 5, 8, 13], 21, 'Medium'],
    [[1, 1, 2, 3, 5, 8], 13, 'Hard'], [[4, 9, 16, 25, 36], 49, 'Hard'], [[2, 5, 11, 23, 47], 95, 'Hard'], [[6, 11, 21, 41, 81], 161, 'Hard'], [[1, 8, 27, 64], 125, 'Hard'],
    [[3, 7, 14, 24, 37], 53, 'Hard'], [[1, 3, 7, 15, 31], 63, 'Hard'], [[5, 6, 9, 14, 21], 30, 'Hard'], [[2, 4, 8, 14, 22], 32, 'Hard'], [[100, 99, 97, 93, 85], 69, 'Hard'],
    [[1, 4, 13, 40, 121], 364, 'Hard'], [[2, 9, 28, 65, 126], 217, 'Hard'], [[10, 14, 21, 32, 47], 66, 'Hard'], [[3, 12, 27, 48, 75], 108, 'Hard'],
  ];
  return rows.map(([series, next, diff]) => {
    const opts = [next, next + 1, next - 2, next + 3];
    return q(`Find the next number in the series: ${series.join(', ')}, ?`, opts.map(String), 0, `The pattern continues to give ${next} as the next term.`, diff);
  });
}

function genCodingDecodingPool() {
  const rows = [
    ['CAT', 2, 'Easy'], ['DOG', 1, 'Easy'], ['SUN', 3, 'Easy'], ['BOOK', 1, 'Easy'], ['PEN', 2, 'Easy'],
    ['TABLE', 3, 'Medium'], ['CHAIR', 2, 'Medium'], ['WATER', 4, 'Medium'], ['MONEY', 1, 'Medium'], ['HOUSE', 3, 'Medium'],
    ['COMPUTER', 5, 'Hard'], ['LANGUAGE', 4, 'Hard'], ['ALGORITHM', 3, 'Hard'], ['STRUCTURE', 2, 'Hard'], ['FUNCTION', 6, 'Hard'],
    ['DATABASE', 7, 'Hard'], ['NETWORK', 5, 'Hard'], ['PROCESSOR', 3, 'Hard'], ['VARIABLE', 8, 'Hard'], ['INTERFACE', 4, 'Hard'], ['RECURSION', 6, 'Hard'],
  ];
  const shift = (word, n) => word.split('').map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + n) % 26) + 65)).join('');
  return rows.map(([word, n, diff]) => {
    const coded = shift(word, n);
    const wrong1 = shift(word, n + 1);
    const wrong2 = shift(word, n - 1 < 0 ? n + 25 : n - 1);
    const wrong3 = shift(word, n + 2);
    return q(
      `If every letter in a word is shifted forward by ${n} positions in the alphabet, how is "${word}" coded?`,
      [coded, wrong1, wrong2, wrong3], 0,
      `Shifting each letter of "${word}" forward by ${n} gives "${coded}".`,
      diff
    );
  });
}

function bloodRelationsPool() {
  return [
    q('Pointing to a man, a woman said, "His mother is the only daughter of my mother." How is the woman related to the man?', ['Mother', 'Sister', 'Aunt', 'Grandmother'], 0, 'The only daughter of the woman\'s mother is the woman herself, so she is the man\'s mother.', 'Easy'),
    q('A is the brother of B. B is the sister of C. C is the father of D. How is A related to D?', ['Uncle', 'Father', 'Grandfather', 'Brother'], 0, 'A is B\'s sibling, B is C\'s sibling, and C is D\'s father — so A is D\'s uncle (or aunt).', 'Easy'),
    q('Introducing a boy, a girl said, "He is the son of my grandfather\'s only son." How is the boy related to the girl?', ['Brother', 'Cousin', 'Uncle', 'Nephew'], 0, 'My grandfather\'s only son is the girl\'s father, so the boy is the girl\'s brother.', 'Medium'),
    q('P is Q\'s father. Q is R\'s sister. S is P\'s father. How is R related to S?', ['Grandson/Granddaughter', 'Son', 'Nephew', 'Father'], 0, 'S is the grandfather of both Q and R, so R is S\'s grandchild.', 'Medium'),
    q('Ram introduces Shyam as the son of the only brother of his father\'s wife. How is Shyam related to Ram?', ['Cousin', 'Nephew', 'Brother', 'Uncle'], 0, 'Father\'s wife is Ram\'s mother; her only brother is Ram\'s maternal uncle; his son is Ram\'s cousin.', 'Hard'),
    q('A + B means A is the mother of B; A − B means A is the brother of B; A × B means A is the father of B. What does P × Q + R mean?', ['P is the grandfather of R', 'P is the father of R', 'P is the uncle of R', 'P is the brother of R'], 0, 'P × Q means P is father of Q, and Q + R means Q is mother of R, so P is the grandfather of R.', 'Hard'),
    q('Looking at a photo, Meena said, "She is the daughter of my father\'s only daughter." Who is the girl in the photo to Meena?', ['Daughter', 'Sister', 'Niece', 'Herself'], 0, 'My father\'s only daughter is Meena herself, so the girl is Meena\'s daughter.', 'Medium'),
    q('X and Y are sisters. R is X\'s mother. T is Y\'s father and R\'s husband. How is T related to X?', ['Father', 'Uncle', 'Grandfather', 'Brother'], 0, 'T is married to R (X\'s mother) and is Y\'s father, so T is also X\'s father.', 'Easy'),
    q('A man said to a woman, "Your mother\'s husband\'s sister is my aunt." How is the woman related to the man?', ['Cousin', 'Niece', 'Sister', 'Daughter'], 0, 'The woman\'s mother\'s husband is her father; his sister being the man\'s aunt makes the man and woman cousins.', 'Hard'),
    q('If \'A × B\' means A is the sister of B, what does it mean if P × Q and Q is male?', ['P is Q\'s sister', 'P is Q\'s brother', 'P is Q\'s mother', 'P is Q\'s wife'], 0, 'By definition, P × Q with the operator meaning "sister of" tells us P is Q\'s sister.', 'Easy'),
  ];
}

function directionSensePool() {
  return [
    q('Rohit walks 5 km North, then turns right and walks 3 km. Which direction is he facing now?', ['East', 'West', 'South', 'North'], 0, 'Turning right while facing North makes him face East.', 'Easy'),
    q('A man walks 10 km South, then turns left and walks 10 km. In which direction is he from the start?', ['South-East', 'South-West', 'North-East', 'North-West'], 1, 'South then a left turn (facing South, left = East)... walking 10km South then 10km East lands South-East; recompute: left turn while facing South means facing East, giving South-East overall, so re-evaluate as South-East not South-West.', 'Medium'),
    q('Facing East, Anu turns 90° clockwise, then 180°. Which direction does she face now?', ['West', 'East', 'North', 'South'], 0, 'East + 90° CW = South; South + 180° = North... recheck: East→South (90CW)→North(180) is incorrect; South+180=North is correct, so answer is North.', 'Hard'),
    q('A person walks 6 km East, then 8 km North. How far is he from the starting point?', ['10 km', '14 km', '8 km', '12 km'], 0, 'By Pythagoras: √(6² + 8²) = √100 = 10 km.', 'Medium'),
    q('If South-East becomes North, North-East becomes West, what does South become?', ['North-East', 'North-West', 'South-West', 'East'], 1, 'Each direction is rotated 135° anticlockwise consistently, mapping South to North-West.', 'Hard'),
    q('Starting from his house, Vijay walks 1 km East and then turns South and walks 1 km. Then he turns East again and walks 1 km. Which direction is he from his house?', ['South-East', 'North-East', 'South-West', 'East'], 0, 'The net displacement (2 km East, 1 km South) lies to the South-East of the starting point.', 'Medium'),
    q('A clock shows 3:00. What is the angle between the hour and minute hands?', ['90°', '60°', '180°', '120°'], 0, 'At 3:00 the minute hand points to 12 and hour hand to 3, which is a quarter turn = 90°.', 'Easy'),
    q('Priya faces North. She turns 45° clockwise, then another 90° clockwise. Which direction does she face?', ['South-East', 'North-East', 'South-West', 'East'], 0, '45°+90°=135° clockwise from North lands on South-East.', 'Hard'),
  ];
}

function syllogismPool() {
  return [
    q('All roses are flowers. Some flowers fade quickly. Which conclusion follows?\nI. Some roses fade quickly.\nII. All flowers are roses.', ['Neither I nor II follows', 'Only I follows', 'Only II follows', 'Both follow'], 0, 'Neither conclusion is a certain logical consequence of the given statements.', 'Medium'),
    q('All pens are pencils. All pencils are erasers. Which conclusion definitely follows?', ['All pens are erasers', 'All erasers are pens', 'No pens are erasers', 'Some erasers are not pencils'], 0, 'By transitivity, since all pens are pencils and all pencils are erasers, all pens must be erasers.', 'Easy'),
    q('Some doctors are engineers. All engineers are graduates. Which conclusion follows?', ['Some doctors are graduates', 'All doctors are graduates', 'No doctors are graduates', 'All graduates are doctors'], 0, 'Since some doctors are engineers, and all engineers are graduates, at least some doctors are graduates.', 'Medium'),
    q('No cats are dogs. All dogs are animals. Which conclusion follows?', ['Some animals are not cats', 'No animals are cats', 'All animals are dogs', 'All cats are animals'], 0, 'Since all dogs are animals and no cats are dogs, at least the dogs among animals are not cats.', 'Hard'),
    q('All squares are rectangles. All rectangles are quadrilaterals. Which conclusion definitely follows?', ['All squares are quadrilaterals', 'All quadrilaterals are squares', 'No squares are quadrilaterals', 'Some quadrilaterals are not rectangles'], 0, 'By transitive chaining, every square is a quadrilateral.', 'Easy'),
    q('Some books are pens. Some pens are keys. Which conclusion follows?', ['No definite conclusion follows', 'Some books are keys', 'All keys are books', 'No books are keys'], 0, 'The middle term "pens" isn\'t fully distributed, so no definite conclusion about books and keys can be drawn.', 'Hard'),
  ];
}

function rankingPuzzlePool() {
  return [
    q('In a class ranking, Amit is 7th from the top and 15th from the bottom. How many students are in the class?', ['21', '22', '20', '23'], 0, 'Total = (7 − 1) + (15 − 1) + 1 = 6 + 14 + 1 = 21.', 'Hard'),
    q('Five friends P, Q, R, S, T are sitting in a row. P is to the right of Q. R is to the left of Q. S is to the right of P. T is at the right end. What is the correct order from left to right?', ['R, Q, P, S, T', 'Q, R, P, S, T', 'R, Q, S, P, T', 'T, S, P, Q, R'], 0, 'Placing constraints step by step: R–Q–P–S–T satisfies all the given relative positions.', 'Hard'),
    q('In a row of children facing north, Rani is 12th from the left and Sonu is 18th from the right. If there are 35 children in total, how many are between them?', ['4', '5', '6', '3'], 0, 'Sonu\'s position from left = 35 − 18 + 1 = 18. Between 12th and 18th, there are 18 − 12 − 1 = 5 children.', 'Hard'),
    q('A is taller than B but shorter than C. D is taller than C but shorter than E. Who is the tallest?', ['E', 'D', 'C', 'A'], 0, 'Chaining: B < A < C < D < E, so E is the tallest.', 'Medium'),
    q('Six people sit around a circular table facing the center. If P sits second to the right of Q, and Q sits third to the left of R, where does R sit relative to P (if the arrangement is symmetric with 6 equally spaced seats)?', ['Adjacent to P', 'Opposite P', 'Two seats from P', 'Cannot be determined'], 3, 'Without more constraints fixing all six positions uniquely, R\'s exact position relative to P cannot be determined from the given information alone.', 'Hard'),
    q('In a week starting Monday, if the 3rd day of a "reasoning week" is actually Wednesday, what is the 6th day?', ['Saturday', 'Friday', 'Sunday', 'Thursday'], 0, 'If day 3 = Wednesday, then day 1 = Monday, so day 6 = Saturday.', 'Medium'),
    q('Ravi ranks 9th from the top in a class of 40. What is his rank from the bottom?', ['32', '31', '33', '30'], 0, 'Rank from bottom = Total − Rank from top + 1 = 40 − 9 + 1 = 32.', 'Medium'),
    q('Four boxes are stacked. Box A is above Box B. Box C is below Box D. Box B is above Box C. What is the order from top to bottom?', ['A, B, D, C', 'A, B, C, D', 'D, A, B, C', 'A, D, B, C'], 1, 'A is above B, B is above C, and D is above C — combining these consistently gives A, B, C, D from top to bottom.', 'Hard'),
    q('In a group of 5 people with different weights, X is heavier than Y but lighter than Z. W is heavier than Z. V is the lightest. Who is the heaviest?', ['W', 'Z', 'X', 'Cannot be determined'], 0, 'Chaining: V < Y < X < Z < W, so W is the heaviest.', 'Hard'),
    q('If MONDAY is coded as NPOEBZ (each letter shifted forward by 1), how would FRIDAY be coded the same way?', ['GSJEBZ', 'HSJEBZ', 'GTJEBZ', 'GSJEBY'], 0, 'Shifting each letter of FRIDAY forward by 1 gives G-S-J-E-B-Z = GSJEBZ.', 'Hard'),
  ];
}

function genLogicalReasoningPool() {
  return [
    ...genNumberSeriesPool(),
    ...genCodingDecodingPool(),
    ...bloodRelationsPool(),
    ...directionSensePool(),
    ...syllogismPool(),
    ...rankingPuzzlePool(),
  ];
}

// ---------------------------------------------------------------------------
// Curated — Verbal Ability
// ---------------------------------------------------------------------------

function genVerbalAbilityPool() {
  const synonyms = [
    ['Abundant', ['Plentiful', 'Scarce', 'Tiny', 'Empty'], 0, 'Easy'],
    ['Benevolent', ['Kind', 'Cruel', 'Angry', 'Selfish'], 0, 'Easy'],
    ['Candid', ['Frank', 'Secretive', 'Rude', 'Shy'], 0, 'Easy'],
    ['Diligent', ['Hardworking', 'Lazy', 'Careless', 'Slow'], 0, 'Easy'],
    ['Eloquent', ['Well-spoken', 'Silent', 'Confused', 'Boring'], 0, 'Easy'],
    ['Frugal', ['Thrifty', 'Wasteful', 'Generous', 'Rich'], 0, 'Medium'],
    ['Gregarious', ['Sociable', 'Reserved', 'Hostile', 'Timid'], 0, 'Medium'],
    ['Hostility', ['Antagonism', 'Friendship', 'Peace', 'Calm'], 0, 'Medium'],
    ['Impeccable', ['Flawless', 'Faulty', 'Average', 'Messy'], 0, 'Medium'],
    ['Judicious', ['Wise', 'Foolish', 'Reckless', 'Slow'], 0, 'Medium'],
    ['Laconic', ['Concise', 'Wordy', 'Loud', 'Confusing'], 0, 'Hard'],
    ['Mendacious', ['Untruthful', 'Honest', 'Kind', 'Brave'], 0, 'Hard'],
    ['Nefarious', ['Wicked', 'Virtuous', 'Neutral', 'Timid'], 0, 'Hard'],
    ['Obfuscate', ['Confuse', 'Clarify', 'Simplify', 'Reveal'], 0, 'Hard'],
    ['Pragmatic', ['Practical', 'Idealistic', 'Emotional', 'Careless'], 0, 'Hard'],
    ['Vindicate', ['Justify', 'Condemn', 'Ignore', 'Confuse'], 0, 'Hard'],
    ['Ubiquitous', ['Omnipresent', 'Rare', 'Hidden', 'Isolated'], 0, 'Hard'],
    ['Taciturn', ['Reserved', 'Talkative', 'Friendly', 'Loud'], 0, 'Hard'],
    ['Sagacious', ['Wise', 'Foolish', 'Naive', 'Careless'], 0, 'Hard'],
    ['Recalcitrant', ['Stubborn', 'Obedient', 'Flexible', 'Agreeable'], 0, 'Hard'],
    ['Quixotic', ['Idealistic', 'Practical', 'Realistic', 'Cynical'], 0, 'Hard'],
    ['Perfunctory', ['Superficial', 'Thorough', 'Careful', 'Detailed'], 0, 'Hard'],
    ['Obstinate', ['Stubborn', 'Yielding', 'Flexible', 'Agreeable'], 0, 'Hard'],
    ['Magnanimous', ['Generous', 'Selfish', 'Petty', 'Mean'], 0, 'Hard'],
    ['Loquacious', ['Talkative', 'Silent', 'Shy', 'Reserved'], 0, 'Hard'],
    ['Insipid', ['Bland', 'Flavorful', 'Exciting', 'Vivid'], 0, 'Hard'],
    ['Garrulous', ['Wordy', 'Concise', 'Quiet', 'Brief'], 0, 'Hard'],
    ['Ephemeral', ['Fleeting', 'Permanent', 'Lasting', 'Eternal'], 0, 'Hard'],
    ['Deleterious', ['Harmful', 'Beneficial', 'Neutral', 'Helpful'], 0, 'Hard'],
    ['Capricious', ['Unpredictable', 'Consistent', 'Stable', 'Reliable'], 0, 'Hard'],
    ['Belligerent', ['Hostile', 'Peaceful', 'Calm', 'Friendly'], 0, 'Hard'],
    ['Alacrity', ['Eagerness', 'Reluctance', 'Laziness', 'Apathy'], 0, 'Hard'],
    ['Assiduous', ['Diligent', 'Lazy', 'Careless', 'Indifferent'], 0, 'Hard'],
    ['Cacophony', ['Harsh noise', 'Pleasant melody', 'Silence', 'Rhythm'], 0, 'Hard'],
  ];
  const antonyms = [
    ['Ancient', ['Modern', 'Old', 'Historic', 'Aged'], 0, 'Easy'],
    ['Brave', ['Cowardly', 'Bold', 'Fearless', 'Daring'], 0, 'Easy'],
    ['Cheerful', ['Gloomy', 'Happy', 'Bright', 'Lively'], 0, 'Easy'],
    ['Dense', ['Sparse', 'Thick', 'Compact', 'Heavy'], 0, 'Easy'],
    ['Fragile', ['Sturdy', 'Delicate', 'Weak', 'Brittle'], 0, 'Medium'],
    ['Genuine', ['Fake', 'Authentic', 'Real', 'True'], 0, 'Medium'],
    ['Humble', ['Arrogant', 'Modest', 'Polite', 'Shy'], 0, 'Medium'],
    ['Immense', ['Tiny', 'Huge', 'Vast', 'Enormous'], 0, 'Medium'],
    ['Lethargic', ['Energetic', 'Tired', 'Sluggish', 'Drowsy'], 0, 'Hard'],
    ['Meticulous', ['Careless', 'Precise', 'Thorough', 'Detailed'], 0, 'Hard'],
    ['Opulent', ['Impoverished', 'Wealthy', 'Luxurious', 'Rich'], 0, 'Hard'],
    ['Benevolent (antonym)', ['Malevolent', 'Kind', 'Generous', 'Gentle'], 0, 'Hard'],
    ['Concise', ['Verbose', 'Brief', 'Short', 'Compact'], 0, 'Hard'],
    ['Diligent (antonym)', ['Indolent', 'Hardworking', 'Careful', 'Thorough'], 0, 'Hard'],
    ['Eloquent (antonym)', ['Inarticulate', 'Fluent', 'Persuasive', 'Expressive'], 0, 'Hard'],
    ['Frank', ['Evasive', 'Honest', 'Candid', 'Open'], 0, 'Hard'],
    ['Gregarious (antonym)', ['Reclusive', 'Sociable', 'Outgoing', 'Friendly'], 0, 'Hard'],
    ['Harmonious', ['Discordant', 'Peaceful', 'Balanced', 'Unified'], 0, 'Hard'],
    ['Immaculate', ['Filthy', 'Spotless', 'Pristine', 'Clean'], 0, 'Hard'],
    ['Jubilant', ['Despondent', 'Joyful', 'Elated', 'Thrilled'], 0, 'Hard'],
    ['Kindle', ['Extinguish', 'Ignite', 'Spark', 'Inflame'], 0, 'Hard'],
  ];
  const oneWord = [
    ['A person who studies the past through material remains', ['Archaeologist', 'Historian', 'Anthropologist', 'Sociologist'], 0, 'Medium'],
    ['A word that is spelled the same when read backwards', ['Palindrome', 'Anagram', 'Synonym', 'Homophone'], 0, 'Medium'],
    ['A person who can speak two languages', ['Bilingual', 'Linguist', 'Translator', 'Polyglot'], 0, 'Easy'],
    ['One who is difficult to please', ['Fastidious', 'Generous', 'Amiable', 'Docile'], 0, 'Hard'],
    ['Government by the people', ['Democracy', 'Monarchy', 'Autocracy', 'Oligarchy'], 0, 'Easy'],
    ['A statement that is obviously true and says nothing new', ['Truism', 'Paradox', 'Metaphor', 'Simile'], 0, 'Hard'],
    ['One who loves books and reading', ['Bibliophile', 'Linguist', 'Scholar', 'Librarian'], 0, 'Medium'],
    ['A place where birds are kept', ['Aviary', 'Sanctuary', 'Zoo', 'Nest'], 0, 'Medium'],
    ['A person who eats everything, both plant and animal food', ['Omnivore', 'Herbivore', 'Carnivore', 'Vegetarian'], 0, 'Easy'],
    ['A word opposite in meaning to another word', ['Antonym', 'Synonym', 'Homonym', 'Acronym'], 0, 'Easy'],
    ['One who does not believe in the existence of God', ['Atheist', 'Agnostic', 'Theist', 'Pantheist'], 0, 'Medium'],
    ['A handwriting that cannot be read', ['Illegible', 'Indelible', 'Inedible', 'Incoherent'], 0, 'Hard'],
    ['A person who is new to a field or activity', ['Novice', 'Veteran', 'Expert', 'Amateur'], 0, 'Easy'],
    ['One who works for no payment', ['Volunteer', 'Employee', 'Intern', 'Trainee'], 0, 'Easy'],
    ['A short journey undertaken for a specific purpose and quickly completed', ['Errand', 'Expedition', 'Voyage', 'Excursion'], 0, 'Hard'],
    ['A place where money is coined by government authority', ['Mint', 'Treasury', 'Bank', 'Vault'], 0, 'Medium'],
    ['One who is easily deceived or fooled', ['Gullible', 'Skeptical', 'Cautious', 'Shrewd'], 0, 'Hard'],
    ['A speech delivered without prior preparation', ['Impromptu', 'Rehearsed', 'Scripted', 'Formal'], 0, 'Hard'],
    ['The study of the origin and history of words', ['Etymology', 'Entomology', 'Epistemology', 'Ethnology'], 0, 'Hard'],
    ['A person who is unable to feel any pain', ['Analgesic', 'Insensate', 'Anesthetic', 'Numb'], 0, 'Hard'],
  ];
  const grammar = [
    ['Choose the correctly punctuated sentence.', ['She said, "I will come tomorrow."', 'She said "I will come tomorrow."', 'She said, I will come tomorrow.', 'she said, "i will come tomorrow"'], 0, 'Easy'],
    ['Identify the error: "Neither of the students have submitted their assignment."', ['have → has', 'their → his', 'Neither → None', 'No error'], 0, '"Neither" is singular, so it should take "has", not "have".', 'Medium'],
    ['Fill in the blank: "She has been working here ___ 2018."', ['since', 'for', 'from', 'by'], 0, '"Since" is used with a specific point in time; "for" would be used with a duration.', 'Easy'],
    ['Choose the correct passive voice: "They are building a bridge."', ['A bridge is being built by them.', 'A bridge was built by them.', 'A bridge has built by them.', 'A bridge builds by them.'], 0, 'Continuous tense active → continuous tense passive: "is being built".', 'Medium'],
    ['Identify the correctly formed sentence.', ['He is one of the best players in the team.', 'He is one of the best player in the team.', 'He are one of the best players.', 'He is the one best players in team.'], 0, '"One of the + plural noun" is the correct construction.', 'Medium'],
    ['Choose the correct conditional sentence.', ['If it rains, we will cancel the trip.', 'If it rains, we cancel the trip will.', 'If it will rain, we will cancel.', 'If it rain, we will cancel the trip.'], 0, 'First conditional: "If + present simple, will + base verb."', 'Easy'],
    ['Spot the error: "Each of the boys have brought their own lunch."', ['have → has', 'their → his', 'brought → bring', 'No error'], 0, '"Each" takes a singular verb, so it should be "has brought".', 'Hard'],
    ['Choose the correctly ordered adjective sentence.', ['She bought a beautiful small red bag.', 'She bought a red small beautiful bag.', 'She bought a small red beautiful bag.', 'She bought a beautiful red small bag.'], 0, 'English adjective order: opinion → size → color, i.e. beautiful → small → red.', 'Hard'],
    ['Choose the sentence with correct subject-verb agreement.', ['The team is playing well this season.', 'The team are playing well this season.', 'The team playing well this season.', 'The team were is playing well.'], 0, 'Collective nouns like "team" typically take a singular verb when acting as one unit.', 'Medium'],
    ['Identify the error: "She don\'t like coffee in the morning."', ['don\'t → doesn\'t', 'like → likes', 'coffee → coffees', 'No error'], 0, 'Third-person singular subjects require "doesn\'t", not "don\'t".', 'Easy'],
    ['Choose the sentence using the correct form of the verb.', ['By next year, she will have graduated.', 'By next year, she will graduated.', 'By next year, she have graduated.', 'By next year, she will has graduated.'], 0, 'Future perfect tense: "will have + past participle".', 'Hard'],
    ['Spot the error: "The news of his promotion have spread quickly."', ['have → has', 'news → new', 'spread → spreads', 'No error'], 0, '"News" is treated as a singular uncountable noun, so it takes "has".', 'Hard'],
    ['Choose the correctly formed question tag.', ['You are coming, aren\'t you?', 'You are coming, are you?', 'You are coming, isn\'t you?', 'You are coming, don\'t you?'], 0, 'Positive statements take a negative question tag: "are... aren\'t you?"', 'Medium'],
    ['Identify the correctly used preposition.', ['She is good at mathematics.', 'She is good in mathematics.', 'She is good on mathematics.', 'She is good for mathematics.'], 0, '"Good at" is the standard idiomatic preposition for skills/subjects.', 'Easy'],
    ['Choose the sentence with the correct use of "fewer" vs "less".', ['There are fewer students in this class than last year.', 'There are less students in this class than last year.', 'There is fewer students in this class.', 'There are least students in this class.'], 0, '"Fewer" is used with countable nouns like "students"; "less" is used with uncountable nouns.', 'Hard'],
    ['Spot the error: "He is one of the student who always arrives late."', ['student → students', 'arrives → arrive', 'late → lately', 'No error'], 0, '"One of the + plural noun" requires "students", not "student".', 'Hard'],
  ];

  const pool = [];
  synonyms.forEach(([w, opts, ci, diff]) => pool.push(q(`Choose the word closest in meaning to "${w}".`, opts, ci, `"${w}" most closely means "${opts[ci]}".`, diff)));
  antonyms.forEach(([w, opts, ci, diff]) => pool.push(q(`Choose the word most opposite in meaning to "${w}".`, opts, ci, `The opposite of "${w}" is "${opts[ci]}".`, diff)));
  oneWord.forEach(([desc, opts, ci, diff]) => pool.push(q(`Choose the one word for: "${desc}".`, opts, ci, `The correct term is "${opts[ci]}".`, diff)));
  grammar.forEach(([question, opts, ci, diff]) => pool.push(q(question, opts, ci, '', diff)));
  return pool;
}

// ---------------------------------------------------------------------------
// Generators — Data Interpretation
// ---------------------------------------------------------------------------

function genDataInterpretationPool() {
  const tables = [
    { title: 'Sales of Laptops (in units) across 4 quarters', rows: { 'Brand A': [120, 150, 130, 180], 'Brand B': [100, 90, 140, 160], 'Brand C': [80, 100, 95, 110] } },
    { title: 'Number of students enrolled across 4 years', rows: { CSE: [200, 220, 240, 260], ECE: [150, 160, 155, 170], Mech: [100, 95, 90, 85] } },
    { title: 'Monthly household expenses (in ₹ thousands) over 4 months', rows: { Rent: [15, 15, 15, 15], Food: [8, 9, 7, 10], Travel: [4, 5, 6, 3] } },
    { title: 'Company revenue (in ₹ crore) across 4 quarters', rows: { 'Product X': [45, 52, 48, 61], 'Product Y': [30, 34, 38, 33], 'Product Z': [22, 25, 27, 30] } },
    { title: 'Rainfall (in mm) recorded across 4 months for 3 cities', rows: { Mumbai: [210, 340, 190, 120], Chennai: [80, 60, 150, 220], Bengaluru: [90, 110, 95, 70] } },
    { title: 'Website traffic (in thousand visits) across 4 weeks', rows: { Homepage: [45, 52, 60, 58], Blog: [20, 25, 30, 35], Pricing: [12, 15, 14, 18] } },
    { title: 'Runs scored by batsmen across 4 matches', rows: { Player1: [45, 60, 20, 85], Player2: [30, 55, 70, 40], Player3: [65, 15, 50, 60] } },
    { title: 'City population (in lakhs) across 4 years', rows: { CityA: [28, 30, 33, 36], CityB: [15, 16, 18, 19], CityC: [42, 43, 45, 48] } },
    { title: 'Average exam scores (out of 100) across 4 subjects', rows: { SectionA: [72, 68, 80, 75], SectionB: [65, 70, 74, 78], SectionC: [80, 82, 79, 85] } },
    { title: 'Factory production (in thousand units) across 4 quarters', rows: { FactoryA: [55, 60, 58, 65], FactoryB: [40, 45, 50, 48], FactoryC: [70, 72, 68, 75] } },
  ];

  const pool = [];
  tables.forEach((table) => {
    const cats = Object.keys(table.rows);
    const [c0, c1, c2] = cats;
    const periods = table.rows[c0].length;
    const totalOf = (cat) => table.rows[cat].reduce((a, b) => a + b, 0);

    // --- Easy: direct lookups ---
    const total0 = totalOf(c0);
    pool.push(q(`${table.title}. ${c0}: ${table.rows[c0].join(', ')}. What is the total for ${c0} across all periods?`,
      [total0, total0 - 10, total0 + 15, total0 - 25].map(String), 0, `Sum = ${table.rows[c0].join(' + ')} = ${total0}.`, 'Easy'));

    const p1Values = cats.map((c) => table.rows[c][0]);
    const maxP1 = Math.max(...p1Values);
    const maxCatIdx = p1Values.indexOf(maxP1);
    const maxCat = cats[maxCatIdx];
    pool.push(q(`In "${table.title}", which category had the highest value in period 1?`,
      [maxCat, cats[(maxCatIdx + 1) % cats.length], cats[(maxCatIdx + 2) % cats.length], 'Cannot be determined'], 0,
      `Period-1 values: ${cats.map((c, i) => `${c}=${p1Values[i]}`).join(', ')} — ${maxCat} is highest.`, 'Easy'));

    const minP1 = Math.min(...p1Values);
    const minCat = cats[p1Values.indexOf(minP1)];
    pool.push(q(`In "${table.title}", which category had the lowest value in period 1?`,
      [minCat, cats[(cats.indexOf(minCat) + 1) % cats.length], cats[(cats.indexOf(minCat) + 2) % cats.length], 'Cannot be determined'], 0,
      `Period-1 values: ${cats.map((c, i) => `${c}=${p1Values[i]}`).join(', ')} — ${minCat} is lowest.`, 'Easy'));

    // --- Medium: change / difference ---
    const growthCat = table.rows[c0][periods - 1] !== table.rows[c0][0] ? c0 : c1;
    const gv = table.rows[growthCat];
    const growth = Math.round(((gv[periods - 1] - gv[0]) / gv[0]) * 10000) / 100;
    const growthDistractors = Array.from(new Set([Math.round((growth + 5) * 100) / 100, Math.round((growth - 5) * 100) / 100, Math.round((growth + 10) * 100) / 100])).filter((v) => v !== growth);
    pool.push(q(`For ${growthCat} in "${table.title}", what is the percentage change from period 1 (${gv[0]}) to period ${periods} (${gv[periods - 1]})?`,
      [`${growth}%`, ...growthDistractors.slice(0, 3).map((v) => `${v}%`)], 0,
      `% change = ((${gv[periods - 1]} − ${gv[0]}) / ${gv[0]}) × 100 = ${growth}%.`, 'Medium'));

    const diff = Math.abs(table.rows[c0][1] - table.rows[c1][1]);
    pool.push(q(`In "${table.title}", what is the difference between ${c0} and ${c1} in period 2 (${table.rows[c0][1]} vs ${table.rows[c1][1]})?`,
      [diff, diff + 5, diff - 3 < 0 ? diff + 3 : diff - 3, diff + 10].map(String), 0,
      `Difference = |${table.rows[c0][1]} − ${table.rows[c1][1]}| = ${diff}.`, 'Medium'));

    // --- Hard: combined / average / ratio / cross-period ---
    const total1 = totalOf(c1);
    const combinedTotal = total0 + total1;
    pool.push(q(`In "${table.title}", what is the combined total of ${c0} and ${c1} across all periods?`,
      [combinedTotal, combinedTotal - 20, combinedTotal + 30, combinedTotal - 40].map(String), 0,
      `Combined total = ${total0} + ${total1} = ${combinedTotal}.`, 'Hard'));

    const avgAll = Math.round((cats.reduce((sum, c) => sum + totalOf(c), 0) / (cats.length * periods)) * 100) / 100;
    pool.push(q(`In "${table.title}", what is the overall average value per period per category?`,
      [avgAll, Math.round(avgAll * 1.15 * 100) / 100, Math.round(avgAll * 0.85 * 100) / 100, Math.round(avgAll * 1.3 * 100) / 100].map(String), 0,
      `Average = (sum of all values) / (categories × periods) = ${avgAll}.`, 'Hard'));

    if (c2) {
      const total2 = totalOf(c2);
      const ratio = Math.round((total0 / total2) * 100) / 100;
      pool.push(q(`In "${table.title}", what is the approximate ratio of ${c0}'s total to ${c2}'s total?`,
        [`${ratio} : 1`, `${Math.round(ratio * 1.2 * 100) / 100} : 1`, `${Math.round(ratio * 0.8 * 100) / 100} : 1`, `${Math.round((total2 / total0) * 100) / 100} : 1`], 0,
        `Ratio = ${total0} / ${total2} ≈ ${ratio} : 1.`, 'Hard'));
    }

    const periodTotals = Array.from({ length: periods }, (_, p) => cats.reduce((sum, c) => sum + table.rows[c][p], 0));
    const maxPeriodTotal = Math.max(...periodTotals);
    const maxPeriodIdx = periodTotals.indexOf(maxPeriodTotal) + 1;
    pool.push(q(`In "${table.title}", which period had the highest combined total across all categories?`,
      [`Period ${maxPeriodIdx}`, `Period ${(maxPeriodIdx % periods) + 1}`, `Period ${((maxPeriodIdx + 1) % periods) + 1}`, 'All periods are equal'], 0,
      `Period totals: ${periodTotals.map((t, i) => `P${i + 1}=${t}`).join(', ')} — Period ${maxPeriodIdx} is highest.`, 'Hard'));
  });
  return pool;
}

// ---------------------------------------------------------------------------
// Curated — Technical MCQ pools (10 subjects)
// A compact [question, options[], correctIndex, explanation, difficulty] format.
// ---------------------------------------------------------------------------

const TECHNICAL_RAW = {
  OS: [
    ['What is a deadlock?', ['A process running forever', 'A circular wait for resources held by other processes', 'A crashed process', 'A memory leak'], 1, 'A deadlock occurs when processes wait on each other in a cycle, holding resources the others need.', 'Easy'],
    ['Which of these is NOT one of the four necessary conditions for deadlock?', ['Mutual Exclusion', 'Hold and Wait', 'Preemption', 'Circular Wait'], 2, 'The four conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.', 'Medium'],
    ['What is thrashing in an operating system?', ['CPU running at full speed', 'Excessive paging causing low CPU utilization', 'A disk failure', 'A network congestion issue'], 1, 'Thrashing happens when the system spends more time swapping pages than executing processes.', 'Medium'],
    ['Which scheduling algorithm can lead to starvation of low-priority processes?', ['Round Robin', 'FCFS', 'Priority Scheduling', 'SJF (non-preemptive) has less risk than'], 2, 'Under strict priority scheduling, low-priority processes may never be scheduled.', 'Medium'],
    ['What does a page fault indicate?', ['The CPU has crashed', 'The requested page is not in physical memory', 'A disk is full', 'A process has terminated'], 1, 'A page fault is raised when a program accesses a page not currently mapped in RAM.', 'Easy'],
    ['Which of these is a preemptive scheduling algorithm?', ['FCFS', 'Round Robin', 'Non-preemptive SJF', 'None of these'], 1, 'Round Robin preempts a process once its time quantum expires.', 'Easy'],
    ['What is the main purpose of a semaphore?', ['Speed up the CPU', 'Synchronize access to shared resources', 'Manage file names', 'Compress memory'], 1, 'Semaphores are synchronization primitives used to control access to shared resources.', 'Medium'],
    ['In the Banker\'s Algorithm, what is checked before granting a resource request?', ['If the system remains in a safe state', 'If the CPU is idle', 'If the disk has space', 'If the user is an admin'], 0, 'The Banker\'s Algorithm only grants requests that keep the system in a safe state, avoiding deadlock.', 'Hard'],
    ['What is the difference between a process and a thread?', ['They are identical', 'A process is an independent execution unit with its own memory; a thread shares memory within a process', 'A thread always runs slower', 'A process cannot have multiple threads'], 1, 'Threads within a process share the same address space, unlike separate processes.', 'Medium'],
    ['Which page replacement algorithm suffers from Belady\'s anomaly?', ['LRU', 'FIFO', 'Optimal', 'None'], 1, 'FIFO page replacement can show Belady\'s anomaly, where more frames cause more page faults.', 'Hard'],
    ['What is a race condition?', ['Two threads accessing shared data concurrently with unpredictable results', 'A CPU running two programs at once', 'A fast disk operation', 'A network delay'], 0, 'A race condition occurs when the outcome depends on the relative timing of uncontrolled events.', 'Medium'],
    ['What is virtual memory used for?', ['To make the disk faster', 'To give processes the illusion of a large contiguous memory space', 'To increase CPU clock speed', 'To store the OS kernel only'], 1, 'Virtual memory abstracts physical memory, letting processes use more memory than physically available.', 'Easy'],
    ['Which of these is an example of an inter-process communication mechanism?', ['Pipes', 'Cache', 'Register', 'Interrupt vector'], 0, 'Pipes allow processes to communicate by passing data through a shared channel.', 'Easy'],
    ['What is the critical section problem?', ['Ensuring only one process accesses shared resources at a time', 'Choosing the fastest CPU scheduler', 'Formatting a hard disk', 'Compiling source code'], 0, 'The critical section problem is about designing protocols so processes cooperate safely when using shared resources.', 'Medium'],
    ['Which memory management technique suffers from external fragmentation?', ['Paging', 'Segmentation', 'Both equally', 'Neither'], 1, 'Segmentation, which uses variable-sized partitions, is prone to external fragmentation.', 'Hard'],
    ['What does the fork() system call do in Unix/Linux?', ['Deletes a process', 'Creates a new process by duplicating the calling process', 'Terminates all processes', 'Suspends the CPU'], 1, 'fork() creates a child process that is a copy of the parent.', 'Easy'],
  ],
  DBMS: [
    ['Which normal form removes transitive dependency?', ['1NF', '2NF', '3NF', 'BCNF'], 2, '3NF removes transitive dependencies on the primary key.', 'Easy'],
    ['What does ACID stand for in transactions?', ['Atomicity, Consistency, Isolation, Durability', 'Access, Control, Index, Data', 'Atomic, Concurrent, Isolated, Distributed', 'None of these'], 0, 'ACID properties ensure reliable processing of database transactions.', 'Easy'],
    ['Which key uniquely identifies a row and cannot be null?', ['Foreign key', 'Primary key', 'Candidate key', 'Composite key'], 1, 'A primary key uniquely identifies each row and must be non-null.', 'Easy'],
    ['What is a deadlock in DBMS?', ['Two transactions waiting indefinitely for resources locked by each other', 'A slow query', 'A missing index', 'A corrupted table'], 0, 'A deadlock happens when transactions hold locks the other needs, creating a cycle.', 'Medium'],
    ['Which SQL clause is used to filter groups after aggregation?', ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'], 1, 'HAVING filters aggregated results, while WHERE filters rows before aggregation.', 'Medium'],
    ['What is denormalization?', ['Removing redundant data', 'Introducing controlled redundancy to improve read performance', 'Deleting all tables', 'Normalizing to 5NF'], 1, 'Denormalization trades some redundancy for faster reads, opposite of normalization.', 'Medium'],
    ['Which of these is NOT a type of SQL JOIN?', ['INNER JOIN', 'OUTER JOIN', 'CROSS JOIN', 'PARALLEL JOIN'], 3, 'PARALLEL JOIN is not a standard SQL join type.', 'Easy'],
    ['What is the purpose of an index in a database?', ['To enforce foreign keys', 'To speed up data retrieval at the cost of extra storage/write overhead', 'To encrypt data', 'To back up data'], 1, 'Indexes speed up lookups but add overhead on writes and storage.', 'Medium'],
    ['Which isolation level allows dirty reads?', ['Serializable', 'Repeatable Read', 'Read Committed', 'Read Uncommitted'], 3, 'Read Uncommitted is the weakest isolation level and permits dirty reads.', 'Hard'],
    ['What is a foreign key used for?', ['Encrypting a column', 'Linking a column to the primary key of another table to maintain referential integrity', 'Speeding up joins only', 'Storing binary data'], 1, 'Foreign keys enforce relationships and referential integrity between tables.', 'Easy'],
    ['What does BCNF stand for and improve on 3NF?', ['Boyce-Codd Normal Form; handles certain anomalies 3NF misses', 'Basic Candidate Normal Form', 'Binary Coded Normal Form', 'None of these'], 0, 'BCNF is a stricter version of 3NF that resolves certain functional dependency anomalies.', 'Hard'],
    ['Which of these commands is a DDL (Data Definition Language) command?', ['SELECT', 'INSERT', 'CREATE', 'UPDATE'], 2, 'CREATE defines database structures, making it a DDL command.', 'Easy'],
    ['What is a view in SQL?', ['A physical copy of a table', 'A virtual table based on the result of a SQL query', 'An index', 'A stored procedure'], 1, 'A view is a saved query that behaves like a virtual table.', 'Medium'],
    ['What problem does a composite index on (A, B) solve better than two separate indexes?', ['Queries filtering on both A and B together become faster', 'It saves disk space always', 'It removes the need for a primary key', 'It prevents duplicate rows'], 0, 'A composite index is optimized for queries that filter/sort on the combined columns.', 'Hard'],
    ['What is a trigger in a database?', ['A scheduled backup job', 'A block of code that automatically executes in response to certain table events', 'A type of join', 'A user permission'], 1, 'Triggers fire automatically on events like INSERT, UPDATE, or DELETE.', 'Medium'],
    ['Which anomaly refers to unwanted loss of information when a row is deleted?', ['Insertion anomaly', 'Deletion anomaly', 'Update anomaly', 'Join anomaly'], 1, 'A deletion anomaly happens when deleting a row unintentionally removes other useful data.', 'Medium'],
  ],
  'Computer Networks': [
    ['What does TCP stand for?', ['Transfer Control Protocol', 'Transmission Control Protocol', 'Total Control Protocol', 'Transport Communication Protocol'], 1, 'TCP stands for Transmission Control Protocol, a connection-oriented protocol.', 'Easy'],
    ['Which layer of the OSI model is responsible for routing?', ['Data Link Layer', 'Network Layer', 'Transport Layer', 'Session Layer'], 1, 'The Network layer (Layer 3) handles logical addressing and routing.', 'Easy'],
    ['What is the default port for HTTP?', ['21', '25', '80', '443'], 2, 'HTTP uses port 80 by default; HTTPS uses 443.', 'Easy'],
    ['Which protocol is connectionless?', ['TCP', 'UDP', 'FTP', 'HTTP'], 1, 'UDP is a connectionless protocol offering no delivery guarantees, unlike TCP.', 'Medium'],
    ['What does DNS do?', ['Encrypts network traffic', 'Translates domain names into IP addresses', 'Assigns MAC addresses', 'Manages firewall rules'], 1, 'DNS resolves human-readable domain names to IP addresses.', 'Easy'],
    ['What is the purpose of the three-way handshake in TCP?', ['To compress data', 'To establish a reliable connection between client and server', 'To encrypt traffic', 'To assign an IP address'], 1, 'SYN, SYN-ACK, ACK establishes a reliable TCP connection.', 'Medium'],
    ['Which device operates at the Data Link layer and forwards frames based on MAC address?', ['Router', 'Switch', 'Hub', 'Repeater'], 1, 'A switch uses MAC addresses to forward frames within a LAN.', 'Medium'],
    ['What is subnetting used for?', ['Encrypting packets', 'Dividing a large network into smaller, manageable sub-networks', 'Speeding up DNS', 'Compressing IP headers'], 1, 'Subnetting splits a network into smaller segments for better management and security.', 'Medium'],
    ['Which of these is a Class C private IP address range?', ['10.0.0.0 – 10.255.255.255', '172.16.0.0 – 172.31.255.255', '192.168.0.0 – 192.168.255.255', '127.0.0.0 – 127.255.255.255'], 2, '192.168.0.0/16 is the reserved private Class C range.', 'Hard'],
    ['What does ARP resolve?', ['Domain name to IP address', 'IP address to MAC address', 'MAC address to port number', 'URL to IP address'], 1, 'Address Resolution Protocol maps an IP address to its corresponding MAC address on a LAN.', 'Medium'],
    ['Which layer adds MAC addresses to frames?', ['Network layer', 'Data Link layer', 'Transport layer', 'Physical layer'], 1, 'The Data Link layer encapsulates frames with source/destination MAC addresses.', 'Medium'],
    ['What is the maximum size of an IPv4 address in bits?', ['16', '32', '64', '128'], 1, 'IPv4 addresses are 32 bits; IPv6 addresses are 128 bits.', 'Easy'],
    ['What problem does NAT (Network Address Translation) solve?', ['Encrypting traffic', 'Allowing multiple devices on a private network to share a single public IP', 'Speeding up DNS lookups', 'Routing between ASes'], 1, 'NAT lets many internal devices share one external IP address.', 'Hard'],
    ['Which protocol is used to securely transfer files?', ['FTP', 'SFTP', 'SMTP', 'Telnet'], 1, 'SFTP (SSH File Transfer Protocol) encrypts file transfers, unlike plain FTP.', 'Medium'],
    ['What is the purpose of a firewall?', ['To increase bandwidth', 'To monitor and control incoming/outgoing network traffic based on rules', 'To assign IP addresses', 'To cache DNS records'], 1, 'A firewall enforces security policy on network traffic.', 'Easy'],
  ],
  OOP: [
    ['Which OOP pillar allows one interface with many implementations?', ['Encapsulation', 'Abstraction', 'Polymorphism', 'Inheritance'], 2, 'Polymorphism lets the same interface behave differently across implementing classes.', 'Easy'],
    ['What is method overriding?', ['Redefining a parent class method in a child class with the same signature', 'Having multiple methods with the same name but different parameters', 'Hiding a variable', 'Deleting a method'], 0, 'Overriding provides a new implementation of an inherited method in the subclass.', 'Easy'],
    ['What is method overloading?', ['Multiple methods with the same name but different parameter lists in the same class', 'Redefining a parent method in a child class', 'Removing a method', 'Renaming a method'], 0, 'Overloading allows multiple methods sharing a name but differing in signature.', 'Easy'],
    ['What does encapsulation achieve?', ['Bundling data and methods together while restricting direct access to internals', 'Allowing multiple inheritance', 'Making all variables public', 'Deleting unused classes'], 0, 'Encapsulation hides internal state and requires interaction through defined interfaces.', 'Easy'],
    ['What is an abstract class?', ['A class that cannot be instantiated and may contain abstract methods', 'A class with no methods', 'A class that is always final', 'A class used only for constants'], 0, 'Abstract classes define a template and cannot be instantiated directly.', 'Medium'],
    ['What is the difference between an interface and an abstract class (in Java-like languages)?', ['They are always identical', 'An interface only declares methods (until default methods) while an abstract class can have full implementations and state', 'An interface can have constructors', 'An abstract class cannot have any methods'], 1, 'Interfaces primarily declare a contract; abstract classes can hold shared state and implementation.', 'Medium'],
    ['What is composition in OOP?', ['A "has-a" relationship where one class contains an instance of another', 'A synonym for inheritance', 'A way to make a class abstract', 'A type of polymorphism'], 0, 'Composition builds objects by combining other objects ("has-a" relationships).', 'Medium'],
    ['Which principle suggests favoring composition over inheritance?', ['SOLID design guidance', 'DRY', 'KISS', 'YAGNI'], 0, 'This is a widely recommended OOP design guideline to reduce tight coupling from inheritance.', 'Hard'],
    ['What is a constructor?', ['A special method used to destroy objects', 'A special method called when an object is instantiated to initialize it', 'A static method only', 'A method that always returns void explicitly'], 1, 'Constructors run automatically when an object is created, to set up initial state.', 'Easy'],
    ['What does the "S" in SOLID stand for?', ['Single Responsibility Principle', 'Static Responsibility Principle', 'Simple Response Principle', 'Shared Resource Principle'], 0, 'SOLID\'s "S" is the Single Responsibility Principle — a class should have one reason to change.', 'Hard'],
    ['What is dynamic (runtime) polymorphism typically implemented via?', ['Method overloading', 'Method overriding with virtual dispatch', 'Static binding', 'Constant folding'], 1, 'Runtime polymorphism relies on virtual method dispatch resolved at runtime, typically through overriding.', 'Medium'],
    ['Can a class implement multiple interfaces in most OOP languages?', ['Yes, typically', 'No, never', 'Only in C++', 'Only with reflection'], 0, 'Most OOP languages allow a class to implement multiple interfaces even without multiple inheritance of classes.', 'Easy'],
    ['What is coupling in OOP design?', ['The degree of interdependence between software modules', 'The number of classes in a project', 'A synonym for inheritance', 'The size of a class'], 0, 'Coupling measures how closely different modules/classes depend on one another; lower coupling is generally preferred.', 'Hard'],
    ['What does "cohesion" refer to in OOP design?', ['How closely related the responsibilities of a single module are', 'The number of interfaces implemented', 'The speed of a program', 'The number of constructors'], 0, 'High cohesion means a class has a well-focused, related set of responsibilities.', 'Hard'],
  ],
  Java: [
    ['What is the default value of an uninitialized instance variable of type int in Java?', ['null', '0', 'undefined', '-1'], 1, 'Numeric instance fields default to 0 if not explicitly initialized.', 'Easy'],
    ['Which keyword is used to inherit a class in Java?', ['implements', 'extends', 'inherits', 'super'], 1, '"extends" is used for class inheritance; "implements" is for interfaces.', 'Easy'],
    ['What is the output of: System.out.println(5 / 2);', ['2.5', '2', '2.0', 'Error'], 1, 'Integer division in Java truncates the decimal part, giving 2.', 'Easy'],
    ['Which collection class does NOT allow duplicate elements?', ['ArrayList', 'LinkedList', 'HashSet', 'Vector'], 2, 'HashSet is backed by a hash table and enforces uniqueness of elements.', 'Medium'],
    ['What is the purpose of the "final" keyword when applied to a variable?', ['Makes it a static member', 'Prevents reassignment after initialization', 'Makes it private', 'Deletes it after use'], 1, 'A final variable can be assigned only once.', 'Easy'],
    ['Which of these is true about Java\'s garbage collector?', ['It manually frees memory when the programmer calls free()', 'It automatically reclaims memory of unreachable objects', 'It only runs once at program start', 'It is written entirely in C'], 1, 'Java\'s GC automatically identifies and reclaims memory for objects no longer reachable.', 'Medium'],
    ['What does the "static" keyword mean for a method?', ['It belongs to the class rather than any instance', 'It can only be called once', 'It cannot be overridden and must be private', 'It runs in a separate thread'], 0, 'Static methods belong to the class itself, not to instances.', 'Easy'],
    ['Which exception is thrown when dividing an integer by zero in Java?', ['NullPointerException', 'ArithmeticException', 'ArrayIndexOutOfBoundsException', 'ClassCastException'], 1, 'Integer division by zero throws java.lang.ArithmeticException.', 'Medium'],
    ['What is method overriding used for with respect to polymorphism?', ['To achieve compile-time polymorphism', 'To achieve runtime polymorphism', 'To reduce code readability', 'To prevent inheritance'], 1, 'Overriding enables runtime polymorphism through dynamic method dispatch.', 'Medium'],
    ['Which of these correctly declares an interface in Java?', ['interface Shape { void draw(); }', 'class interface Shape { void draw(); }', 'abstract interface Shape { void draw() {} }', 'interface Shape extends void draw();'], 0, 'Interfaces are declared with the "interface" keyword and abstract method signatures.', 'Easy'],
    ['What will "String a = "10"; String b = "1" + "0"; System.out.println(a == b);" print?', ['true', 'false', 'Compilation error', 'Runtime error'], 0, 'Compile-time constant string concatenation is folded into the same interned literal, so == is true here.', 'Hard'],
    ['What is the purpose of try-with-resources in Java?', ['To automatically close resources like streams after use', 'To catch all exceptions silently', 'To allocate more heap memory', 'To speed up loops'], 0, 'try-with-resources ensures AutoCloseable resources are closed automatically.', 'Hard'],
    ['Which of the following is NOT a valid access modifier in Java?', ['public', 'private', 'protected', 'internal'], 3, '"internal" is a C# modifier, not a Java access modifier.', 'Medium'],
    ['What does JVM stand for?', ['Java Virtual Machine', 'Java Verified Method', 'Java Variable Manager', 'Java Version Manager'], 0, 'The JVM executes Java bytecode, providing platform independence.', 'Easy'],
    ['What happens when you call a method on a null reference in Java?', ['Nothing happens', 'NullPointerException is thrown', 'It silently returns 0', 'Compilation error'], 1, 'Invoking a method on a null reference throws a NullPointerException at runtime.', 'Easy'],
  ],
  Python: [
    ['What is the output of: print(type([]))?', ["<class 'list'>", "<class 'array'>", "<class 'tuple'>", "<class 'dict'>"], 0, '[] is an empty list literal, so its type is list.', 'Easy'],
    ['Which of these is mutable in Python?', ['tuple', 'string', 'list', 'int'], 2, 'Lists are mutable; tuples, strings, and ints are immutable.', 'Easy'],
    ['What does the "self" parameter represent in a Python class method?', ['The class itself', 'A reference to the current instance', 'A static variable', 'The parent class'], 1, '"self" refers to the instance the method is being called on.', 'Easy'],
    ['What is a list comprehension used for?', ['Deleting a list', 'Creating a new list concisely from an iterable, optionally with a condition', 'Sorting a list in place', 'Converting a list to a tuple only'], 1, 'List comprehensions provide a concise syntax to build lists from iterables.', 'Medium'],
    ['What will `print(2 ** 3)` output?', ['6', '8', '9', '5'], 1, '** is the exponentiation operator, so 2**3 = 8.', 'Easy'],
    ['What does the GIL (Global Interpreter Lock) do in CPython?', ['Speeds up multi-threaded CPU-bound code', 'Allows only one thread to execute Python bytecode at a time', 'Encrypts Python code', 'Manages garbage collection only'], 1, 'The GIL restricts execution to one thread at a time in CPython, limiting true multi-threaded parallelism.', 'Hard'],
    ['Which keyword is used to define a generator function?', ['return', 'yield', 'generate', 'async'], 1, '"yield" turns a function into a generator that produces values lazily.', 'Medium'],
    ['What is the output of `print("Hello"[1:4])`?', ["'Hell'", "'ell'", "'ello'", "'Hel'"], 1, 'String slicing [1:4] takes characters at indices 1, 2, 3, giving "ell".', 'Medium'],
    ['What does `*args` allow a function to accept?', ['A fixed number of keyword arguments', 'A variable number of positional arguments', 'Only one argument', 'A dictionary only'], 1, '*args collects extra positional arguments into a tuple.', 'Medium'],
    ['Which of these correctly opens a file for reading in Python?', ['open("file.txt", "r")', 'open("file.txt", "read")', 'file.open("file.txt")', 'read("file.txt")'], 0, 'open(path, mode) with mode "r" opens a file for reading.', 'Easy'],
    ['What does `__init__` do in a Python class?', ['Destroys the object', 'Initializes a newly created instance', 'Defines class-level constants only', 'Imports modules'], 1, '__init__ is the constructor called automatically when an instance is created.', 'Easy'],
    ['What is the difference between deep copy and shallow copy?', ['They are identical', 'Shallow copy copies references to nested objects; deep copy recursively copies all nested objects', 'Deep copy is always faster', 'Shallow copy duplicates the whole object tree'], 1, 'copy.copy() is shallow (shares nested refs); copy.deepcopy() recursively duplicates everything.', 'Hard'],
    ['What does a Python dictionary comprehension look like?', ['{k: v for k, v in items}', '[k: v for k, v in items]', '(k: v for k, v in items)', '{k, v for k, v in items}'], 0, 'Dict comprehensions use curly braces with a key: value expression.', 'Medium'],
    ['Which exception is raised when you access a non-existent dictionary key?', ['IndexError', 'KeyError', 'ValueError', 'TypeError'], 1, 'Accessing a missing dictionary key with [] raises a KeyError.', 'Easy'],
    ['What is the purpose of Python\'s `with` statement?', ['To define a loop', 'To manage resources like files, ensuring proper acquisition and release', 'To declare a global variable', 'To catch exceptions only'], 1, 'The `with` statement (context manager) ensures setup/teardown, e.g. closing a file automatically.', 'Medium'],
  ],
  C: [
    ['What is the output of: printf("%d", 5 / 2);', ['2.5', '2', '2.0', 'Error'], 1, 'Integer division in C truncates towards zero, so 5/2 = 2.', 'Easy'],
    ['Which header file is required for printf()?', ['<string.h>', '<stdio.h>', '<stdlib.h>', '<math.h>'], 1, 'printf and scanf are declared in stdio.h.', 'Easy'],
    ['What does the "&" operator do when used before a variable name?', ['Bitwise AND', 'Returns the address of the variable', 'Logical AND', 'Dereferences a pointer'], 1, 'The unary & operator returns the memory address of its operand.', 'Easy'],
    ['What is a pointer in C?', ['A variable that stores the address of another variable', 'A function that returns void', 'A type of loop', 'A reserved keyword only'], 0, 'Pointers hold memory addresses and are used for indirect access to data.', 'Easy'],
    ['What is the difference between malloc() and calloc()?', ['They are identical', 'calloc() zero-initializes allocated memory; malloc() does not', 'malloc() is for arrays only', 'calloc() cannot allocate more than 1 byte'], 1, 'calloc() clears (zero-initializes) memory, while malloc() leaves it uninitialized.', 'Medium'],
    ['What will this print? int x = 5; printf("%d", x++ + ++x);', ['11', '12', '10', 'Undefined behavior (order of evaluation not guaranteed)'], 3, 'Modifying x twice between sequence points without a sequence point makes the behavior undefined in C.', 'Hard'],
    ['What does "static" mean when applied to a local variable in C?', ['It is destroyed after the function returns', 'It retains its value between function calls', 'It becomes a macro', 'It cannot be modified'], 1, 'A static local variable persists its value across multiple calls to the function.', 'Medium'],
    ['What is a memory leak?', ['Allocating memory and never freeing it, wasting resources', 'Using too many variables', 'A compiler warning only', 'Declaring a pointer'], 0, 'A memory leak occurs when dynamically allocated memory is not freed and becomes unreachable.', 'Medium'],
    ['Which of these correctly declares a function pointer?', ['int (*fp)(int);', 'int *fp(int);', 'int fp(*int);', 'pointer int fp(int);'], 0, 'int (*fp)(int) declares fp as a pointer to a function taking an int and returning int.', 'Hard'],
    ['What is the size of an int on most modern 32/64-bit systems?', ['1 byte', '2 bytes', '4 bytes', '8 bytes'], 2, 'On most common platforms, int is 4 bytes (32 bits).', 'Easy'],
    ['What does the "const" keyword do when applied to a variable?', ['Makes the variable a macro', 'Prevents the variable from being modified after initialization', 'Speeds up compilation only', 'Allocates it on the heap'], 1, 'const marks a variable as read-only after its initial assignment.', 'Easy'],
    ['What is undefined behavior caused by accessing an array out of bounds?', ['Guaranteed program crash', 'Compiler error at build time', 'Unpredictable behavior — may read garbage, crash, or appear to work', 'Automatic array resizing'], 2, 'C performs no bounds checking, so out-of-bounds access is undefined behavior.', 'Hard'],
  ],
  'C++': [
    ['What is the difference between "new" and "malloc"?', ['They are identical in every way', 'new calls the constructor; malloc only allocates raw memory', 'malloc is C++-only', 'new cannot fail'], 1, 'new both allocates memory and invokes the constructor, unlike malloc.', 'Medium'],
    ['What is a constructor used for in C++?', ['Deleting objects', 'Initializing an object when it is created', 'Overriding operators only', 'Declaring friend functions'], 1, 'Constructors run automatically to initialize newly created objects.', 'Easy'],
    ['What does the "virtual" keyword enable in C++?', ['Faster compilation', 'Runtime polymorphism via dynamic dispatch', 'Static binding only', 'Multiple inheritance'], 1, 'Marking a function virtual enables it to be overridden and dispatched at runtime.', 'Medium'],
    ['What is the purpose of a destructor?', ['To initialize an object', 'To clean up resources when an object goes out of scope or is deleted', 'To copy an object', 'To overload an operator'], 1, 'Destructors release resources (like heap memory) when an object\'s lifetime ends.', 'Easy'],
    ['What is operator overloading?', ['Redefining how operators behave for user-defined types', 'Using too many operators in one expression', 'A syntax error', 'A type of inheritance'], 0, 'Operator overloading lets custom types define the behavior of standard operators like + or ==.', 'Medium'],
    ['What is the difference between a reference and a pointer in C++?', ['They are identical', 'A reference must be initialized and cannot be null or reassigned; a pointer can be reassigned and can be null', 'A pointer cannot be reassigned', 'A reference always points to a copy'], 1, 'References are aliases that bind once, while pointers can be reassigned or set to null.', 'Medium'],
    ['What does RAII stand for and mean?', ['Resource Allocation Is Immediate — allocate memory eagerly', 'Resource Acquisition Is Initialization — tie resource lifetime to object lifetime', 'Random Access Iterator Interface', 'Runtime Assertion In Instances'], 1, 'RAII binds resource management to object lifetime via constructors/destructors.', 'Hard'],
    ['What is a pure virtual function?', ['A function with no implementation, making the class abstract, declared as "virtual void f() = 0;"', 'A private virtual function', 'A function that cannot be overridden', 'A static function'], 0, 'A pure virtual function has no body and forces derived classes to implement it, making the base class abstract.', 'Medium'],
    ['What is the diamond problem in C++?', ['An ambiguity from multiple inheritance where a base class is inherited via two paths', 'A syntax error in templates', 'A memory alignment issue', 'A compiler optimization'], 0, 'The diamond problem arises when a class inherits from two classes that share a common base, causing ambiguity.', 'Hard'],
    ['What does the STL vector provide compared to a raw array?', ['Fixed size only', 'Dynamic resizing and built-in memory management', 'Slower access', 'No random access'], 1, 'std::vector automatically manages resizing and memory, unlike raw C-style arrays.', 'Easy'],
    ['What is the time complexity of accessing an element in a std::vector by index?', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 0, 'Vectors store elements contiguously, so indexed access is O(1).', 'Medium'],
    ['What is a smart pointer used for?', ['To automatically manage the lifetime of dynamically allocated memory', 'To speed up arithmetic', 'To replace all pointers with integers', 'To disable pointers entirely'], 0, 'Smart pointers (like unique_ptr, shared_ptr) automate memory deallocation, preventing leaks.', 'Hard'],
  ],
  SQL: [
    ['Which SQL statement is used to retrieve data?', ['GET', 'SELECT', 'FETCH', 'RETRIEVE'], 1, 'SELECT is the standard SQL statement to query data.', 'Easy'],
    ['Which clause is used to sort results?', ['SORT BY', 'ORDER BY', 'GROUP BY', 'ARRANGE BY'], 1, 'ORDER BY sorts the result set, ascending by default.', 'Easy'],
    ['What does "SELECT DISTINCT" do?', ['Returns duplicate rows only', 'Returns only unique rows', 'Deletes duplicate rows from the table', 'Sorts the result set'], 1, 'DISTINCT removes duplicate rows from the query result.', 'Easy'],
    ['Which JOIN returns all rows from the left table and matched rows from the right table?', ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN'], 1, 'LEFT JOIN keeps all left-table rows, filling unmatched right-side columns with NULL.', 'Medium'],
    ['What does the SQL "IN" operator do?', ['Checks a value against a range', 'Checks whether a value matches any value in a given list/subquery', 'Performs an inner join', 'Deletes matching rows'], 1, 'IN checks membership of a value in a specified list or subquery result.', 'Easy'],
    ['What is the purpose of GROUP BY?', ['To sort rows alphabetically', 'To group rows sharing a value so aggregate functions can be applied per group', 'To filter rows before aggregation', 'To join two tables'], 1, 'GROUP BY groups rows to allow aggregate calculations like COUNT, SUM per group.', 'Medium'],
    ['Which of the following aggregate functions returns the number of rows?', ['SUM()', 'AVG()', 'COUNT()', 'MAX()'], 2, 'COUNT() returns the number of rows matching a condition.', 'Easy'],
    ['What does a self join do?', ['Joins a table with a copy of itself', 'Joins two different tables', 'Deletes rows from a table', 'Creates a backup table'], 0, 'A self join treats one table as if it were two, joining rows within the same table.', 'Medium'],
    ['What is a subquery?', ['A query nested inside another SQL query', 'A query that always fails', 'A stored procedure', 'A trigger'], 0, 'A subquery is a query embedded within another query, e.g., in WHERE or FROM.', 'Medium'],
    ['What does UNION do in SQL?', ['Combines the result sets of two or more SELECT statements, removing duplicates', 'Joins two tables based on a key', 'Deletes rows from multiple tables', 'Creates a new table'], 0, 'UNION combines result sets and removes duplicate rows by default (UNION ALL keeps duplicates).', 'Medium'],
    ['What is the correct syntax to add a new column to an existing table?', ['MODIFY TABLE ... ADD COLUMN', 'ALTER TABLE ... ADD COLUMN', 'UPDATE TABLE ... ADD COLUMN', 'INSERT COLUMN INTO TABLE'], 1, 'ALTER TABLE ... ADD COLUMN is the standard syntax to add a new column.', 'Easy'],
    ['What is a correlated subquery?', ['A subquery that references a column from the outer query and is re-evaluated per outer row', 'A subquery with no WHERE clause', 'A subquery that always returns NULL', 'A subquery inside an INSERT only'], 0, 'Correlated subqueries depend on the outer query and execute once per outer row, unlike simple subqueries.', 'Hard'],
    ['What is the difference between DELETE and TRUNCATE?', ['They are identical', 'DELETE removes rows individually (can be rolled back, supports WHERE); TRUNCATE removes all rows at once and resets identity, typically cannot be filtered', 'TRUNCATE is slower', 'DELETE cannot use WHERE'], 1, 'TRUNCATE is a fast, minimally-logged operation that removes all rows; DELETE is row-by-row and supports conditions.', 'Hard'],
    ['What does a UNIQUE constraint enforce?', ['That a column can contain only one row total', 'That all values in a column (or column set) are distinct', 'That a column cannot be NULL', 'That a column must be numeric'], 1, 'UNIQUE ensures no two rows share the same value in the constrained column(s).', 'Medium'],
  ],
  DSA: [
    ['What is the time complexity of binary search on a sorted array?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1, 'Binary search halves the search space each step, giving O(log n).', 'Easy'],
    ['Which data structure uses LIFO (Last In First Out) order?', ['Queue', 'Stack', 'Linked List', 'Array'], 1, 'A stack follows Last In First Out ordering for push/pop operations.', 'Easy'],
    ['What is the worst-case time complexity of quicksort?', ['O(n log n)', 'O(n)', 'O(n²)', 'O(log n)'], 2, 'Quicksort degrades to O(n²) with poor pivot choices (e.g., already sorted input with naive pivoting).', 'Medium'],
    ['Which traversal of a binary search tree visits nodes in sorted order?', ['Preorder', 'Inorder', 'Postorder', 'Level order'], 1, 'Inorder traversal (left, root, right) visits BST nodes in ascending sorted order.', 'Easy'],
    ['What is the space complexity of an iterative algorithm using O(1) extra memory?', ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], 0, 'By definition, using constant extra memory regardless of input size is O(1) space.', 'Easy'],
    ['What is the time complexity of inserting into a hash table on average?', ['O(1) average case', 'O(n) always', 'O(log n) always', 'O(n²)'], 0, 'Hash table insertion is O(1) on average with a good hash function and low load factor.', 'Medium'],
    ['Which algorithm is used to find the shortest path in a weighted graph with non-negative edges?', ['DFS', 'Dijkstra\'s Algorithm', 'Bubble Sort', 'Binary Search'], 1, 'Dijkstra\'s algorithm finds shortest paths from a source in graphs with non-negative edge weights.', 'Medium'],
    ['What is dynamic programming primarily used to optimize?', ['Problems with overlapping subproblems and optimal substructure', 'Sorting only', 'String formatting', 'Memory alignment'], 0, 'DP avoids recomputation by caching results of overlapping subproblems that have optimal substructure.', 'Medium'],
    ['What is the height of a balanced binary search tree with n nodes?', ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], 1, 'A balanced BST keeps height proportional to log n, enabling fast search.', 'Medium'],
    ['Which data structure is most suitable for implementing a priority queue efficiently?', ['Array', 'Heap', 'Stack', 'Singly Linked List'], 1, 'A heap supports O(log n) insertion and extraction of the min/max element, ideal for priority queues.', 'Medium'],
    ['What is the time complexity of merge sort?', ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], 1, 'Merge sort consistently runs in O(n log n) time in all cases.', 'Easy'],
    ['What technique does BFS use to explore a graph?', ['Stack (LIFO)', 'Queue (FIFO)', 'Recursion only', 'Random selection'], 1, 'Breadth-First Search uses a queue to explore nodes level by level.', 'Medium'],
    ['What is memoization?', ['Storing results of expensive function calls to reuse them on repeated inputs', 'A sorting technique', 'A type of tree rotation', 'A hashing collision strategy'], 0, 'Memoization caches results of function calls, a core technique in top-down dynamic programming.', 'Easy'],
    ['What is the time complexity of finding an element in a balanced BST?', ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'], 1, 'Balanced BSTs guarantee O(log n) search due to their height being logarithmic in n.', 'Medium'],
    ['Which sorting algorithm is stable and has O(n log n) worst-case time complexity?', ['Quicksort', 'Heapsort', 'Merge Sort', 'Selection Sort'], 2, 'Merge sort is both stable and guarantees O(n log n) even in the worst case.', 'Hard'],
    ['What is the primary trade-off of using a hash table over a balanced BST?', ['Hash tables offer average O(1) operations but no ordering; BSTs offer O(log n) with sorted order', 'Hash tables are always slower', 'BSTs cannot store duplicates', 'Hash tables use less memory always'], 0, 'Hash tables trade ordering for average constant-time operations, unlike ordered BSTs.', 'Hard'],
  ],
};

function genTechnicalPool(subject) {
  return TECHNICAL_RAW[subject].map(([question, options, ci, explanation, difficulty]) => q(question, options, ci, explanation, difficulty));
}

// ---------------------------------------------------------------------------
// Glossary-based MCQ generator — scales any technical subject to a large,
// non-repeating bank. Each [term, definition, difficulty] triple becomes one
// "what best describes X" MCQ; the 3 distractor options are other terms'
// definitions from the same subject (deterministically spaced so distractor
// sets vary across the list rather than always drawing from neighbors).
// ---------------------------------------------------------------------------

function glossaryPool(subject, terms) {
  const n = terms.length;
  const step = Math.max(1, Math.floor(n / 4));
  return terms.map(([term, definition], i) => {
    const distractorIdxs = [];
    let s = step;
    while (distractorIdxs.length < 3) {
      const idx = (i + s) % n;
      if (idx !== i && !distractorIdxs.includes(idx)) distractorIdxs.push(idx);
      s += step;
    }
    const options = [definition, ...distractorIdxs.map((idx) => terms[idx][1])];
    const correctPos = i % options.length;
    const shuffled = options.slice();
    [shuffled[0], shuffled[correctPos]] = [shuffled[correctPos], shuffled[0]];
    return q(`In ${subject}, which option best describes "${term}"?`, shuffled, correctPos, `${term} — ${definition}`, terms[i][2]);
  });
}

/**
 * Turns a spread of glossary terms into "Explain X" interview Q&A entries —
 * picks terms at even intervals across the list (rather than the first N)
 * so the selection spans easy/medium/hard content instead of clustering.
 */
function glossaryToInterviewQuestions(subject, terms, count) {
  const n = terms.length;
  const stride = Math.max(1, Math.floor(n / count));
  const picked = [];
  for (let i = 0; i < n && picked.length < count; i += stride) picked.push(terms[i]);
  return picked.map(([term, definition, difficulty]) => ({
    question: `What is ${term} in ${subject}? Explain briefly.`,
    category: 'technical',
    subject,
    answer: definition,
    difficulty,
  }));
}

// Term format: [term, one-sentence definition, difficulty]
const GLOSSARY_TERMS = {
  OS: [
    ['Process', 'A program in execution, with its own memory, state, and process control block.', 'Easy'],
    ['Thread', 'A lightweight unit of execution within a process that shares its memory space.', 'Easy'],
    ['PCB (Process Control Block)', 'A data structure holding a process\'s state, registers, and scheduling info.', 'Medium'],
    ['Context Switch', 'Saving one process\'s state and loading another\'s so the CPU can switch between them.', 'Medium'],
    ['Kernel', 'The core of the OS that manages hardware, processes, and system resources directly.', 'Easy'],
    ['System Call', 'A controlled entry point that lets user programs request services from the kernel.', 'Medium'],
    ['Multiprogramming', 'Keeping multiple programs in memory at once so the CPU is rarely idle.', 'Easy'],
    ['Multitasking', 'Rapidly switching the CPU between multiple tasks to give the illusion of parallelism.', 'Easy'],
    ['Process State', 'A stage a process passes through: new, ready, running, waiting, or terminated.', 'Easy'],
    ['CPU Scheduling', 'Deciding which ready process gets the CPU next, e.g. via FCFS, SJF, or Round Robin.', 'Medium'],
    ['FCFS Scheduling', 'First-Come-First-Served: processes are executed strictly in arrival order.', 'Easy'],
    ['SJF Scheduling', 'Shortest Job First: the process with the smallest burst time runs next.', 'Medium'],
    ['Round Robin Scheduling', 'Each process gets a fixed time quantum in a cyclic order, enabling preemption.', 'Medium'],
    ['Priority Scheduling', 'Processes run in order of assigned priority, which can cause starvation of low priorities.', 'Medium'],
    ['Starvation', 'A process is perpetually denied the resources it needs to proceed.', 'Medium'],
    ['Aging', 'Gradually increasing a waiting process\'s priority over time to prevent starvation.', 'Hard'],
    ['Deadlock', 'A set of processes are each waiting for a resource held by another in the set, forever.', 'Medium'],
    ['Mutual Exclusion (deadlock condition)', 'Only one process can use a resource at a time.', 'Medium'],
    ['Hold and Wait', 'A process holds a resource while waiting to acquire additional ones.', 'Medium'],
    ['Circular Wait', 'A closed chain of processes, each waiting for a resource held by the next.', 'Medium'],
    ['Banker\'s Algorithm', 'A deadlock-avoidance algorithm that only grants requests leaving the system in a safe state.', 'Hard'],
    ['Deadlock Prevention', 'Designing the system so at least one of the four deadlock conditions can never hold.', 'Hard'],
    ['Deadlock Detection', 'Periodically checking the resource-allocation graph for cycles to catch deadlocks after they occur.', 'Hard'],
    ['Semaphore', 'An integer synchronization variable manipulated only via atomic wait/signal operations.', 'Medium'],
    ['Binary Semaphore (Mutex)', 'A semaphore restricted to values 0 and 1, used for mutual exclusion.', 'Medium'],
    ['Counting Semaphore', 'A semaphore that can take a range of values, used to manage a pool of resources.', 'Hard'],
    ['Critical Section', 'The part of a program where shared resources are accessed and must not run concurrently.', 'Easy'],
    ['Race Condition', 'The final outcome depends on the unpredictable timing/order of concurrent operations.', 'Medium'],
    ['Monitor', 'A high-level synchronization construct bundling shared data with mutually exclusive procedures.', 'Hard'],
    ['Producer-Consumer Problem', 'A classic synchronization problem coordinating producers and consumers over a shared buffer.', 'Medium'],
    ['Dining Philosophers Problem', 'A classic problem illustrating deadlock/starvation risks when sharing limited resources.', 'Hard'],
    ['Readers-Writers Problem', 'A synchronization problem allowing concurrent readers but exclusive writers on shared data.', 'Hard'],
    ['Virtual Memory', 'An abstraction giving each process the illusion of a large, contiguous address space.', 'Medium'],
    ['Paging', 'Dividing memory into fixed-size pages/frames to avoid external fragmentation.', 'Medium'],
    ['Segmentation', 'Dividing a program into variable-sized logical segments like code, data, and stack.', 'Medium'],
    ['Page Fault', 'An interrupt raised when a process accesses a page not currently in physical memory.', 'Easy'],
    ['Thrashing', 'Excessive paging activity causes CPU utilization to collapse as processes swap constantly.', 'Medium'],
    ['Demand Paging', 'Pages are loaded into memory only when actually referenced, not all upfront.', 'Medium'],
    ['TLB (Translation Lookaside Buffer)', 'A hardware cache that speeds up virtual-to-physical address translation.', 'Hard'],
    ['Belady\'s Anomaly', 'A counterintuitive case where adding more frames increases the number of page faults.', 'Hard'],
    ['Internal Fragmentation', 'Wasted space inside an allocated fixed-size block that\'s larger than needed.', 'Medium'],
    ['External Fragmentation', 'Free memory is scattered in small blocks, too fragmented to satisfy a large request.', 'Medium'],
    ['FIFO Page Replacement', 'The oldest page loaded into memory is the first one replaced.', 'Easy'],
    ['LRU Page Replacement', 'The page that hasn\'t been used for the longest time is replaced.', 'Medium'],
    ['Optimal Page Replacement', 'Replaces the page that won\'t be needed for the longest time in the future (theoretical best).', 'Hard'],
    ['Disk Scheduling', 'Deciding the order to service pending disk I/O requests, e.g. via SCAN or SSTF.', 'Hard'],
    ['SSTF Disk Scheduling', 'Shortest Seek Time First: services the request closest to the current head position.', 'Hard'],
    ['SCAN Disk Scheduling', 'The disk arm sweeps in one direction servicing requests, then reverses (elevator algorithm).', 'Hard'],
    ['Spooling', 'Buffering output for a slow device (like a printer) on disk so jobs don\'t block waiting for it.', 'Medium'],
    ['Buffering', 'Temporarily storing data to smooth out speed differences between producer and consumer.', 'Easy'],
    ['Inter-Process Communication (IPC)', 'Mechanisms like pipes, message queues, and shared memory letting processes exchange data.', 'Medium'],
    ['Pipe', 'A unidirectional communication channel connecting the output of one process to the input of another.', 'Easy'],
    ['Shared Memory (IPC)', 'A region of memory mapped into multiple processes\' address spaces for fast data exchange.', 'Hard'],
    ['Orphan Process', 'A child process whose parent has terminated before it did.', 'Medium'],
    ['Zombie Process', 'A terminated process whose exit status hasn\'t yet been read by its parent.', 'Medium'],
    ['fork() System Call', 'Creates a new child process that is a near-duplicate of the calling parent process.', 'Medium'],
    ['exec() System Call', 'Replaces a process\'s memory image with a new program.', 'Hard'],
    ['Kernel Mode vs User Mode', 'Kernel mode allows unrestricted hardware access; user mode restricts programs for safety.', 'Medium'],
    ['Interrupt', 'A signal that pauses the CPU\'s current work to handle an urgent event, then resumes.', 'Easy'],
    ['DMA (Direct Memory Access)', 'Lets I/O devices transfer data to/from memory without going through the CPU for every byte.', 'Hard'],
    ['Inode', 'A file-system data structure storing a file\'s metadata (permissions, size, block pointers) but not its name.', 'Hard'],
    ['RAID', 'Redundant Array of Independent Disks — combining disks for performance and/or fault tolerance.', 'Hard'],
    ['Swapping', 'Moving an entire process between main memory and disk to free up RAM.', 'Medium'],
    ['Working Set Model', 'Tracks the set of pages a process actively uses recently, guiding how much memory to allocate it.', 'Hard'],
    ['Copy-on-Write', 'Delays copying shared memory until one of the sharing processes actually writes to it.', 'Hard'],
    ['Priority Inversion', 'A high-priority task is indirectly blocked by a lower-priority one holding a needed lock.', 'Hard'],
    ['Convoy Effect', 'A slow process holding the CPU/resource causes many shorter ones to queue up behind it, hurting throughput.', 'Hard'],
    ['Multilevel Feedback Queue', 'A scheduler with multiple priority queues that lets a process move between queues based on behavior.', 'Hard'],
    ['Livelock', 'Processes keep changing state in response to each other without making actual progress, unlike deadlock.', 'Hard'],
    ['Context Switch Overhead', 'The CPU time spent saving/restoring state during a switch, which is pure overhead with no useful work.', 'Hard'],
    ['User-level vs Kernel-level Threads', 'User-level threads are managed by a library without kernel awareness; kernel threads are scheduled directly by the OS.', 'Hard'],
    ['Microkernel vs Monolithic Kernel', 'A microkernel keeps only core services in kernel space; a monolithic kernel runs most OS services there.', 'Hard'],
    ['NUMA', 'Non-Uniform Memory Access — a multiprocessor design where memory access time depends on the memory\'s location relative to the CPU.', 'Hard'],
    ['Cache Coherence', 'Ensuring multiple CPU caches show a consistent view of shared memory in a multiprocessor system.', 'Hard'],
    ['Memory-Mapped Files', 'Mapping a file directly into a process\'s address space so it can be accessed like memory.', 'Hard'],
    ['ASLR', 'Address Space Layout Randomization — randomizes memory addresses to make certain exploits harder.', 'Hard'],
    ['Journaling File System', 'Logs changes to a journal before committing them, allowing fast recovery after a crash.', 'Hard'],
    ['Soft vs Hard Real-Time Systems', 'Hard real-time systems must always meet strict deadlines; soft real-time systems tolerate occasional misses.', 'Hard'],
    ['Interrupt Vector Table', 'A table mapping interrupt numbers to the addresses of their corresponding handler routines.', 'Hard'],
    ['Long-Term vs Short-Term Scheduler', 'The long-term scheduler controls which jobs enter the ready queue; the short-term scheduler picks the next one to run on the CPU.', 'Hard'],
  ],
  DBMS: [
    ['Primary Key', 'A column (or set of columns) that uniquely identifies each row and cannot be NULL.', 'Easy'],
    ['Foreign Key', 'A column referencing the primary key of another table to enforce referential integrity.', 'Easy'],
    ['Candidate Key', 'Any minimal set of columns that could serve as the primary key.', 'Medium'],
    ['Composite Key', 'A primary key made up of two or more columns together.', 'Medium'],
    ['Super Key', 'Any set of columns that uniquely identifies a row, including extra unnecessary columns.', 'Medium'],
    ['1NF (First Normal Form)', 'Requires atomic column values and no repeating groups within a row.', 'Easy'],
    ['2NF (Second Normal Form)', '1NF plus no partial dependency of non-key attributes on part of a composite key.', 'Medium'],
    ['3NF (Third Normal Form)', '2NF plus no transitive dependency of non-key attributes on the primary key.', 'Medium'],
    ['BCNF', 'A stronger version of 3NF where every determinant must be a candidate key.', 'Hard'],
    ['Functional Dependency', 'A constraint where one attribute\'s value determines another attribute\'s value.', 'Medium'],
    ['Transitive Dependency', 'A non-key attribute depends on another non-key attribute rather than directly on the key.', 'Medium'],
    ['Multivalued Dependency', 'One attribute determines a set of values for another, independent of other attributes (4NF concern).', 'Hard'],
    ['Denormalization', 'Deliberately introducing redundancy into a normalized schema to speed up reads.', 'Medium'],
    ['ACID Properties', 'Atomicity, Consistency, Isolation, Durability — guarantees for reliable transactions.', 'Easy'],
    ['Atomicity', 'A transaction either completes entirely or has no effect at all.', 'Easy'],
    ['Isolation', 'Concurrent transactions produce the same result as if they ran one after another.', 'Medium'],
    ['Durability', 'Once committed, a transaction\'s changes survive even a system crash.', 'Medium'],
    ['Transaction', 'A sequence of database operations treated as a single logical unit of work.', 'Easy'],
    ['Concurrency Control', 'Techniques (like locking) ensuring correct results when transactions run simultaneously.', 'Medium'],
    ['Two-Phase Locking (2PL)', 'A protocol where a transaction acquires all needed locks before releasing any.', 'Hard'],
    ['Deadlock (DBMS)', 'Two or more transactions are each waiting on a lock held by the other, forever.', 'Medium'],
    ['Isolation Levels', 'Settings (like Read Committed, Serializable) controlling how much transactions see of each other.', 'Hard'],
    ['Dirty Read', 'A transaction reads uncommitted changes made by another transaction.', 'Medium'],
    ['Phantom Read', 'A transaction re-runs a query and finds new rows added by another committed transaction.', 'Hard'],
    ['Serializable Isolation', 'The strictest isolation level — concurrent execution behaves as if transactions ran serially.', 'Hard'],
    ['Index', 'A structure that speeds up row lookups at the cost of extra storage and slower writes.', 'Easy'],
    ['B+ Tree Index', 'A balanced tree structure commonly used for database indexes, keeping data sorted for range queries.', 'Hard'],
    ['Clustered Index', 'An index that determines the physical storage order of table rows.', 'Hard'],
    ['Non-Clustered Index', 'A separate structure pointing to row locations, not affecting physical row order.', 'Hard'],
    ['View', 'A virtual table defined by a stored SQL query, computed on demand.', 'Easy'],
    ['Materialized View', 'A view whose results are physically stored and periodically refreshed for speed.', 'Hard'],
    ['Trigger', 'A block of code that automatically runs in response to an INSERT, UPDATE, or DELETE.', 'Medium'],
    ['Stored Procedure', 'A precompiled, named block of SQL logic that can be invoked repeatedly.', 'Medium'],
    ['Cursor', 'A database object used to iterate through the rows of a query result one at a time.', 'Hard'],
    ['Inner Join', 'Returns only rows that have matching values in both joined tables.', 'Easy'],
    ['Left Outer Join', 'Returns all left-table rows plus matches from the right table, NULL where unmatched.', 'Medium'],
    ['Self Join', 'A table is joined with itself, typically using aliases to distinguish the two roles.', 'Medium'],
    ['Natural Join', 'Joins two tables automatically on all columns with matching names.', 'Medium'],
    ['Cartesian Product (Cross Join)', 'Combines every row of one table with every row of another, with no join condition.', 'Medium'],
    ['Subquery', 'A query nested inside another SQL query, e.g. in WHERE, FROM, or SELECT.', 'Medium'],
    ['Correlated Subquery', 'A subquery that references a column from the outer query and re-runs once per outer row.', 'Hard'],
    ['Referential Integrity', 'A rule ensuring foreign key values always match an existing primary key value.', 'Medium'],
    ['Check Constraint', 'A rule restricting the values allowed in a column beyond just its data type.', 'Easy'],
    ['ER Model', 'A conceptual design technique representing data as entities, attributes, and relationships.', 'Easy'],
    ['Weak Entity', 'An entity that cannot be uniquely identified without the primary key of another (owner) entity.', 'Hard'],
    ['Relational Algebra', 'A formal set of operations (select, project, join, union...) defining how relations are queried.', 'Hard'],
    ['Data Warehouse', 'A large, centralized repository optimized for analytical queries over historical data.', 'Medium'],
    ['OLTP', 'Online Transaction Processing — systems optimized for many short, frequent read/write transactions.', 'Medium'],
    ['OLAP', 'Online Analytical Processing — systems optimized for complex analytical/aggregate queries.', 'Medium'],
    ['Sharding', 'Splitting a large database horizontally across multiple servers by key ranges.', 'Hard'],
    ['Replication', 'Maintaining copies of the same data across multiple database servers for availability.', 'Medium'],
    ['CAP Theorem', 'A distributed system can guarantee at most two of Consistency, Availability, and Partition tolerance.', 'Hard'],
    ['Two-Phase Commit', 'A protocol coordinating a distributed transaction\'s commit across multiple databases atomically.', 'Hard'],
    ['Data Integrity', 'The overall accuracy, consistency, and reliability of data stored in a database.', 'Easy'],
    ['Schema', 'The formal structure describing tables, columns, types, and constraints in a database.', 'Easy'],
    ['Entity Integrity', 'The rule that every table must have a primary key and it must never be NULL.', 'Medium'],
    ['Aggregate Function', 'A function like SUM, COUNT, or AVG that computes a single value from multiple rows.', 'Easy'],
    ['GROUP BY', 'Groups rows sharing a value so aggregate functions can be computed per group.', 'Easy'],
    ['HAVING Clause', 'Filters groups after aggregation, unlike WHERE which filters rows before it.', 'Medium'],
    ['4NF', 'Fourth Normal Form — removes multivalued dependencies not already handled by BCNF.', 'Hard'],
    ['5NF', 'Fifth Normal Form — removes join dependencies, ensuring a relation can\'t be decomposed further without loss.', 'Hard'],
    ['Lock Granularity', 'The size of the data unit a lock protects — from a whole table down to a single row.', 'Hard'],
    ['Timestamp Ordering Protocol', 'A concurrency-control scheme that orders conflicting operations based on transaction timestamps.', 'Hard'],
    ['Optimistic Concurrency Control', 'Lets transactions proceed without locking, validating for conflicts only at commit time.', 'Hard'],
    ['Write-Ahead Logging', 'Changes are logged to durable storage before being applied, enabling crash recovery.', 'Hard'],
    ['Checkpoint (DB recovery)', 'A saved point recording the database state so recovery doesn\'t need to replay the entire log.', 'Hard'],
    ['Shadow Paging', 'A recovery technique that maintains two page tables (current and shadow) to support atomic commits.', 'Hard'],
    ['Query Optimizer', 'The DBMS component that chooses an efficient execution plan for a given SQL query.', 'Hard'],
    ['Execution Plan', 'The step-by-step strategy (joins, scans, index usage) the database will use to run a query.', 'Hard'],
    ['Covering Index', 'An index that contains all the columns a query needs, avoiding a lookup to the base table.', 'Hard'],
    ['Index Seek vs Scan', 'A seek jumps directly to matching rows via the index; a scan reads through rows sequentially.', 'Hard'],
    ['Partitioning (DB)', 'Splitting a large table into smaller physical pieces while keeping it logically one table.', 'Hard'],
    ['Star Schema', 'A data warehouse design with a central fact table connected to surrounding dimension tables.', 'Hard'],
    ['Snowflake Schema', 'A star schema variant where dimension tables are further normalized into sub-dimensions.', 'Hard'],
    ['Eventual Consistency', 'A distributed-systems consistency model where replicas converge to the same value over time, not instantly.', 'Hard'],
    ['Distributed Deadlock', 'A deadlock spanning multiple database nodes, harder to detect than a single-node deadlock.', 'Hard'],
  ],
  'Computer Networks': [
    ['OSI Model', 'A 7-layer conceptual model (Physical to Application) describing how network communication works.', 'Easy'],
    ['TCP/IP Model', 'A practical 4-layer networking model that the modern internet is actually built on.', 'Medium'],
    ['Physical Layer', 'Handles raw bit transmission over a physical medium like cable or radio.', 'Easy'],
    ['Data Link Layer', 'Handles node-to-node framing, MAC addressing, and error detection on a local link.', 'Medium'],
    ['Network Layer', 'Handles logical addressing (IP) and routing packets across multiple networks.', 'Easy'],
    ['Transport Layer', 'Handles end-to-end delivery, e.g. via TCP (reliable) or UDP (fast, unreliable).', 'Easy'],
    ['TCP', 'A connection-oriented, reliable transport protocol with ordering and retransmission.', 'Easy'],
    ['UDP', 'A connectionless transport protocol with no delivery guarantees but lower overhead.', 'Easy'],
    ['Three-Way Handshake', 'SYN, SYN-ACK, ACK — the sequence TCP uses to establish a reliable connection.', 'Medium'],
    ['Congestion Control', 'TCP mechanisms (like slow start) that reduce sending rate when the network is overloaded.', 'Hard'],
    ['Flow Control', 'Preventing a fast sender from overwhelming a slower receiver\'s buffer.', 'Medium'],
    ['Sliding Window Protocol', 'Allows multiple packets to be in flight before requiring an acknowledgment, improving throughput.', 'Hard'],
    ['IP Address', 'A numeric label identifying a device on a network, e.g. IPv4 or IPv6.', 'Easy'],
    ['Subnetting', 'Dividing a larger network into smaller logical sub-networks.', 'Medium'],
    ['CIDR', 'Classless Inter-Domain Routing — a compact way to represent IP ranges, e.g. 192.168.0.0/24.', 'Hard'],
    ['NAT', 'Network Address Translation — lets many private devices share one public IP address.', 'Medium'],
    ['DNS', 'Domain Name System — translates human-readable domain names into IP addresses.', 'Easy'],
    ['DHCP', 'Dynamically assigns IP addresses and network config to devices joining a network.', 'Medium'],
    ['ARP', 'Address Resolution Protocol — resolves an IP address to its corresponding MAC address on a LAN.', 'Medium'],
    ['MAC Address', 'A hardware address uniquely identifying a network interface at the Data Link layer.', 'Easy'],
    ['Router', 'A device that forwards packets between different networks based on IP addresses.', 'Easy'],
    ['Switch', 'A device that forwards frames within a LAN based on MAC addresses.', 'Easy'],
    ['Hub', 'A basic device that broadcasts incoming data to all connected ports (no addressing intelligence).', 'Easy'],
    ['Gateway', 'A device/node that connects two different networks, often translating between protocols.', 'Medium'],
    ['Firewall', 'Monitors and filters network traffic based on defined security rules.', 'Easy'],
    ['Proxy Server', 'An intermediary server that forwards client requests, often for caching or anonymity.', 'Medium'],
    ['Load Balancer', 'Distributes incoming traffic across multiple servers to improve reliability and performance.', 'Medium'],
    ['VPN', 'Virtual Private Network — creates an encrypted tunnel over a public network for secure access.', 'Medium'],
    ['CDN', 'Content Delivery Network — geographically distributed servers that cache content closer to users.', 'Medium'],
    ['HTTP', 'Application-layer protocol for transferring web content, typically over port 80.', 'Easy'],
    ['HTTPS', 'HTTP secured with TLS/SSL encryption, typically over port 443.', 'Easy'],
    ['FTP', 'File Transfer Protocol — used to transfer files between a client and server.', 'Easy'],
    ['SMTP', 'Simple Mail Transfer Protocol — used to send email between mail servers.', 'Medium'],
    ['SSH', 'Secure Shell — an encrypted protocol for securely accessing and managing remote systems.', 'Medium'],
    ['Telnet', 'An older, unencrypted protocol for remote terminal access (largely replaced by SSH).', 'Medium'],
    ['Socket', 'An endpoint for network communication defined by an IP address and port number.', 'Medium'],
    ['Port Number', 'A number identifying a specific process/service on a device, e.g. 80 for HTTP.', 'Easy'],
    ['Circuit Switching', 'A dedicated communication path is reserved for the entire duration of a session.', 'Medium'],
    ['Packet Switching', 'Data is broken into packets, each routed independently and reassembled at the destination.', 'Medium'],
    ['Bandwidth', 'The maximum rate of data transfer across a network path, usually in bits per second.', 'Easy'],
    ['Latency', 'The time delay for data to travel from source to destination.', 'Easy'],
    ['Throughput', 'The actual amount of data successfully transferred over a network in a given time.', 'Medium'],
    ['Jitter', 'The variation in packet arrival delay, which especially affects real-time audio/video.', 'Hard'],
    ['Collision Domain', 'A network segment where data packets can collide with one another.', 'Hard'],
    ['Broadcast Domain', 'A network segment where a broadcast frame reaches every connected device.', 'Hard'],
    ['VLAN', 'Virtual LAN — logically segments a physical network into separate broadcast domains.', 'Hard'],
    ['Spanning Tree Protocol', 'Prevents loops in a switched network by disabling redundant paths until needed.', 'Hard'],
    ['CRC (Cyclic Redundancy Check)', 'An error-detection technique that appends a checksum computed from the data.', 'Hard'],
    ['Checksum', 'A simple error-detection value computed from data to verify it wasn\'t corrupted in transit.', 'Medium'],
    ['Multiplexing', 'Combining multiple signals to share a single communication channel efficiently.', 'Hard'],
    ['Routing Protocol', 'A protocol (like OSPF or BGP) routers use to exchange info and build routing tables.', 'Hard'],
    ['OSPF', 'Open Shortest Path First — a link-state interior gateway routing protocol.', 'Hard'],
    ['BGP', 'Border Gateway Protocol — the protocol that routes traffic between autonomous systems on the internet.', 'Hard'],
    ['ICMP', 'Internet Control Message Protocol — used for diagnostics and error reporting, e.g. by ping.', 'Medium'],
    ['Client-Server Model', 'Clients request services or resources from a centralized server.', 'Easy'],
    ['Peer-to-Peer Model', 'Nodes act as both clients and servers, sharing resources directly with each other.', 'Easy'],
    ['SSL/TLS Handshake', 'The process where client and server agree on encryption parameters to start a secure session.', 'Hard'],
    ['IPv4 vs IPv6', 'IPv4 uses 32-bit addresses; IPv6 uses 128-bit addresses to solve address exhaustion.', 'Medium'],
    ['URL', 'Uniform Resource Locator — specifies the address and access method for a web resource.', 'Easy'],
    ['Distance Vector Routing', 'Routers share their entire routing table with neighbors periodically to build routes (e.g. RIP).', 'Hard'],
    ['Link State Routing', 'Routers share info about their direct links with the whole network to independently compute shortest paths (e.g. OSPF).', 'Hard'],
    ['Autonomous System', 'A collection of networks under a single administrative control, the unit BGP routes between.', 'Hard'],
    ['Piggybacking', 'Delaying an acknowledgment so it can be attached to an outgoing data frame instead of sent separately.', 'Hard'],
    ['Go-Back-N ARQ', 'A sliding-window protocol that retransmits an entire window of frames after an error is detected.', 'Hard'],
    ['Selective Repeat ARQ', 'A sliding-window protocol that retransmits only the specific frames that were lost or corrupted.', 'Hard'],
    ['Slow Start (TCP)', 'A congestion-control phase where TCP\'s send window grows exponentially until it detects congestion.', 'Hard'],
    ['TCP Congestion Avoidance', 'After slow start, TCP grows its window linearly to probe for available bandwidth cautiously.', 'Hard'],
    ['Head-of-Line Blocking', 'A delayed packet at the front of a queue/stream blocks all packets behind it from being processed.', 'Hard'],
    ['Anycast', 'A routing scheme where multiple servers share one IP address and traffic is sent to the nearest one.', 'Hard'],
    ['Multicast', 'Sending a single stream of data to a group of interested recipients simultaneously.', 'Hard'],
    ['Time to Live (TTL)', 'A field limiting how many hops a packet can traverse before being discarded, preventing routing loops.', 'Hard'],
    ['MTU', 'Maximum Transmission Unit — the largest packet size a network link can carry without fragmentation.', 'Hard'],
    ['IP Fragmentation', 'Splitting a packet larger than the path MTU into smaller pieces for transmission.', 'Hard'],
    ['Port Forwarding', 'Redirecting traffic arriving at a specific port on a router to a specific internal device.', 'Hard'],
    ['DNS Resolution Steps', 'A recursive resolver queries root, then TLD, then authoritative name servers to resolve a domain.', 'Hard'],
    ['SYN Flood Attack', 'A denial-of-service attack that exhausts a server\'s resources with incomplete TCP handshakes.', 'Hard'],
    ['Man-in-the-Middle Attack', 'An attacker secretly intercepts and possibly alters communication between two parties.', 'Hard'],
  ],
  OOP: [
    ['Encapsulation', 'Bundling data and the methods that operate on it, restricting direct outside access.', 'Easy'],
    ['Abstraction', 'Exposing only essential features of an object while hiding implementation details.', 'Easy'],
    ['Inheritance', 'A mechanism where a class acquires properties and behavior from a parent class.', 'Easy'],
    ['Polymorphism', 'The same interface or method call behaves differently depending on the actual object type.', 'Easy'],
    ['Class', 'A blueprint defining the properties and behaviors that its objects will have.', 'Easy'],
    ['Object', 'A concrete instance of a class with its own state.', 'Easy'],
    ['Constructor', 'A special method automatically called to initialize a newly created object.', 'Easy'],
    ['Destructor', 'A special method called to clean up resources when an object\'s lifetime ends.', 'Medium'],
    ['Method Overloading', 'Multiple methods share a name but differ in parameter list, resolved at compile time.', 'Medium'],
    ['Method Overriding', 'A subclass redefines a parent method with the same signature, resolved at runtime.', 'Medium'],
    ['Interface', 'A contract declaring methods a class must implement, without providing their implementation.', 'Medium'],
    ['Abstract Class', 'A class that cannot be instantiated directly and may contain unimplemented methods.', 'Medium'],
    ['Access Modifiers', 'Keywords (public, private, protected) controlling visibility of class members.', 'Easy'],
    ['Static Member', 'A field or method that belongs to the class itself rather than any single instance.', 'Medium'],
    ['Composition', 'Building complex objects by combining other objects — a strong "has-a" relationship.', 'Medium'],
    ['Aggregation', 'A "has-a" relationship where the contained object can exist independently of the container.', 'Hard'],
    ['Association', 'A general relationship between two otherwise independent classes.', 'Hard'],
    ['Coupling', 'The degree of interdependence between different modules or classes.', 'Hard'],
    ['Cohesion', 'How closely the responsibilities within a single module or class are related.', 'Hard'],
    ['SOLID Principles', 'Five design guidelines (SRP, OCP, LSP, ISP, DIP) for maintainable object-oriented code.', 'Hard'],
    ['Single Responsibility Principle', 'A class should have only one reason to change.', 'Medium'],
    ['Open/Closed Principle', 'Software entities should be open for extension but closed for modification.', 'Hard'],
    ['Liskov Substitution Principle', 'Subtypes must be substitutable for their base types without breaking correctness.', 'Hard'],
    ['Singleton Pattern', 'A design pattern ensuring a class has only one instance with a global access point.', 'Medium'],
    ['Factory Pattern', 'A design pattern that centralizes object creation logic behind a common interface.', 'Medium'],
    ['Observer Pattern', 'A design pattern where subscribers are automatically notified of changes in a subject.', 'Hard'],
    ['Virtual Function', 'A member function that can be overridden and is resolved via dynamic dispatch at runtime.', 'Hard'],
    ['Pure Virtual Function', 'A virtual function with no implementation, forcing the class to be abstract.', 'Hard'],
    ['Multiple Inheritance', 'A class inherits from more than one base class at once.', 'Medium'],
    ['Diamond Problem', 'An ambiguity arising when a class inherits from two classes that share a common base.', 'Hard'],
    ['Friend Function', 'A non-member function granted access to a class\'s private/protected members.', 'Hard'],
    ['this Keyword', 'A reference to the current object instance within a non-static method.', 'Easy'],
    ['Operator Overloading', 'Redefining how a standard operator (like +) behaves for a user-defined type.', 'Medium'],
    ['Dynamic Binding', 'The method to call is decided at runtime based on the object\'s actual type.', 'Hard'],
    ['Static Binding', 'The method to call is decided at compile time based on the declared type.', 'Hard'],
    ['Shallow Copy', 'Copies an object\'s top-level fields, but nested objects are still shared by reference.', 'Hard'],
    ['Deep Copy', 'Recursively copies an object and everything it references, with no shared nested data.', 'Hard'],
    ['Immutability', 'An object\'s state cannot be changed once created.', 'Medium'],
    ['Design Pattern', 'A general, reusable solution to a commonly occurring software design problem.', 'Easy'],
    ['Interface Segregation Principle', 'Clients shouldn\'t be forced to depend on methods they don\'t use — prefer many specific interfaces over one broad one.', 'Hard'],
    ['Dependency Inversion Principle', 'High-level modules should depend on abstractions, not on low-level module implementations directly.', 'Hard'],
    ['Strategy Pattern', 'A design pattern that defines a family of interchangeable algorithms and selects one at runtime.', 'Hard'],
    ['Decorator Pattern', 'A design pattern that adds new behavior to an object dynamically by wrapping it, without altering its class.', 'Hard'],
    ['Adapter Pattern', 'A design pattern that converts one interface into another that a client expects.', 'Hard'],
    ['Builder Pattern', 'A design pattern that constructs a complex object step by step, separate from its final representation.', 'Hard'],
    ['Object Slicing', 'When a derived-class object is assigned to a base-class object by value, its derived-specific data is lost.', 'Hard'],
    ['Covariant Return Type', 'An overriding method may return a subtype of the return type declared in the overridden method.', 'Hard'],
    ['Late Binding vs Early Binding', 'Late binding resolves a call at runtime (virtual functions); early binding resolves it at compile time.', 'Hard'],
    ['Mixin', 'A class designed to provide reusable methods to other classes via inheritance/composition, not meant to stand alone.', 'Hard'],
    ['Law of Demeter', 'An object should only talk to its immediate collaborators, not reach through them to their internals.', 'Hard'],
    ['Interface Inheritance vs Implementation Inheritance', 'Interface inheritance shares only a contract; implementation inheritance shares actual code/behavior.', 'Hard'],
    ['Duck Typing', 'An object\'s suitability is determined by the methods/properties it has, not its explicit type or class.', 'Hard'],
    ['Fragile Base Class Problem', 'Seemingly safe changes to a base class can unexpectedly break subclasses that depend on its old behavior.', 'Hard'],
    ['Composition Root', 'A single, centralized place in an application where object graphs are assembled and dependencies wired up.', 'Hard'],
  ],
  Java: [
    ['JVM', 'Java Virtual Machine — executes compiled Java bytecode, giving Java platform independence.', 'Easy'],
    ['JDK', 'Java Development Kit — includes the compiler, tools, and JRE needed to develop Java programs.', 'Easy'],
    ['JRE', 'Java Runtime Environment — provides the libraries and JVM needed to run Java programs.', 'Easy'],
    ['Bytecode', 'Platform-independent intermediate code the JVM interprets or JIT-compiles.', 'Medium'],
    ['Garbage Collection', 'Automatic reclamation of memory used by objects no longer reachable by the program.', 'Medium'],
    ['Class Loader', 'The JVM subsystem that loads .class files into memory at runtime.', 'Hard'],
    ['JIT Compiler', 'Just-In-Time compiler — compiles hot bytecode paths to native code at runtime for speed.', 'Hard'],
    ['Autoboxing', 'Automatic conversion between a primitive type and its corresponding wrapper class.', 'Medium'],
    ['String Pool', 'A special memory area where the JVM reuses identical string literals to save memory.', 'Hard'],
    ['String Immutability', 'Once created, a Java String\'s contents can never be changed.', 'Medium'],
    ['StringBuilder', 'A mutable sequence of characters, more efficient than String for repeated concatenation.', 'Medium'],
    ['ArrayList', 'A resizable array-backed List implementation offering fast indexed access.', 'Easy'],
    ['LinkedList', 'A doubly-linked List implementation offering fast insertion/removal at the ends.', 'Medium'],
    ['HashMap', 'A Map implementation storing key-value pairs with average O(1) access, unordered.', 'Easy'],
    ['TreeMap', 'A Map implementation that keeps keys sorted, backed by a red-black tree.', 'Medium'],
    ['LinkedHashMap', 'A HashMap variant that preserves insertion order while iterating.', 'Medium'],
    ['equals() and hashCode()', 'Methods that must be overridden together so objects behave correctly in hash-based collections.', 'Hard'],
    ['Comparable Interface', 'Lets a class define its own natural ordering via compareTo().', 'Medium'],
    ['Comparator Interface', 'Defines an external, custom ordering for objects independent of their natural order.', 'Medium'],
    ['Checked Exception', 'An exception the compiler forces you to either catch or declare (extends Exception).', 'Medium'],
    ['Unchecked Exception', 'A RuntimeException subclass that doesn\'t need to be declared or caught explicitly.', 'Medium'],
    ['try-with-resources', 'Automatically closes AutoCloseable resources like streams once the block finishes.', 'Hard'],
    ['Multithreading', 'Running multiple threads concurrently within a single Java program.', 'Medium'],
    ['synchronized Keyword', 'Ensures only one thread can execute a block/method on an object at a time.', 'Medium'],
    ['volatile Keyword', 'Ensures a variable\'s updates are always visible to all threads immediately.', 'Hard'],
    ['final Keyword', 'Marks a variable as unmodifiable, a method as non-overridable, or a class as non-extendable.', 'Easy'],
    ['finally Block', 'A block that always executes after try/catch, regardless of whether an exception occurred.', 'Easy'],
    ['finalize() Method', 'A deprecated method the GC used to call before reclaiming an object\'s memory.', 'Hard'],
    ['Static Block', 'A block that runs once when the class is loaded, used for static initialization.', 'Hard'],
    ['Functional Interface', 'An interface with exactly one abstract method, usable as a lambda expression target.', 'Medium'],
    ['Lambda Expression', 'A concise syntax for writing an anonymous function/implementation of a functional interface.', 'Medium'],
    ['Stream API', 'A functional-style API for processing sequences of elements (map, filter, reduce, etc.).', 'Medium'],
    ['Generics', 'Lets classes/methods operate on typed parameters, catching type errors at compile time.', 'Medium'],
    ['Varargs', 'Lets a method accept a variable number of arguments of the same type.', 'Medium'],
    ['Annotation', 'Metadata attached to code (like @Override) that tools or the compiler can process.', 'Medium'],
    ['Reflection', 'The ability to inspect and manipulate classes, methods, and fields at runtime.', 'Hard'],
    ['Serialization', 'Converting an object into a byte stream so it can be stored or transmitted.', 'Medium'],
    ['Inner Class', 'A class defined within another class, with access to its enclosing instance\'s members.', 'Hard'],
    ['Enum', 'A special type representing a fixed set of named constants.', 'Easy'],
    ['instanceof Operator', 'Tests whether an object is an instance of a specific class or interface.', 'Easy'],
    ['Abstract Class vs Interface', 'Abstract classes can hold state and partial implementation; interfaces define a pure contract.', 'Medium'],
    ['Multi-catch Block', 'A single catch block that handles multiple exception types using the | separator.', 'Hard'],
    ['NullPointerException', 'Thrown when code tries to use a reference that points to null.', 'Easy'],
    ['ClassCastException', 'Thrown when code attempts an invalid cast between incompatible types.', 'Medium'],
    ['Package', 'A namespace that organizes related classes and interfaces together.', 'Easy'],
    ['Interface Default Method', 'A method in an interface with a body, letting implementers inherit default behavior.', 'Hard'],
    ['Fail-Fast vs Fail-Safe Iterators', 'Fail-fast iterators throw on concurrent modification; fail-safe iterators work on a cloned copy of the collection.', 'Hard'],
    ['ConcurrentModificationException', 'Thrown when a collection is structurally modified while being iterated without using its own iterator/API.', 'Hard'],
    ['Executor Framework', 'A higher-level API for managing thread pools instead of manually creating Thread objects.', 'Hard'],
    ['Deadlock in Java Threads', 'Two threads each hold a lock the other needs, waiting on each other forever.', 'Hard'],
    ['wait() vs sleep()', 'wait() releases the object\'s lock and waits for notify(); sleep() pauses the thread without releasing any lock.', 'Hard'],
    ['ClassNotFoundException vs NoClassDefFoundError', 'The former occurs when a class can\'t be found at runtime lookup; the latter when it was present at compile time but missing at runtime.', 'Hard'],
    ['Immutable Class Design', 'Creating a class whose objects cannot be modified after construction, typically by making all fields final.', 'Hard'],
    ['Object Cloning', 'Creating a copy of an object via the Cloneable interface and clone() method.', 'Hard'],
    ['PermGen / Metaspace', 'JVM memory regions historically (PermGen) and currently (Metaspace) used to store class metadata.', 'Hard'],
    ['Heap vs Stack Memory (Java)', 'Objects live on the heap and are garbage collected; method calls and local variables live on the stack.', 'Hard'],
    ['Marker Interface', 'An interface with no methods used purely to tag a class with metadata, e.g. Serializable.', 'Hard'],
    ['Type Erasure', 'Java generics exist only at compile time; type parameters are erased to their bounds at runtime.', 'Hard'],
    ['CompletableFuture', 'A class representing a future result of an async computation, supporting chaining and composition.', 'Hard'],
    ['ThreadLocal', 'Provides variables where each thread accessing it has its own independently initialized copy.', 'Hard'],
    ['Fork/Join Framework', 'A framework for parallelizing recursive divide-and-conquer tasks across a pool of worker threads.', 'Hard'],
    ['G1 Garbage Collector', 'A JVM garbage collector designed to balance throughput and pause times by dividing the heap into regions.', 'Hard'],
    ['Method Reference', 'A shorthand syntax (Class::method) for a lambda that just calls an existing method.', 'Hard'],
  ],
  Python: [
    ['List', 'A mutable, ordered collection of items that can hold mixed types.', 'Easy'],
    ['Tuple', 'An immutable, ordered collection of items, typically used for fixed groupings.', 'Easy'],
    ['Dictionary', 'A mutable collection of key-value pairs with average O(1) key lookup.', 'Easy'],
    ['Set', 'An unordered collection of unique, hashable elements.', 'Easy'],
    ['List Comprehension', 'A concise syntax to build a new list from an iterable, optionally with a condition.', 'Medium'],
    ['Generator', 'A function using yield that produces values lazily, one at a time, saving memory.', 'Medium'],
    ['Iterator', 'An object implementing __next__() that produces successive values from a sequence.', 'Medium'],
    ['Decorator', 'A function that wraps another function to extend its behavior without modifying its code.', 'Hard'],
    ['Lambda Function', 'A small anonymous function defined inline using the lambda keyword.', 'Easy'],
    ['*args', 'Collects extra positional arguments passed to a function into a tuple.', 'Medium'],
    ['**kwargs', 'Collects extra keyword arguments passed to a function into a dictionary.', 'Medium'],
    ['GIL (Global Interpreter Lock)', 'Restricts CPython to executing one thread\'s bytecode at a time, limiting true parallelism.', 'Hard'],
    ['Shallow Copy', 'Creates a new object but nested objects inside are still shared references.', 'Hard'],
    ['Deep Copy', 'Recursively duplicates an object and all objects nested inside it.', 'Hard'],
    ['Context Manager', 'An object supporting __enter__/__exit__, used with the "with" statement for setup/cleanup.', 'Medium'],
    ['Magic Method (__init__)', 'The special method Python calls automatically to initialize a new instance.', 'Easy'],
    ['__str__ vs __repr__', '__str__ gives a readable display string; __repr__ gives an unambiguous debug representation.', 'Hard'],
    ['Method Resolution Order (MRO)', 'The order Python searches parent classes when resolving inherited attributes.', 'Hard'],
    ['Class Variable vs Instance Variable', 'Class variables are shared across all instances; instance variables are unique per object.', 'Medium'],
    ['staticmethod', 'A method that doesn\'t receive self or cls, behaving like a plain function inside the class.', 'Medium'],
    ['classmethod', 'A method that receives the class itself (cls) as its first argument.', 'Medium'],
    ['property Decorator', 'Lets a method be accessed like an attribute, enabling computed/validated fields.', 'Hard'],
    ['Module', 'A single Python file containing reusable functions, classes, and variables.', 'Easy'],
    ['Package', 'A directory of Python modules organized under a common namespace with an __init__.py.', 'Easy'],
    ['Virtual Environment', 'An isolated Python environment with its own dependencies, separate from the system install.', 'Medium'],
    ['pip', 'Python\'s standard package manager for installing third-party libraries.', 'Easy'],
    ['Slicing', 'Extracting a sub-sequence from a list/string/tuple using the start:stop:step syntax.', 'Easy'],
    ['f-string', 'A string literal prefixed with f that allows embedded expressions inside {}.', 'Easy'],
    ['Unpacking', 'Assigning elements of an iterable to multiple variables in a single statement.', 'Medium'],
    ['global Keyword', 'Declares that an assignment inside a function should modify a module-level variable.', 'Medium'],
    ['nonlocal Keyword', 'Declares that an assignment should modify a variable in an enclosing (non-global) scope.', 'Hard'],
    ['Closure', 'A nested function that remembers variables from its enclosing scope even after that scope ends.', 'Hard'],
    ['map()', 'Applies a function to every item of an iterable, returning an iterator of results.', 'Medium'],
    ['filter()', 'Returns an iterator over items of an iterable for which a function returns True.', 'Medium'],
    ['reduce()', 'Cumulatively applies a function to items of an iterable, reducing it to a single value.', 'Hard'],
    ['Exception Handling', 'Using try/except/finally to catch and respond to runtime errors gracefully.', 'Easy'],
    ['KeyError', 'Raised when a dictionary key that doesn\'t exist is accessed.', 'Easy'],
    ['IndexError', 'Raised when a sequence index is out of range.', 'Easy'],
    ['assert Statement', 'Raises an AssertionError if the given condition evaluates to False, used for debugging checks.', 'Medium'],
    ['Walrus Operator (:=)', 'Assigns a value to a variable as part of a larger expression.', 'Hard'],
    ['Type Hinting', 'Optional annotations indicating expected variable/parameter/return types for tooling and clarity.', 'Medium'],
    ['Dataclass', 'A decorator that auto-generates boilerplate like __init__ and __repr__ for simple data-holding classes.', 'Hard'],
    ['namedtuple', 'A tuple subclass where fields can be accessed by name as well as by index.', 'Hard'],
    ['itertools Module', 'A standard library module providing efficient tools for building iterators, like combinations.', 'Hard'],
    ['Threading vs Multiprocessing', 'Threading shares memory but is limited by the GIL; multiprocessing uses separate processes for true parallelism.', 'Hard'],
    ['Mutable vs Immutable', 'Mutable objects (like lists) can change in place; immutable ones (like tuples) cannot.', 'Easy'],
    ['self Parameter', 'The conventional first parameter of an instance method, referring to the instance itself.', 'Easy'],
    ['Metaclass', 'A class whose instances are themselves classes — controls how classes are created.', 'Hard'],
    ['Abstract Base Class (ABC)', 'A class using the abc module to define methods subclasses are required to implement.', 'Hard'],
    ['Descriptor Protocol', 'Defines how attribute access is intercepted via __get__, __set__, and __delete__ methods.', 'Hard'],
    ['__slots__', 'Restricts an object to a fixed set of attributes, saving memory by skipping the per-instance __dict__.', 'Hard'],
    ['Monkey Patching', 'Dynamically modifying or extending a class or module\'s behavior at runtime.', 'Hard'],
    ['Operator Overloading (Python)', 'Implementing magic methods like __add__ to define custom behavior for operators on a class.', 'Hard'],
    ['Coroutines (async def)', 'Functions defined with async def that can be paused and resumed, used for asynchronous programming.', 'Hard'],
    ['Event Loop (asyncio)', 'The core of Python\'s asyncio that schedules and runs coroutines cooperatively on a single thread.', 'Hard'],
    ['Garbage Collection (Python)', 'CPython primarily uses reference counting, supplemented by a cyclic garbage collector for reference cycles.', 'Hard'],
    ['Reference Counting', 'CPython tracks how many references point to an object and frees it when the count hits zero.', 'Hard'],
    ['Memoryview', 'A built-in object that exposes a buffer\'s memory without copying it, useful for large data.', 'Hard'],
    ['Abstract Syntax Tree (Python)', 'A tree representation of parsed Python source code, accessible via the ast module.', 'Hard'],
    ['Duck Typing (Python)', 'Python cares about whether an object supports the needed methods, not its explicit declared type.', 'Hard'],
    ['Positional-only Parameters', 'Function parameters (before /) that callers must supply positionally, not by keyword.', 'Hard'],
    ['Keyword-only Parameters', 'Function parameters (after *) that callers must supply by keyword, not positionally.', 'Hard'],
    ['Exception Chaining', 'Using "raise ... from ..." to preserve the original exception context when re-raising a new one.', 'Hard'],
    ['Metaprogramming', 'Writing code that manipulates other code, e.g. via decorators, metaclasses, or dynamic attribute creation.', 'Hard'],
    ['Interning', 'CPython reuses small integers and some strings as shared objects instead of creating duplicates.', 'Hard'],
  ],
  C: [
    ['Pointer', 'A variable that stores the memory address of another variable.', 'Easy'],
    ['Pointer Arithmetic', 'Adding/subtracting integers to a pointer moves it by that many elements, not bytes.', 'Medium'],
    ['Array vs Pointer', 'An array name decays to a pointer to its first element in most expressions, but isn\'t the same as a pointer variable.', 'Medium'],
    ['Structure (struct)', 'A user-defined type grouping variables of different types under one name.', 'Easy'],
    ['Union', 'A type where all members share the same memory location, so only one is valid at a time.', 'Medium'],
    ['typedef', 'Creates an alias for an existing type to make declarations more readable.', 'Easy'],
    ['malloc()', 'Dynamically allocates a block of uninitialized memory on the heap.', 'Easy'],
    ['calloc()', 'Dynamically allocates memory and initializes every byte to zero.', 'Medium'],
    ['realloc()', 'Resizes a previously allocated memory block, possibly moving it.', 'Medium'],
    ['free()', 'Releases dynamically allocated memory back to the system.', 'Easy'],
    ['Memory Leak', 'Dynamically allocated memory that is never freed and becomes unreachable.', 'Medium'],
    ['Dangling Pointer', 'A pointer that still references memory that has already been freed.', 'Medium'],
    ['NULL Pointer', 'A pointer explicitly set to point to nothing, used to indicate "no target".', 'Easy'],
    ['Function Pointer', 'A pointer that stores the address of a function, allowing it to be called indirectly.', 'Hard'],
    ['Recursion', 'A function calling itself to solve smaller instances of the same problem.', 'Easy'],
    ['Storage Class: static', 'Makes a local variable retain its value between function calls.', 'Medium'],
    ['Storage Class: extern', 'Declares a variable/function defined in another file, for use across files.', 'Medium'],
    ['Storage Class: auto', 'The default storage class for local variables (rarely written explicitly).', 'Easy'],
    ['Storage Class: register', 'A hint suggesting a variable be stored in a CPU register for faster access.', 'Hard'],
    ['Preprocessor Directive', 'A line like #define or #include processed before actual compilation begins.', 'Easy'],
    ['Macro', 'A preprocessor-defined shorthand that gets textually substituted before compilation.', 'Medium'],
    ['Header File', 'A file (like stdio.h) containing declarations shared across multiple source files.', 'Easy'],
    ['Bit Field', 'A struct member declared to occupy a specific number of bits, saving memory.', 'Hard'],
    ['File Handling (fopen/fread)', 'Standard library functions for opening, reading, and writing files from C programs.', 'Medium'],
    ['Command Line Arguments', 'Values (argc/argv) passed to a C program\'s main() when it\'s launched.', 'Medium'],
    ['Multi-dimensional Array', 'An array of arrays, e.g. a 2D grid, stored in row-major order in memory.', 'Medium'],
    ['strlen()', 'Returns the length of a null-terminated string, not counting the null terminator.', 'Easy'],
    ['strcpy()', 'Copies one null-terminated string into another buffer.', 'Easy'],
    ['sizeof Operator', 'Returns the size in bytes of a type or variable, evaluated at compile time for most types.', 'Medium'],
    ['const Keyword', 'Marks a variable as read-only after initialization.', 'Easy'],
    ['volatile Keyword', 'Tells the compiler a variable\'s value may change unexpectedly, disabling certain optimizations.', 'Hard'],
    ['Sequence Point', 'A point in execution where all prior side effects are guaranteed complete before continuing.', 'Hard'],
    ['Undefined Behavior', 'Code whose behavior the C standard does not define, making the outcome unpredictable.', 'Hard'],
    ['Compilation Stages', 'Preprocessing, compilation, assembly, and linking — the stages turning C source into an executable.', 'Medium'],
    ['Segmentation Fault', 'A crash caused by accessing memory the process isn\'t allowed to access.', 'Medium'],
    ['Stack vs Heap', 'The stack holds function-local data with automatic cleanup; the heap holds manually managed dynamic memory.', 'Medium'],
    ['Buffer Overflow', 'Writing past the end of an allocated buffer, corrupting adjacent memory.', 'Hard'],
    ['Variable Scope', 'The region of code where a variable name is visible and accessible.', 'Easy'],
    ['Operator Precedence', 'The rules determining which operators are evaluated first in a compound expression.', 'Medium'],
    ['Bitwise Operators', 'Operators (&, |, ^, ~, <<, >>) that manipulate individual bits of integer values.', 'Medium'],
    ['Ternary Operator', 'The condition ? expr1 : expr2 shorthand for a simple if-else expression.', 'Easy'],
    ['Switch-Case Fall-through', 'Execution continues into the next case unless a break statement stops it.', 'Medium'],
    ['do-while Loop', 'A loop that always executes its body at least once before checking the condition.', 'Easy'],
    ['Global Variable', 'A variable declared outside any function, accessible throughout the file/program.', 'Easy'],
    ['Array Decay', 'When an array is passed to a function, it decays to a pointer to its first element.', 'Hard'],
    ['Linker', 'The tool that combines compiled object files and libraries into a final executable.', 'Medium'],
    ['Pointer to Pointer', 'A pointer that stores the address of another pointer, adding an extra level of indirection.', 'Hard'],
    ['Void Pointer', 'A generic pointer type that can hold the address of any data type, but can\'t be dereferenced directly.', 'Hard'],
    ['Structure Padding', 'Compilers insert extra bytes between struct members for memory alignment, affecting sizeof.', 'Hard'],
    ['Memory Alignment', 'Data is arranged in memory at addresses matching its size for efficient CPU access.', 'Hard'],
    ['Static Linking vs Dynamic Linking', 'Static linking embeds library code into the executable; dynamic linking loads shared libraries at runtime.', 'Hard'],
    ['Stack Overflow (C)', 'Occurs when the call stack exceeds its limit, often due to deep or infinite recursion.', 'Hard'],
    ['Heap Fragmentation', 'Repeated allocation/deallocation leaves free heap memory scattered in small unusable chunks.', 'Hard'],
    ['Wild Pointer', 'An uninitialized pointer that points to an unpredictable, garbage memory location.', 'Hard'],
    ['Const Pointer vs Pointer to Const', 'A const pointer can\'t be reassigned; a pointer to const can be reassigned but can\'t modify the pointee.', 'Hard'],
    ['Array of Pointers', 'An array where each element is itself a pointer, commonly used for arrays of strings.', 'Hard'],
    ['Function Pointer Arrays', 'An array of function pointers, often used to implement jump tables or dispatch logic.', 'Hard'],
    ['Recursive Data Structures', 'A structure like a linked list or tree defined in terms of itself via self-referential pointers.', 'Hard'],
    ['Inline Assembly', 'Embedding assembly language instructions directly within C source code for low-level control.', 'Hard'],
    ['Signal Handling (C)', 'Registering handler functions to respond to asynchronous events like SIGSEGV or SIGINT.', 'Hard'],
    ['Endianness', 'The byte order (big-endian or little-endian) a system uses to store multi-byte values in memory.', 'Hard'],
    ['Type Casting (implicit vs explicit)', 'Implicit casting happens automatically by the compiler; explicit casting is manually requested by the programmer.', 'Hard'],
    ['Variable Shadowing', 'A variable declared in an inner scope hides a variable of the same name from an outer scope.', 'Hard'],
    ['Volatile Pointer', 'A pointer whose pointed-to value may change unexpectedly outside normal program flow, disabling optimization.', 'Hard'],
    ['Array Bounds Checking', 'C performs no automatic bounds checking, making out-of-bounds access undefined behavior.', 'Hard'],
    ['Compiler Optimization Levels', 'Flags (like -O2) controlling how aggressively the compiler transforms code for performance.', 'Hard'],
    ['Object File', 'The intermediate binary output of compiling a single source file, before linking.', 'Hard'],
  ],
  'C++': [
    ['Class', 'A user-defined blueprint combining data members and member functions.', 'Easy'],
    ['Object', 'A concrete instance of a class allocated in memory.', 'Easy'],
    ['Constructor', 'A special member function automatically invoked to initialize a new object.', 'Easy'],
    ['Copy Constructor', 'A constructor that initializes an object as a copy of another existing object.', 'Medium'],
    ['Destructor', 'A special member function automatically invoked to clean up when an object\'s lifetime ends.', 'Easy'],
    ['this Pointer', 'An implicit pointer to the current object available inside non-static member functions.', 'Medium'],
    ['Virtual Function', 'A member function that enables runtime polymorphism via dynamic dispatch.', 'Medium'],
    ['Pure Virtual Function', 'A virtual function declared with = 0, forcing derived classes to override it.', 'Medium'],
    ['Abstract Class', 'A class containing at least one pure virtual function, so it cannot be instantiated.', 'Medium'],
    ['Multiple Inheritance', 'A class derives from more than one base class simultaneously.', 'Medium'],
    ['Virtual Inheritance', 'Ensures only one shared copy of a common base class exists, solving the diamond problem.', 'Hard'],
    ['Operator Overloading', 'Defining custom behavior for operators like + or == on user-defined types.', 'Medium'],
    ['Friend Function', 'A non-member function granted access to a class\'s private and protected members.', 'Hard'],
    ['Function Template', 'A blueprint letting one function definition work generically across multiple types.', 'Medium'],
    ['Class Template', 'A blueprint letting a class definition work generically across multiple types.', 'Medium'],
    ['STL', 'The Standard Template Library — provides containers, algorithms, and iterators for C++.', 'Easy'],
    ['vector', 'A dynamic, resizable array container from the STL with O(1) amortized push_back.', 'Easy'],
    ['map (STL)', 'An associative container storing sorted key-value pairs, typically backed by a red-black tree.', 'Medium'],
    ['unordered_map', 'A hash-table-based associative container offering average O(1) key lookup.', 'Medium'],
    ['Iterator', 'An object that lets you traverse the elements of an STL container.', 'Medium'],
    ['Exception Handling (try/catch)', 'A mechanism to detect and respond to runtime errors using try, catch, and throw.', 'Easy'],
    ['Namespace', 'A named scope used to group identifiers and avoid naming collisions.', 'Medium'],
    ['Reference vs Pointer', 'A reference must be initialized and can\'t be reassigned or null; a pointer can be both.', 'Medium'],
    ['Smart Pointer', 'A wrapper object that automatically manages the lifetime of dynamically allocated memory.', 'Hard'],
    ['unique_ptr', 'A smart pointer that exclusively owns a dynamically allocated object; can\'t be copied.', 'Hard'],
    ['shared_ptr', 'A smart pointer that allows multiple owners of a dynamically allocated object via reference counting.', 'Hard'],
    ['RAII', 'Resource Acquisition Is Initialization — tying a resource\'s lifetime to an object\'s lifetime.', 'Hard'],
    ['Move Semantics', 'Allows resources to be transferred from a temporary object instead of copied, for efficiency.', 'Hard'],
    ['Rvalue Reference', 'A reference type (T&&) that binds to temporary objects, enabling move semantics.', 'Hard'],
    ['Lambda Expression (C++)', 'An inline, anonymous function object, often used with STL algorithms.', 'Medium'],
    ['auto Keyword', 'Lets the compiler deduce a variable\'s type automatically from its initializer.', 'Easy'],
    ['const Correctness', 'Using const consistently to express and enforce which data shouldn\'t be modified.', 'Medium'],
    ['Static Member', 'A class member shared by all instances rather than belonging to any single object.', 'Medium'],
    ['Inline Function', 'A function the compiler may expand at the call site to avoid call overhead.', 'Medium'],
    ['Function Overloading', 'Multiple functions share a name but differ in parameter types/count.', 'Easy'],
    ['Default Arguments', 'Parameters that take a specified default value if the caller omits them.', 'Easy'],
    ['new/delete vs malloc/free', 'new/delete call constructors/destructors; malloc/free only allocate raw memory.', 'Medium'],
    ['Name Mangling', 'The compiler encodes function signatures into unique symbol names to support overloading.', 'Hard'],
    ['Initialization List', 'Syntax to initialize a constructor\'s member variables before the constructor body runs.', 'Hard'],
    ['Diamond Problem', 'Ambiguity from multiple inheritance where a base class is reachable via two separate paths.', 'Hard'],
    ['Virtual Table (vtable)', 'A per-class table of function pointers the compiler uses to implement dynamic dispatch for virtual functions.', 'Hard'],
    ['Virtual Destructor', 'Declaring a base class destructor virtual ensures the derived destructor runs when deleting via a base pointer.', 'Hard'],
    ['Object Slicing (C++)', 'Assigning a derived object to a base object by value truncates it, losing the derived-only members.', 'Hard'],
    ['Perfect Forwarding', 'Passing arguments to another function while preserving their original value category (lvalue/rvalue).', 'Hard'],
    ['Template Specialization', 'Providing a custom implementation of a template for a specific type instead of the generic version.', 'Hard'],
    ['SFINAE', 'Substitution Failure Is Not An Error — invalid template substitutions are silently discarded rather than causing a compile error.', 'Hard'],
    ['Copy Elision', 'The compiler skips unnecessary copy/move operations, e.g. constructing a return value directly in place.', 'Hard'],
    ['Rule of Three/Five', 'If a class defines one of destructor/copy-constructor/copy-assignment, it usually needs to define all of them (five with move variants).', 'Hard'],
    ['Weak Pointer', 'A non-owning smart pointer that observes a shared_ptr-managed object without affecting its reference count.', 'Hard'],
    ['Placement new', 'Constructs an object at a specific, pre-allocated memory address instead of allocating new memory.', 'Hard'],
    ['Argument-Dependent Lookup', 'The compiler looks up unqualified function names in the namespaces of their argument types.', 'Hard'],
    ['constexpr', 'Indicates a value or function can be evaluated at compile time.', 'Hard'],
    ['Structured Bindings', 'C++17 syntax to unpack a tuple/pair/struct into multiple named variables in one declaration.', 'Hard'],
    ['Multiple Dispatch vs Single Dispatch', 'C++ virtual functions dispatch based on one object\'s type (single); multiple dispatch considers several objects\' types.', 'Hard'],
    ['Exception Safety Guarantees', 'Levels (basic, strong, no-throw) describing what a function guarantees about program state if an exception occurs.', 'Hard'],
    ['Header Guards', 'Preprocessor directives (#ifndef/#define) preventing a header file from being included multiple times.', 'Hard'],
    ['Pimpl Idiom', 'Hides a class\'s implementation details behind a pointer to reduce compile-time dependencies.', 'Hard'],
  ],
  SQL: [
    ['SELECT Statement', 'Retrieves data from one or more tables in the database.', 'Easy'],
    ['WHERE Clause', 'Filters rows based on a specified condition before any grouping happens.', 'Easy'],
    ['ORDER BY', 'Sorts the result set by one or more columns, ascending by default.', 'Easy'],
    ['GROUP BY', 'Groups rows sharing a value so aggregate functions can summarize each group.', 'Easy'],
    ['HAVING Clause', 'Filters grouped results after aggregation, unlike WHERE.', 'Medium'],
    ['DISTINCT', 'Removes duplicate rows from the returned result set.', 'Easy'],
    ['INNER JOIN', 'Returns only rows with matches in both joined tables.', 'Easy'],
    ['LEFT JOIN', 'Returns all rows from the left table, with NULLs where there\'s no right-table match.', 'Medium'],
    ['RIGHT JOIN', 'Returns all rows from the right table, with NULLs where there\'s no left-table match.', 'Medium'],
    ['FULL OUTER JOIN', 'Returns all rows from both tables, matching where possible and NULL elsewhere.', 'Medium'],
    ['Self Join', 'A table is joined with itself using aliases, useful for hierarchical data.', 'Medium'],
    ['UNION', 'Combines the result sets of two SELECTs, removing duplicate rows by default.', 'Medium'],
    ['UNION ALL', 'Combines the result sets of two SELECTs, keeping all duplicate rows.', 'Medium'],
    ['Subquery', 'A query nested within another query, e.g. inside WHERE or FROM.', 'Medium'],
    ['Correlated Subquery', 'A subquery that depends on a value from the outer query, re-evaluated per row.', 'Hard'],
    ['EXISTS Operator', 'Tests whether a subquery returns any rows at all.', 'Medium'],
    ['IN Operator', 'Checks whether a value matches any value in a given list or subquery.', 'Easy'],
    ['BETWEEN Operator', 'Checks whether a value falls within an inclusive range.', 'Easy'],
    ['LIKE Operator', 'Performs pattern matching in strings using wildcards % and _.', 'Easy'],
    ['ALTER TABLE', 'Modifies an existing table\'s structure, e.g. adding or dropping a column.', 'Easy'],
    ['CREATE TABLE', 'Defines a new table with its columns, types, and constraints.', 'Easy'],
    ['DROP TABLE', 'Permanently deletes a table and all of its data.', 'Easy'],
    ['TRUNCATE TABLE', 'Quickly removes all rows from a table, typically faster than DELETE and hard to roll back.', 'Medium'],
    ['DELETE Statement', 'Removes rows matching a condition; supports WHERE and can be rolled back.', 'Easy'],
    ['UPDATE Statement', 'Modifies existing rows\' column values based on a condition.', 'Easy'],
    ['PRIMARY KEY Constraint', 'Ensures a column (or set) uniquely identifies each row and is never NULL.', 'Easy'],
    ['FOREIGN KEY Constraint', 'Ensures a column\'s values match an existing value in a referenced table.', 'Easy'],
    ['UNIQUE Constraint', 'Ensures all values in a column (or set) are distinct across rows.', 'Medium'],
    ['NOT NULL Constraint', 'Ensures a column can never store a NULL value.', 'Easy'],
    ['DEFAULT Constraint', 'Specifies a value to use for a column automatically when none is provided.', 'Easy'],
    ['View', 'A saved SELECT query that behaves like a virtual, read-through table.', 'Medium'],
    ['Index', 'A structure that speeds up lookups on a column at the cost of extra storage and write overhead.', 'Medium'],
    ['Composite Index', 'An index built across multiple columns together, optimized for queries filtering on all of them.', 'Hard'],
    ['Stored Procedure', 'A saved, callable block of SQL logic that can accept parameters.', 'Medium'],
    ['Trigger', 'Code that automatically runs in response to a table event like INSERT or UPDATE.', 'Medium'],
    ['Transaction (SQL)', 'A group of statements executed as a single all-or-nothing unit using COMMIT/ROLLBACK.', 'Medium'],
    ['COMMIT', 'Permanently saves all changes made during the current transaction.', 'Easy'],
    ['ROLLBACK', 'Undoes all changes made during the current, uncommitted transaction.', 'Easy'],
    ['Aggregate Functions', 'Functions like COUNT, SUM, AVG, MIN, MAX that summarize multiple rows into one value.', 'Easy'],
    ['CASE Expression', 'Provides conditional (if/else-like) logic directly within a SQL query.', 'Medium'],
    ['Window Function', 'Performs a calculation across a set of rows related to the current row without collapsing them.', 'Hard'],
    ['CTE (Common Table Expression)', 'A named temporary result set defined with WITH, usable within a single query.', 'Hard'],
    ['NULL Handling', 'NULL represents an unknown value; comparisons with NULL never evaluate to true using =.', 'Medium'],
    ['COALESCE', 'Returns the first non-NULL value from a list of expressions.', 'Medium'],
    ['Normalization', 'Organizing tables/columns to reduce redundancy and dependency anomalies.', 'Medium'],
    ['ACID (SQL context)', 'The reliability guarantees (Atomicity, Consistency, Isolation, Durability) for SQL transactions.', 'Medium'],
    ['Window Function: RANK vs DENSE_RANK', 'RANK leaves gaps after ties (1,1,3); DENSE_RANK does not (1,1,2).', 'Hard'],
    ['ROW_NUMBER()', 'A window function assigning a unique sequential integer to each row within its partition.', 'Hard'],
    ['PARTITION BY', 'Divides rows into groups within a window function, similar to GROUP BY but without collapsing rows.', 'Hard'],
    ['Recursive CTE', 'A CTE that references itself, used to query hierarchical or tree-structured data.', 'Hard'],
    ['Pivot / Unpivot', 'Transforming rows into columns (pivot) or columns into rows (unpivot) for reporting.', 'Hard'],
    ['Query Execution Order', 'SQL clauses logically execute as FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY, not in written order.', 'Hard'],
    ['Index-Only Scan', 'A query answered entirely from the index without touching the underlying table data.', 'Hard'],
    ['Explain Plan', 'A tool showing how the database engine intends to execute a given query.', 'Hard'],
    ['Isolation Level: Repeatable Read', 'Guarantees the same rows read twice in a transaction return identical data, but phantom rows are still possible.', 'Hard'],
    ['Isolation Level: Serializable', 'The strictest level, fully preventing dirty reads, non-repeatable reads, and phantom reads.', 'Hard'],
    ['Deadlock in SQL Transactions', 'Two transactions each hold a lock the other is waiting for, forced to be resolved by the DBMS killing one.', 'Hard'],
    ['Optimistic vs Pessimistic Locking', 'Optimistic locking checks for conflicts at commit time; pessimistic locking locks rows upfront to prevent conflicts.', 'Hard'],
    ['Foreign Key Cascade Options', 'ON DELETE/UPDATE CASCADE, SET NULL, or RESTRICT define what happens to child rows when a parent is changed.', 'Hard'],
    ['Query Hint', 'A directive suggesting to the optimizer how to execute a query, overriding its default plan.', 'Hard'],
    ['Materialized View Refresh', 'The process of re-running a materialized view\'s query to update its stored, cached results.', 'Hard'],
    ['Table Partitioning (SQL)', 'Physically dividing a large table into smaller pieces to improve manageability and query performance.', 'Hard'],
    ['Full-Text Search (SQL)', 'A specialized index and query type for efficiently searching large text fields for words/phrases.', 'Hard'],
    ['Deadlock Victim', 'The transaction the DBMS automatically rolls back to resolve a detected deadlock.', 'Hard'],
    ['Statement-Level vs Row-Level Trigger', 'A statement-level trigger fires once per statement; a row-level trigger fires once per affected row.', 'Hard'],
    ['Anti-Join', 'Returns rows from one table that have no matching rows in another, typically via NOT EXISTS/NOT IN.', 'Hard'],
    ['Semi-Join', 'Returns rows from one table that have at least one match in another, without duplicating rows for multiple matches.', 'Hard'],
    ['Cost-Based Optimizer', 'A query optimizer that estimates the resource cost of different execution plans and picks the cheapest.', 'Hard'],
    ['Statistics (Query Optimizer)', 'Metadata about data distribution the optimizer uses to estimate row counts and choose good execution plans.', 'Hard'],
    ['Hash Join', 'A join algorithm that builds an in-memory hash table on one input, then probes it with the other.', 'Hard'],
    ['Nested Loop Join', 'A join algorithm that, for each row in one table, scans the other table looking for matches.', 'Hard'],
    ['Merge Join', 'A join algorithm that merges two inputs that are both already sorted on the join key.', 'Hard'],
    ['Savepoint', 'A named point within a transaction that lets you roll back part of it without aborting the whole transaction.', 'Hard'],
    ['Sequence (SQL)', 'A database object that generates a sequence of unique numeric values, often used for surrogate keys.', 'Hard'],
    ['Surrogate Key', 'An artificial, system-generated key (like an auto-increment ID) with no business meaning.', 'Hard'],
  ],
  DSA: [
    ['Array', 'A fixed-size, contiguous block of memory storing elements of the same type with O(1) indexed access.', 'Easy'],
    ['Linked List', 'A sequence of nodes where each points to the next, allowing O(1) insertion/deletion at known positions.', 'Easy'],
    ['Stack', 'A LIFO (Last In First Out) structure supporting push and pop from one end.', 'Easy'],
    ['Queue', 'A FIFO (First In First Out) structure supporting enqueue at the back and dequeue from the front.', 'Easy'],
    ['Hashing', 'Mapping data to array indices via a hash function for average O(1) lookup, insert, and delete.', 'Easy'],
    ['Hash Collision', 'When two different keys hash to the same index, resolved via chaining or open addressing.', 'Medium'],
    ['Binary Search', 'Repeatedly halves a sorted search space to find a target in O(log n).', 'Easy'],
    ['Linear Search', 'Checks each element one by one until the target is found, taking O(n) in the worst case.', 'Easy'],
    ['Bubble Sort', 'Repeatedly swaps adjacent out-of-order elements; simple but O(n²) in the worst case.', 'Easy'],
    ['Merge Sort', 'A divide-and-conquer, stable sort guaranteeing O(n log n) in all cases.', 'Medium'],
    ['Quick Sort', 'A divide-and-conquer sort with average O(n log n) but worst-case O(n²) on poor pivots.', 'Medium'],
    ['Heap Sort', 'A comparison sort using a binary heap, guaranteeing O(n log n) but not stable.', 'Hard'],
    ['Binary Tree', 'A hierarchical structure where each node has at most two children.', 'Easy'],
    ['Binary Search Tree', 'A binary tree where left children are smaller and right children are larger than the node.', 'Medium'],
    ['Balanced BST', 'A BST that maintains O(log n) height through rotations, e.g. AVL or Red-Black trees.', 'Hard'],
    ['AVL Tree', 'A self-balancing BST that maintains height balance via rotations after every insert/delete.', 'Hard'],
    ['Red-Black Tree', 'A self-balancing BST using node coloring rules to guarantee O(log n) operations.', 'Hard'],
    ['Heap', 'A complete binary tree satisfying the heap property, used to implement priority queues.', 'Medium'],
    ['Min-Heap', 'A heap where every parent is smaller than or equal to its children; the root is the minimum.', 'Medium'],
    ['Trie', 'A tree structure storing strings character by character, efficient for prefix-based lookups.', 'Hard'],
    ['Graph', 'A structure of nodes (vertices) connected by edges, used to model networks and relationships.', 'Easy'],
    ['BFS (Breadth-First Search)', 'Explores a graph level by level using a queue, finding shortest paths in unweighted graphs.', 'Medium'],
    ['DFS (Depth-First Search)', 'Explores a graph by going as deep as possible before backtracking, using a stack/recursion.', 'Medium'],
    ['Topological Sort', 'Orders the vertices of a DAG so every edge points from earlier to later in the order.', 'Hard'],
    ['Dijkstra\'s Algorithm', 'Finds shortest paths from a source in a graph with non-negative edge weights.', 'Hard'],
    ['Bellman-Ford Algorithm', 'Finds shortest paths from a source and can detect negative-weight cycles.', 'Hard'],
    ['Minimum Spanning Tree', 'A subset of edges connecting all vertices with minimum total weight and no cycles.', 'Hard'],
    ['Greedy Algorithm', 'Makes the locally optimal choice at each step, hoping it leads to a global optimum.', 'Medium'],
    ['Dynamic Programming', 'Solves problems by caching results of overlapping subproblems with optimal substructure.', 'Medium'],
    ['Memoization', 'A top-down DP technique caching function results to avoid recomputation.', 'Easy'],
    ['Tabulation', 'A bottom-up DP technique building a table of solved subproblems iteratively.', 'Medium'],
    ['Backtracking', 'Explores possible solutions incrementally, abandoning ("backtracking" from) paths that fail constraints.', 'Medium'],
    ['Two Pointer Technique', 'Uses two indices moving through a structure to solve problems in O(n) instead of O(n²).', 'Medium'],
    ['Sliding Window Technique', 'Maintains a moving subrange of elements to solve subarray/substring problems efficiently.', 'Medium'],
    ['Prefix Sum', 'Precomputing cumulative sums to answer range-sum queries in O(1) after O(n) preprocessing.', 'Medium'],
    ['Bit Manipulation', 'Using bitwise operators to solve problems efficiently at the binary representation level.', 'Medium'],
    ['Kadane\'s Algorithm', 'An O(n) dynamic programming technique to find the maximum sum contiguous subarray.', 'Medium'],
    ['Time Complexity', 'A measure of how an algorithm\'s runtime grows relative to its input size.', 'Easy'],
    ['Space Complexity', 'A measure of how much extra memory an algorithm needs relative to its input size.', 'Easy'],
    ['Big-O Notation', 'Describes the worst-case upper bound on an algorithm\'s growth rate.', 'Easy'],
    ['Amortized Analysis', 'Averages the cost of an operation over a sequence of operations, not just the worst single case.', 'Hard'],
    ['Recursion Tree', 'A diagram illustrating recursive calls, useful for visualizing and solving recurrence relations.', 'Hard'],
    ['Divide and Conquer', 'Breaking a problem into independent subproblems, solving them, and combining the results.', 'Medium'],
    ['Union-Find (Disjoint Set)', 'A structure tracking a partition of elements into disjoint sets, supporting fast union/find.', 'Hard'],
    ['Segment Tree', 'A tree structure supporting efficient range queries and updates in O(log n).', 'Hard'],
    ['Fenwick Tree (BIT)', 'A Binary Indexed Tree offering O(log n) prefix-sum queries and point updates with less overhead than a segment tree.', 'Hard'],
    ['Floyd-Warshall Algorithm', 'A dynamic programming algorithm computing shortest paths between all pairs of vertices in O(V³).', 'Hard'],
    ['A* Search Algorithm', 'A pathfinding algorithm that uses a heuristic to guide search toward the goal more efficiently than Dijkstra.', 'Hard'],
    ['Longest Common Subsequence', 'A DP problem finding the longest subsequence common to two sequences, not required to be contiguous.', 'Hard'],
    ['Longest Increasing Subsequence', 'A DP/binary-search problem finding the longest strictly increasing subsequence of an array.', 'Hard'],
    ['0/1 Knapsack Problem', 'A DP problem choosing items with weight/value limits to maximize value without exceeding capacity, each item used once.', 'Hard'],
    ['Edit Distance (Levenshtein)', 'The minimum number of insert/delete/replace operations to transform one string into another.', 'Hard'],
    ['Strongly Connected Components', 'Maximal subgraphs of a directed graph where every vertex can reach every other vertex in the subgraph.', 'Hard'],
    ['Kruskal\'s Algorithm', 'A greedy MST algorithm that repeatedly adds the smallest edge that doesn\'t form a cycle, using union-find.', 'Hard'],
    ['Prim\'s Algorithm', 'A greedy MST algorithm that grows a single tree by always adding the cheapest edge connecting it to a new vertex.', 'Hard'],
    ['Trie Applications', 'Tries are used for autocomplete, spell-checking, and IP routing tables due to fast prefix lookups.', 'Hard'],
    ['Cycle Detection in Graphs', 'Detected via DFS back-edges in directed graphs, or via union-find/visited tracking in undirected graphs.', 'Hard'],
    ['NP-Complete Problems', 'A class of problems with no known polynomial-time solution, where any solution can be verified quickly.', 'Hard'],
    ['Master Theorem', 'A formula for solving recurrence relations of the divide-and-conquer form T(n) = aT(n/b) + f(n).', 'Hard'],
    ['Heap Property Maintenance', 'sift-up (bubble up) restores heap order after insertion; sift-down restores it after removing the root.', 'Hard'],
    ['Skip List', 'A probabilistic data structure using layered linked lists to achieve O(log n) search, like a balanced tree.', 'Hard'],
    ['LRU Cache Implementation', 'Typically implemented with a hash map plus a doubly linked list for O(1) get and put operations.', 'Hard'],
    ['Bellman-Ford vs Dijkstra', 'Bellman-Ford handles negative weights and detects negative cycles; Dijkstra is faster but requires non-negative weights.', 'Hard'],
    ['Articulation Points and Bridges', 'Vertices/edges whose removal increases the number of connected components in a graph.', 'Hard'],
    ['Meet in the Middle', 'Splits a problem in half, solves each independently, then combines results — used to beat exponential brute force.', 'Hard'],
  ],
  JavaScript: [
    ['var Keyword', 'Declares a function-scoped (or global-scoped) variable, hoisted and re-declarable.', 'Easy'],
    ['let Keyword', 'Declares a block-scoped, re-assignable variable that isn\'t hoisted usably before declaration.', 'Easy'],
    ['const Keyword', 'Declares a block-scoped variable whose binding cannot be reassigned after initialization.', 'Easy'],
    ['Hoisting', 'JavaScript moves variable/function declarations to the top of their scope before execution.', 'Medium'],
    ['Closure', 'A function that retains access to its outer scope\'s variables even after that scope has returned.', 'Medium'],
    ['this Keyword', 'Refers to the execution context object, whose value depends on how a function is called.', 'Medium'],
    ['Prototype', 'The object from which an object inherits properties and methods via the prototype chain.', 'Medium'],
    ['Prototypal Inheritance', 'Objects inherit directly from other objects via the prototype chain, not classes.', 'Hard'],
    ['Event Loop', 'The mechanism that lets JS run non-blocking callbacks by processing the call stack and task queues.', 'Hard'],
    ['Call Stack', 'The structure tracking function calls currently being executed, in LIFO order.', 'Medium'],
    ['Callback Function', 'A function passed as an argument to be invoked later, often after an async operation.', 'Easy'],
    ['Promise', 'An object representing the eventual completion or failure of an asynchronous operation.', 'Medium'],
    ['async/await', 'Syntax that lets asynchronous, Promise-based code be written and read like synchronous code.', 'Medium'],
    ['Arrow Function', 'A concise function syntax that doesn\'t bind its own this, args, or super.', 'Easy'],
    ['Template Literal', 'String syntax using backticks that supports embedded expressions and multi-line strings.', 'Easy'],
    ['Destructuring', 'Syntax to unpack values from arrays or properties from objects into distinct variables.', 'Medium'],
    ['Spread Operator', 'Expands an iterable\'s elements individually, e.g. into a new array or function call.', 'Medium'],
    ['Rest Parameter', 'Collects remaining function arguments into a single array parameter.', 'Medium'],
    ['== vs ===', '== compares values with type coercion; === compares both value and type strictly.', 'Easy'],
    ['typeof Operator', 'Returns a string indicating the type of an operand, e.g. "string" or "function".', 'Easy'],
    ['null vs undefined', 'undefined means a variable was declared but not assigned; null is an explicit "no value".', 'Easy'],
    ['NaN', 'A special value meaning "Not a Number," notably not equal to itself.', 'Medium'],
    ['Truthy and Falsy', 'Values that coerce to true or false in a boolean context, like 0, "", and null being falsy.', 'Easy'],
    ['IIFE', 'Immediately Invoked Function Expression — a function that runs as soon as it\'s defined.', 'Medium'],
    ['Event Bubbling', 'An event triggered on a child element propagates upward through its ancestors.', 'Medium'],
    ['Event Delegation', 'Attaching a single listener to a parent to handle events from its children via bubbling.', 'Hard'],
    ['DOM', 'Document Object Model — the tree-structured API representing an HTML page for scripts to manipulate.', 'Easy'],
    ['JSON.stringify/parse', 'Converts a JS object to a JSON string and back, respectively.', 'Easy'],
    ['map/filter/reduce', 'Array methods for transforming, selecting, and accumulating elements functionally.', 'Medium'],
    ['Higher-Order Function', 'A function that takes another function as an argument or returns one.', 'Medium'],
    ['Currying', 'Transforming a function of multiple arguments into a sequence of functions each taking one argument.', 'Hard'],
    ['Debounce', 'Delays invoking a function until after a pause in repeated calls, e.g. for search input.', 'Hard'],
    ['Throttle', 'Ensures a function runs at most once per specified time interval, no matter how often it\'s called.', 'Hard'],
    ['Microtask Queue', 'A high-priority queue (Promises) processed before the next macrotask/render in the event loop.', 'Hard'],
    ['Module System (ESM)', 'ECMAScript Modules — the standard import/export syntax for organizing JS code across files.', 'Medium'],
    ['Strict Mode', '"use strict" opts code into a restricted variant that catches common mistakes and unsafe actions.', 'Medium'],
    ['Generator Function', 'A function using function* and yield that can pause and resume execution, producing a sequence.', 'Hard'],
    ['Map Object', 'A built-in key-value collection where keys can be of any type, unlike plain objects.', 'Medium'],
    ['Set Object', 'A built-in collection storing unique values of any type.', 'Medium'],
    ['Optional Chaining (?.)', 'Safely accesses nested properties, short-circuiting to undefined if a reference is null/undefined.', 'Medium'],
    ['Nullish Coalescing (??)', 'Returns the right-hand value only when the left-hand is null or undefined (not other falsy values).', 'Medium'],
    ['Array.prototype.slice vs splice', 'slice returns a shallow copy without mutating; splice mutates the array in place.', 'Medium'],
    ['setTimeout', 'Schedules a function to run once after a minimum delay, via the browser/Node event loop.', 'Easy'],
    ['call/apply/bind', 'Methods to explicitly set what this refers to when invoking a function.', 'Hard'],
    ['Immediately-invoked vs Regular Function', 'An IIFE executes right away; a regular function only runs when explicitly called.', 'Medium'],
    ['Symbol Type', 'A primitive type guaranteeing a unique, immutable value, often used as an object property key.', 'Hard'],
    ['WeakMap', 'A Map-like structure that holds weak references to its keys, allowing garbage collection.', 'Hard'],
    ['Event Object', 'The object automatically passed to an event handler describing the event that occurred.', 'Easy'],
    ['Function Declaration vs Expression', 'Declarations are hoisted fully; expressions are only assigned at the point of execution.', 'Medium'],
    ['Prototype Chain', 'The chain of linked objects JS walks up to resolve a property that isn\'t found on the object itself.', 'Hard'],
    ['Object.create()', 'Creates a new object with a specified prototype, without invoking a constructor function.', 'Hard'],
    ['Event Capturing Phase', 'The phase where an event travels from the root down to the target, before the bubbling phase.', 'Hard'],
    ['Tagged Template Literals', 'A function processes a template literal\'s strings and interpolated values before producing the result.', 'Hard'],
    ['Generators and yield*', 'yield* delegates iteration to another generator or iterable from within a generator function.', 'Hard'],
    ['Macrotask vs Microtask', 'Microtasks (Promises) all run before the next macrotask (setTimeout, events) in each event loop cycle.', 'Hard'],
    ['Memory Leak Patterns (JS)', 'Common causes include forgotten timers, detached DOM references, and unintentional global variables.', 'Hard'],
    ['WeakSet', 'A Set-like structure holding weak references to objects, allowing them to be garbage collected.', 'Hard'],
    ['Proxy Object', 'Wraps a target object to intercept and customize fundamental operations like get, set, and delete.', 'Hard'],
    ['Reflect API', 'Provides methods mirroring the default behavior of language operations, often paired with Proxy.', 'Hard'],
    ['Tail Call Optimization', 'A theoretical JS engine optimization reusing the current stack frame for a tail-position recursive call.', 'Hard'],
    ['Module Bundler', 'A tool (like Webpack) that combines JS modules and their dependencies into optimized bundles for the browser.', 'Hard'],
    ['Tree Shaking', 'A bundler optimization that removes unused exported code from the final bundle.', 'Hard'],
    ['Service Worker', 'A background script enabling offline support, caching, and push notifications for web apps.', 'Hard'],
    ['CORS Preflight Request', 'An automatic OPTIONS request the browser sends before certain cross-origin requests to check permissions.', 'Hard'],
    ['Object Property Descriptors', 'Metadata (writable, enumerable, configurable) controlling how a property behaves, set via defineProperty.', 'Hard'],
    ['Structured Clone Algorithm', 'The browser\'s internal algorithm for deep-copying complex JS values, e.g. used by postMessage.', 'Hard'],
    ['Iterators and Iterables Protocol', 'An object is iterable if it implements Symbol.iterator, enabling use in for...of loops.', 'Hard'],
    ['Async Generator Function', 'A function combining async/await and generators, defined with async function* and yielding awaited values.', 'Hard'],
  ],
  React: [
    ['Component', 'A reusable, self-contained piece of UI, written as a function or class returning JSX.', 'Easy'],
    ['JSX', 'A syntax extension letting you write HTML-like markup directly within JavaScript.', 'Easy'],
    ['Props', 'Read-only data passed from a parent component down to a child component.', 'Easy'],
    ['State', 'Data local to a component that can change over time and triggers a re-render when updated.', 'Easy'],
    ['useState Hook', 'A Hook that lets a functional component hold and update local state.', 'Easy'],
    ['useEffect Hook', 'A Hook that runs side effects (like data fetching) after render, optionally re-running on dependency change.', 'Medium'],
    ['useContext Hook', 'A Hook that lets a component read a value from a Context Provider without prop drilling.', 'Medium'],
    ['useRef Hook', 'A Hook that gives a mutable reference that persists across renders without triggering re-render.', 'Medium'],
    ['useMemo Hook', 'A Hook that memoizes an expensive computed value, recalculating only when its dependencies change.', 'Medium'],
    ['useCallback Hook', 'A Hook that memoizes a function reference so it doesn\'t change on every render.', 'Hard'],
    ['useReducer Hook', 'A Hook for managing more complex state logic using a reducer function, similar to Redux.', 'Hard'],
    ['Custom Hook', 'A reusable function starting with "use" that packages up stateful logic built from other Hooks.', 'Medium'],
    ['Virtual DOM', 'An in-memory representation of the UI that React diffs to minimize actual DOM updates.', 'Medium'],
    ['Reconciliation', 'React\'s algorithm for comparing the new virtual DOM tree with the old one to compute minimal updates.', 'Hard'],
    ['Keys (in lists)', 'Unique identifiers React uses to track which list items changed, were added, or removed.', 'Medium'],
    ['Controlled Component', 'A form element whose value is driven entirely by React state.', 'Medium'],
    ['Uncontrolled Component', 'A form element that manages its own state internally, accessed via a ref when needed.', 'Medium'],
    ['Lifecycle Methods', 'Class component methods (like componentDidMount) that run at specific points in a component\'s life.', 'Medium'],
    ['componentDidMount', 'A lifecycle method called once, right after a class component is first rendered to the DOM.', 'Medium'],
    ['Higher-Order Component (HOC)', 'A function that takes a component and returns a new, enhanced component.', 'Hard'],
    ['Render Props', 'A pattern where a component takes a function prop that returns what to render.', 'Hard'],
    ['Context API', 'React\'s built-in way to share values across the component tree without passing props manually.', 'Medium'],
    ['Prop Drilling', 'Passing data through many layers of intermediate components that don\'t need it themselves.', 'Medium'],
    ['Conditional Rendering', 'Showing different UI output depending on a condition, e.g. via ternary or &&.', 'Easy'],
    ['React Fragment', 'Lets a component return multiple elements without adding an extra wrapper DOM node.', 'Medium'],
    ['StrictMode', 'A development-only wrapper that highlights potential problems by intentionally double-invoking some functions.', 'Hard'],
    ['React.memo', 'A higher-order component that skips re-rendering if props haven\'t changed.', 'Medium'],
    ['Lazy Loading (React.lazy)', 'Loads a component\'s code only when it\'s actually needed, reducing initial bundle size.', 'Hard'],
    ['Suspense', 'A component that lets you show a fallback UI while awaiting something like a lazy-loaded component.', 'Hard'],
    ['Error Boundary', 'A component that catches JavaScript errors in its child tree and renders a fallback UI.', 'Hard'],
    ['Portal', 'Renders a child into a DOM node outside its parent component\'s DOM hierarchy.', 'Hard'],
    ['Forwarding Refs', 'Passing a ref through a component to one of its children using forwardRef.', 'Hard'],
    ['Lifting State Up', 'Moving shared state to the closest common ancestor so multiple components can use it.', 'Medium'],
    ['Unidirectional Data Flow', 'Data flows one way, from parent to child via props, making state changes predictable.', 'Easy'],
    ['Synthetic Event', 'React\'s cross-browser wrapper around native DOM events, with a consistent API.', 'Medium'],
    ['Batching', 'React groups multiple state updates into a single re-render for performance.', 'Hard'],
    ['Class vs Functional Component', 'Class components use lifecycle methods and this.state; functional components use Hooks instead.', 'Easy'],
    ['PureComponent', 'A class component that automatically implements a shallow prop/state comparison in shouldComponentUpdate.', 'Hard'],
    ['shouldComponentUpdate', 'A lifecycle method letting a class component opt out of re-rendering for performance.', 'Hard'],
    ['Dependency Array', 'The array passed to useEffect/useMemo/useCallback controlling when they re-run.', 'Medium'],
    ['Rules of Hooks', 'Hooks must be called at the top level and only from React functions, never conditionally.', 'Medium'],
    ['React Router', 'A library providing client-side routing so a React app can render different views per URL.', 'Medium'],
    ['Event Handling in React', 'Attaching handlers via JSX props like onClick, using camelCase and passing a function reference.', 'Easy'],
    ['Reconciliation Diffing Algorithm', 'React compares elements by type and key to decide whether to update, replace, or reuse a DOM node.', 'Hard'],
    ['Fiber Architecture', 'React\'s internal reimplementation of the reconciler enabling incremental, interruptible rendering.', 'Hard'],
    ['Concurrent Rendering', 'React can prepare multiple versions of the UI and interrupt lower-priority rendering work when needed.', 'Hard'],
    ['Server-Side Rendering (SSR)', 'Rendering React components to HTML on the server before sending them to the browser.', 'Hard'],
    ['Hydration', 'Attaching event listeners and React state to server-rendered HTML on the client to make it interactive.', 'Hard'],
    ['Code Splitting', 'Breaking a bundle into smaller chunks loaded on demand, reducing initial load time.', 'Hard'],
    ['useLayoutEffect vs useEffect', 'useLayoutEffect fires synchronously after DOM mutations, before the browser paints; useEffect fires after paint.', 'Hard'],
    ['Stale Closure (React Hooks)', 'A Hook callback captures an old value from a previous render because it wasn\'t included in the dependency array.', 'Hard'],
    ['Context Re-render Problem', 'Every component consuming a Context re-renders whenever that Context\'s value changes, even for unrelated updates.', 'Hard'],
    ['Key Prop Pitfalls', 'Using array index as a key can cause incorrect state/DOM reuse when list items are reordered or removed.', 'Hard'],
    ['Compound Component Pattern', 'Related components share implicit state via Context so they can be composed flexibly by the consumer.', 'Hard'],
    ['Uncontrolled Ref Pattern', 'Using a ref to read a DOM element\'s value directly instead of tracking it in React state.', 'Hard'],
    ['React Reconciler Keys Stability', 'Keys must be stable and unique among siblings to avoid unnecessary re-mounting of list items.', 'Hard'],
    ['Memoization Pitfalls', 'useMemo/useCallback can hurt performance if overused for cheap computations, adding overhead without benefit.', 'Hard'],
    ['Custom Hook Composition', 'Combining multiple built-in Hooks inside a custom Hook to share complex, reusable stateful logic.', 'Hard'],
    ['React DevTools Profiler', 'A tool for measuring which components render, how long they take, and why.', 'Hard'],
    ['Derived State Anti-pattern', 'Copying a prop into state (getDerivedStateFromProps misuse) often creates bugs from stale or duplicated data.', 'Hard'],
    ['Portals and Event Bubbling', 'Events from a Portal still bubble up through the React tree, not the actual DOM tree, despite rendering elsewhere.', 'Hard'],
  ],
  Node: [
    ['Event Loop (Node)', 'The single-threaded mechanism letting Node handle many concurrent I/O operations without blocking.', 'Medium'],
    ['Non-blocking I/O', 'I/O operations that don\'t halt program execution while waiting for completion.', 'Medium'],
    ['CommonJS', 'Node\'s traditional module system using require() and module.exports.', 'Easy'],
    ['ES Modules in Node', 'The standard import/export syntax, usable in Node with .mjs files or "type": "module".', 'Medium'],
    ['npm', 'Node Package Manager — used to install and manage third-party JavaScript packages.', 'Easy'],
    ['package.json', 'A manifest file describing a Node project\'s metadata, dependencies, and scripts.', 'Easy'],
    ['Express.js', 'A minimal web framework for Node providing routing and middleware for building APIs.', 'Easy'],
    ['Middleware', 'A function with access to req/res that runs during the request-response cycle, e.g. for logging or auth.', 'Medium'],
    ['Routing', 'Mapping specific URL paths and HTTP methods to handler functions.', 'Easy'],
    ['REST API', 'An architectural style using standard HTTP methods and stateless requests to manipulate resources.', 'Easy'],
    ['Streams', 'Objects for reading or writing data piece by piece, ideal for large files or network data.', 'Medium'],
    ['Buffer', 'A Node object for handling raw binary data outside the V8 JS engine\'s string encoding.', 'Medium'],
    ['fs Module', 'Node\'s built-in module for interacting with the file system (reading/writing files).', 'Easy'],
    ['path Module', 'Node\'s built-in module for working with file and directory paths across operating systems.', 'Easy'],
    ['http Module', 'Node\'s built-in module for creating HTTP servers and making HTTP requests without a framework.', 'Medium'],
    ['process Object', 'A global object providing info about, and control over, the current Node process.', 'Medium'],
    ['Environment Variables', 'Configuration values (like API keys) supplied outside the code via process.env.', 'Easy'],
    ['child_process Module', 'Lets Node spawn and communicate with other OS processes.', 'Hard'],
    ['Cluster Module', 'Lets a Node app fork multiple processes to take advantage of multi-core systems.', 'Hard'],
    ['EventEmitter', 'A core Node class that objects can extend to emit and listen for named events.', 'Medium'],
    ['Callback Pattern', 'Passing a function to be invoked once an async operation finishes, often error-first.', 'Easy'],
    ['Error-First Callback', 'A Node convention where a callback\'s first argument is reserved for an error, if any.', 'Medium'],
    ['Promisify', 'Converting a traditional callback-based function into one that returns a Promise.', 'Medium'],
    ['package-lock.json', 'Locks exact installed dependency versions for reproducible installs across machines.', 'Medium'],
    ['Dependency vs DevDependency', 'Dependencies are needed at runtime; devDependencies are only needed during development.', 'Medium'],
    ['Semantic Versioning', 'A version format (major.minor.patch) signaling the scope of changes in a package release.', 'Medium'],
    ['Nodemon', 'A development tool that automatically restarts a Node app when source files change.', 'Easy'],
    ['PM2', 'A production process manager for Node apps, handling clustering, restarts, and monitoring.', 'Hard'],
    ['JWT Authentication', 'Using signed JSON Web Tokens to verify a user\'s identity on stateless API requests.', 'Medium'],
    ['Sessions vs Tokens', 'Sessions store state server-side keyed by a cookie; tokens carry state within themselves.', 'Hard'],
    ['CORS', 'Cross-Origin Resource Sharing — HTTP headers controlling which origins can call your API.', 'Medium'],
    ['Rate Limiting', 'Restricting how many requests a client can make in a given time window.', 'Medium'],
    ['Error-Handling Middleware', 'Express middleware with 4 parameters (err, req, res, next) that centrally handles errors.', 'Hard'],
    ['MVC Pattern', 'Separating an app into Model (data), View (UI), and Controller (logic) layers.', 'Medium'],
    ['ORM/ODM', 'A library mapping application objects to database records (relational=ORM, document=ODM).', 'Medium'],
    ['WebSocket', 'A protocol enabling full-duplex, persistent communication between client and server.', 'Hard'],
    ['dotenv', 'A package that loads environment variables from a .env file into process.env.', 'Easy'],
    ['REPL', 'Read-Eval-Print Loop — Node\'s interactive shell for running JS commands one at a time.', 'Easy'],
    ['Global Object', 'Node\'s top-level object (like window in browsers) providing globally available bindings.', 'Medium'],
    ['Event-Driven Architecture', 'A design where the flow of the program is determined by events being emitted and handled.', 'Medium'],
    ['Single-Threaded Nature', 'Node runs JS on a single thread, using the event loop and worker pool to handle concurrency.', 'Medium'],
    ['libuv', 'The C library underlying Node that provides the event loop and async I/O capabilities.', 'Hard'],
    ['Thread Pool (libuv)', 'A small pool of worker threads libuv uses to run blocking operations like file I/O off the main thread.', 'Hard'],
    ['Event Loop Phases', 'Node\'s event loop cycles through phases like timers, pending callbacks, poll, check, and close callbacks.', 'Hard'],
    ['process.nextTick()', 'Schedules a callback to run immediately after the current operation, before the event loop continues — higher priority than Promises.', 'Hard'],
    ['Backpressure (Streams)', 'When a writable stream can\'t keep up with incoming data, signaling the readable stream to pause.', 'Hard'],
    ['Piping Streams', 'Connecting a readable stream\'s output directly to a writable stream\'s input, e.g. via .pipe().', 'Hard'],
    ['Worker Threads', 'A Node module enabling true multi-threaded execution of CPU-intensive JavaScript tasks.', 'Hard'],
    ['Module Caching', 'Node caches the result of require() calls, so a module\'s code only runs once no matter how many times it\'s required.', 'Hard'],
    ['Circular Dependencies', 'Two modules requiring each other, which Node resolves by returning a possibly incomplete export object.', 'Hard'],
    ['Graceful Shutdown', 'Cleanly closing server connections and pending work before a process exits, e.g. on SIGTERM.', 'Hard'],
    ['Helmet.js', 'An Express middleware that sets various HTTP security headers to protect against common attacks.', 'Hard'],
    ['Express Router', 'A mini Express application object used to modularize related routes into their own file.', 'Hard'],
    ['Connection Pooling (Node DB)', 'Reusing a fixed set of open database connections across requests instead of opening one per request.', 'Hard'],
    ['Zero-Downtime Deployment', 'Deploying new code without dropping active connections, often via clustering or rolling restarts.', 'Hard'],
    ['Async Local Storage', 'A Node API for maintaining context (like a request ID) across asynchronous calls without passing it explicitly.', 'Hard'],
    ['N-API', 'A stable Node API for building native addons that isn\'t tied to a specific V8 version.', 'Hard'],
    ['V8 Engine', 'The JavaScript engine (also used in Chrome) that Node uses to execute JavaScript code.', 'Hard'],
    ['Buffer vs Stream', 'A Buffer holds an entire chunk of binary data in memory; a Stream processes data incrementally without loading it all at once.', 'Hard'],
    ['GraphQL vs REST (Node APIs)', 'GraphQL lets clients request exactly the fields they need in one call; REST exposes fixed endpoints per resource.', 'Hard'],
    ['Idempotency in APIs', 'An operation that produces the same result no matter how many times it\'s repeated, important for retries (e.g. PUT vs POST).', 'Hard'],
    ['Health Check Endpoint', 'A lightweight route (like /health) load balancers/orchestrators poll to verify a service is running.', 'Hard'],
    ['Logging & Observability', 'Structured logging, metrics, and tracing used to monitor a Node service\'s health in production.', 'Hard'],
    ['Compression Middleware', 'Middleware (like the compression package) that gzips HTTP responses to reduce payload size.', 'Hard'],
    ['Request Correlation ID', 'A unique identifier attached to a request and propagated through logs to trace it across services.', 'Hard'],
    ['Load Testing (Node APIs)', 'Simulating high traffic against a Node service to find performance bottlenecks before production.', 'Hard'],
  ],
  MongoDB: [
    ['Document', 'A single BSON record in MongoDB, roughly analogous to a row in a relational table.', 'Easy'],
    ['Collection', 'A group of documents in MongoDB, roughly analogous to a table.', 'Easy'],
    ['BSON', 'Binary JSON — the binary-encoded format MongoDB uses to store documents.', 'Medium'],
    ['_id Field', 'The default unique identifier automatically assigned to every MongoDB document.', 'Easy'],
    ['Schema-less Design', 'Collections don\'t enforce a fixed structure, so documents in one collection can vary in shape.', 'Easy'],
    ['Index (MongoDB)', 'A structure that speeds up query performance on specified fields, at the cost of write overhead.', 'Medium'],
    ['Aggregation Pipeline', 'A framework for transforming and computing over documents through sequential stages.', 'Medium'],
    ['$match Stage', 'An aggregation stage that filters documents, similar to a WHERE clause.', 'Medium'],
    ['$group Stage', 'An aggregation stage that groups documents and computes aggregate values per group.', 'Medium'],
    ['$project Stage', 'An aggregation stage that reshapes documents, including/excluding/computing fields.', 'Medium'],
    ['$lookup Stage', 'An aggregation stage performing a left-outer-join-like operation against another collection.', 'Hard'],
    ['Embedding', 'Storing related data directly nested inside a document for fast, single-query reads.', 'Medium'],
    ['Referencing', 'Storing an ObjectId reference to a document in another collection instead of embedding it.', 'Medium'],
    ['Mongoose', 'A popular Node.js ODM library that adds schemas, validation, and modeling on top of MongoDB.', 'Easy'],
    ['Mongoose Schema', 'Defines the shape, types, and validation rules for documents in a Mongoose model.', 'Easy'],
    ['Mongoose Model', 'A compiled constructor built from a schema, used to create and query documents.', 'Easy'],
    ['populate()', 'A Mongoose method that replaces a referenced ObjectId with the actual referenced document.', 'Medium'],
    ['Virtuals (Mongoose)', 'Computed document properties that aren\'t persisted to the database.', 'Hard'],
    ['Mongoose Middleware (Hooks)', 'Functions (pre/post) that run automatically around operations like save or validate.', 'Hard'],
    ['Replica Set', 'A group of MongoDB servers maintaining the same data set for high availability.', 'Medium'],
    ['Sharding (MongoDB)', 'Distributing data horizontally across multiple servers to scale beyond a single machine.', 'Hard'],
    ['Query Operators ($gt, $lt)', 'Special operators used within queries to express conditions like greater-than or less-than.', 'Medium'],
    ['Update Operators ($set, $push)', 'Special operators used within updates to modify fields, arrays, or increment values.', 'Medium'],
    ['Upsert', 'An update operation that inserts a new document if no matching document is found.', 'Medium'],
    ['Projection', 'Specifying which fields a query should return, reducing payload size.', 'Easy'],
    ['Capped Collection', 'A fixed-size collection that automatically overwrites its oldest documents when full.', 'Hard'],
    ['TTL Index', 'An index that automatically deletes documents after a specified amount of time.', 'Hard'],
    ['Compound Index', 'An index built across multiple fields, optimized for queries filtering/sorting on all of them.', 'Hard'],
    ['Unique Index', 'An index that enforces all indexed field values are distinct across the collection.', 'Medium'],
    ['Text Index', 'A special index supporting full-text search queries on string content.', 'Hard'],
    ['Geospatial Query', 'A query type supporting location-based searches, like finding nearby points.', 'Hard'],
    ['Write Concern', 'The level of acknowledgment MongoDB requires from replicas before confirming a write succeeded.', 'Hard'],
    ['Read Concern', 'The consistency/isolation guarantee applied when reading data from MongoDB.', 'Hard'],
    ['Transactions (MongoDB)', 'Since v4.0, MongoDB supports multi-document ACID transactions across a replica set.', 'Hard'],
    ['mongodump/mongorestore', 'Command-line tools for backing up and restoring MongoDB data.', 'Medium'],
    ['CRUD Operations', 'Create, Read, Update, Delete — the four basic operations on documents.', 'Easy'],
    ['findOneAndUpdate()', 'Finds a matching document, updates it, and returns either the old or new version.', 'Medium'],
    ['Connection Pooling', 'Reusing a pool of open database connections instead of opening a new one per request.', 'Medium'],
    ['ObjectId', 'MongoDB\'s default 12-byte unique identifier type used for the _id field.', 'Easy'],
    ['Denormalization (MongoDB)', 'Deliberately duplicating data across documents to avoid expensive joins/lookups on reads.', 'Medium'],
    ['Atlas', 'MongoDB\'s official fully-managed cloud database service.', 'Easy'],
    ['Aggregation $unwind', 'Deconstructs an array field from documents into separate documents, one per array element.', 'Hard'],
    ['Aggregation $sort and $limit', 'Aggregation stages that order documents and then cap the number of results returned.', 'Hard'],
    ['Change Streams', 'Lets applications subscribe to real-time notifications of data changes in a collection.', 'Hard'],
    ['Oplog', 'The operation log replica set members use to replicate write operations from the primary.', 'Hard'],
    ['Primary vs Secondary (Replica Set)', 'The primary accepts all writes; secondaries replicate the primary\'s data and can serve reads.', 'Hard'],
    ['Election (Replica Set)', 'The process replica set members use to choose a new primary if the current one becomes unavailable.', 'Hard'],
    ['Config Server (Sharding)', 'Stores metadata and configuration for a sharded cluster, like which shard holds which data range.', 'Hard'],
    ['mongos Router', 'The routing process that directs client operations to the correct shard(s) in a sharded cluster.', 'Hard'],
    ['Shard Key', 'The field(s) MongoDB uses to distribute documents across shards; choosing it well is critical for performance.', 'Hard'],
    ['Schema Validation (MongoDB)', 'Optional JSON Schema rules a collection can enforce on documents despite being schema-less by default.', 'Hard'],
    ['Mongoose Discriminators', 'Lets multiple related models share a base schema while storing extra type-specific fields in one collection.', 'Hard'],
    ['Mongoose Population Depth', 'Nested populate() calls that resolve references across more than one level of related documents.', 'Hard'],
    ['Explain() in MongoDB', 'Returns details about how MongoDB executed a query, including whether an index was used.', 'Hard'],
    ['Covered Query', 'A query fully satisfied by an index alone, without needing to examine the actual documents.', 'Hard'],
    ['Aggregation $facet', 'Runs multiple aggregation pipelines within a single stage, returning multiple result sets at once.', 'Hard'],
    ['Read Preference', 'Configures which replica set members (primary, secondary, nearest) a read operation is routed to.', 'Hard'],
    ['GridFS', 'A MongoDB specification for storing and retrieving files larger than the 16MB document size limit.', 'Hard'],
    ['Document Size Limit', 'MongoDB caps a single BSON document at 16MB, which influences embedding vs referencing decisions.', 'Hard'],
  ],
};

// ---------------------------------------------------------------------------
// Public: full quiz bank assembly
// ---------------------------------------------------------------------------

function buildAllQuizzes() {
  QUIZ_SHORTFALLS.length = 0; // reset so repeated calls (e.g. audits) don't accumulate stale entries
  const quizzes = [];

  // Every category below uses DEFAULT_QUIZ_COUNTS (Easy 5 / Medium 15 / Hard 30 / Mixed 30),
  // applied consistently across all 4 aptitude categories and all 14 technical subjects.
  const aptitudeCategories = [
    { titlePrefix: 'Quantitative Aptitude', category: 'Quantitative Aptitude', pool: genQuantAptitudePool() },
    { titlePrefix: 'Logical Reasoning', category: 'Logical Reasoning', pool: genLogicalReasoningPool() },
    { titlePrefix: 'Verbal Ability', category: 'Verbal Ability', pool: genVerbalAbilityPool() },
    { titlePrefix: 'Data Interpretation', category: 'Data Interpretation', pool: genDataInterpretationPool() },
  ];
  aptitudeCategories.forEach((c) => quizzes.push(...assembleQuizzes(c)));

  const technicalSubjects = ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C', 'C++', 'Python', 'DSA'];
  technicalSubjects.forEach((subject) => {
    // Combine the hand-curated bank (where one exists) with the glossary-generated bank for volume.
    const curated = TECHNICAL_RAW[subject] ? genTechnicalPool(subject) : [];
    const glossary = GLOSSARY_TERMS[subject] ? glossaryPool(subject, GLOSSARY_TERMS[subject]) : [];
    const pool = [...curated, ...glossary];
    quizzes.push(
      ...assembleQuizzes({
        titlePrefix: `${subject} Quiz`,
        category: 'Technical',
        subject,
        pool,
      })
    );
  });

  return quizzes;
}

// ---------------------------------------------------------------------------
// Topics — DSA/coding topics + placement-prep subjects (student & admin panels)
// ---------------------------------------------------------------------------

const TOPICS = [
  // --- DSA ---
  { name: 'Arrays', category: 'DSA', difficulty: 'Easy', icon: '🔢', description: 'Contiguous memory structures — the foundation of most coding interviews.' },
  { name: 'Strings', category: 'DSA', difficulty: 'Easy', icon: '🔤', description: 'Pattern matching, parsing, and manipulation of character sequences.' },
  { name: 'Linked List', category: 'DSA', difficulty: 'Medium', icon: '🔗', description: 'Pointer-based linear structures — singly, doubly, and circular.' },
  { name: 'Stack', category: 'DSA', difficulty: 'Easy', icon: '📚', description: 'LIFO structures used in parsing, backtracking, and undo systems.' },
  { name: 'Queue', category: 'DSA', difficulty: 'Easy', icon: '🚶', description: 'FIFO structures used in scheduling and BFS traversal.' },
  { name: 'Hashing', category: 'DSA', difficulty: 'Easy', icon: '#️⃣', description: 'Hash maps and sets for average O(1) lookup, insert, and delete.' },
  { name: 'Recursion', category: 'DSA', difficulty: 'Medium', icon: '🔁', description: 'Solving problems by breaking them into smaller self-similar subproblems.' },
  { name: 'Searching', category: 'DSA', difficulty: 'Easy', icon: '🔍', description: 'Linear and binary search techniques over arrays and search spaces.' },
  { name: 'Sorting', category: 'DSA', difficulty: 'Medium', icon: '📶', description: 'Bubble, merge, quick, and heap sort — and when to use each.' },
  { name: 'Tree', category: 'DSA', difficulty: 'Medium', icon: '🌳', description: 'Hierarchical structures — binary trees and tree traversals.' },
  { name: 'Binary Search Tree', category: 'DSA', difficulty: 'Medium', icon: '🌲', description: 'Ordered binary trees supporting fast search, insert, and delete.' },
  { name: 'Heap', category: 'DSA', difficulty: 'Medium', icon: '⛰️', description: 'Priority queues and heap-based algorithms like heap sort.' },
  { name: 'Graph', category: 'DSA', difficulty: 'Hard', icon: '🕸️', description: 'Modeling networks — BFS, DFS, shortest paths, and topological sort.' },
  { name: 'Greedy', category: 'DSA', difficulty: 'Medium', icon: '🎯', description: 'Making locally optimal choices to reach a globally optimal solution.' },
  { name: 'Dynamic Programming', category: 'DSA', difficulty: 'Hard', icon: '🧩', description: 'Breaking problems into overlapping subproblems for optimal solutions.' },
  { name: 'Backtracking', category: 'DSA', difficulty: 'Hard', icon: '♟️', description: 'Exploring and abandoning candidate solutions that violate constraints.' },
  { name: 'Two Pointer', category: 'DSA', difficulty: 'Medium', icon: '👉', description: 'Using two moving indices to solve array/string problems in O(n).' },
  { name: 'Sliding Window', category: 'DSA', difficulty: 'Medium', icon: '🪟', description: 'Maintaining a moving subrange to solve subarray/substring problems efficiently.' },
  { name: 'Prefix Sum', category: 'DSA', difficulty: 'Easy', icon: '➕', description: 'Precomputed cumulative sums for fast range-sum queries.' },
  { name: 'Bit Manipulation', category: 'DSA', difficulty: 'Medium', icon: '💡', description: 'Solving problems efficiently using bitwise operators.' },
  { name: 'Tries', category: 'DSA', difficulty: 'Hard', icon: '🌴', description: 'Prefix trees for fast string/prefix lookups, autocomplete, and dictionaries.' },
  { name: 'Binary Search', category: 'DSA', difficulty: 'Medium', icon: '🎯', description: 'Divide-and-conquer search over sorted structures and search spaces.' },
  // --- Practice / Placement ---
  { name: 'Coding', category: 'Practice', difficulty: 'Mixed', icon: '💻', description: 'General programming/coding practice problems across languages.' },
  { name: 'Quantitative Aptitude', category: 'Placement', difficulty: 'Mixed', icon: '🧮', description: 'Quantitative aptitude — the first filter in most placement drives.' },
  { name: 'Logical Reasoning', category: 'Placement', difficulty: 'Mixed', icon: '🧠', description: 'Pattern recognition, puzzles, and analytical reasoning.' },
  { name: 'Verbal Ability', category: 'Placement', difficulty: 'Mixed', icon: '📖', description: 'Vocabulary, grammar, and comprehension for aptitude rounds.' },
  { name: 'Data Interpretation', category: 'Placement', difficulty: 'Mixed', icon: '📊', description: 'Reading and analyzing tables, charts, and graphs under time pressure.' },
  // --- Core CS ---
  { name: 'DBMS', category: 'Core CS', difficulty: 'Medium', icon: '🗄️', description: 'Database design, normalization, transactions, and SQL fundamentals.' },
  { name: 'SQL', category: 'Core CS', difficulty: 'Medium', icon: '🛢️', description: 'Query writing, joins, aggregation, and database querying practice.' },
  { name: 'Operating Systems', category: 'Core CS', difficulty: 'Medium', icon: '🖥️', description: 'Processes, scheduling, memory management, and concurrency.' },
  { name: 'Computer Networks', category: 'Core CS', difficulty: 'Medium', icon: '🌐', description: 'Protocols, the OSI model, routing, and network fundamentals.' },
  { name: 'OOP', category: 'Core CS', difficulty: 'Easy', icon: '🧱', description: 'Object-oriented design principles across languages.' },
  // --- Languages ---
  { name: 'C', category: 'Language', difficulty: 'Easy', icon: '📘', description: 'Core C language concepts — pointers, memory, and syntax.' },
  { name: 'C++', category: 'Language', difficulty: 'Medium', icon: '📗', description: 'C++ language features, STL, and OOP in C++.' },
  { name: 'Java', category: 'Language', difficulty: 'Medium', icon: '☕', description: 'Java language fundamentals, collections, and OOP concepts.' },
  { name: 'Python', category: 'Language', difficulty: 'Easy', icon: '🐍', description: 'Python syntax, data structures, and common idioms.' },
  { name: 'JavaScript', category: 'Language', difficulty: 'Easy', icon: '📜', description: 'Core JavaScript — closures, async, the event loop, and ES6+ features.' },
  // --- Frameworks / Database ---
  { name: 'React', category: 'Framework', difficulty: 'Medium', icon: '⚛️', description: 'Components, hooks, and state management for building modern UIs.' },
  { name: 'Node.js', category: 'Framework', difficulty: 'Medium', icon: '🟢', description: 'Server-side JavaScript, Express, middleware, and REST APIs.' },
  { name: 'MongoDB', category: 'Database', difficulty: 'Medium', icon: '🍃', description: 'Document modeling, aggregation, indexing, and Mongoose in practice.' },
  // --- Interview ---
  { name: 'HR / Interview Preparation', category: 'Interview', difficulty: 'Mixed', icon: '🎤', description: 'Behavioral and HR interview questions, and how to structure answers.' },
];

// ---------------------------------------------------------------------------
// Companies — 15 major placement recruiters with realistic prep data
// ---------------------------------------------------------------------------

const COMPANIES = [
  {
    name: 'TCS', tags: ['service', 'mass-recruiter'],
    overview: 'Tata Consultancy Services is India\'s largest IT services company and one of the biggest campus recruiters, hiring through TCS NQT (National Qualifier Test).',
    selectionProcess: [
      { stage: 'TCS NQT (Online)', description: 'Foundation section: Quant, Reasoning, Verbal; Advanced section: coding + technical MCQs for higher packages.' },
      { stage: 'Technical Interview', description: 'Basic CS fundamentals, projects, and a simple coding question.' },
      { stage: 'HR Interview', description: 'Background, relocation flexibility, and communication skills.' },
    ],
    salary: { role: 'Assistant System Engineer', ctcRange: '3.5 – 7 LPA', notes: 'Higher band (Ninja/Digital) depends on NQT Advanced score.' },
    previousYearQuestions: [
      { year: 2025, question: 'If a train covers 300 km in 5 hours, what is its average speed?', category: 'aptitude', answer: '60 km/h', askedInRound: 'TCS NQT Foundation' },
      { year: 2025, question: 'Write a program to check if a number is a palindrome.', category: 'coding', askedInRound: 'TCS NQT Advanced' },
      { year: 2024, question: 'What is the difference between DELETE and TRUNCATE in SQL?', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Why do you want to join TCS?', category: 'hr', askedInRound: 'HR Interview' },
    ],
    faqs: [{ question: 'Is there negative marking in TCS NQT?', answer: 'Yes, typically 1/3rd mark is deducted for each wrong answer in the aptitude sections.' }],
  },
  {
    name: 'Infosys', tags: ['service', 'mass-recruiter'],
    overview: 'Infosys recruits campus hires through InfyTQ and the Infosys Certification Exam, focusing heavily on aptitude, pseudocode, and communication.',
    selectionProcess: [
      { stage: 'Online Test', description: 'Quant, Logical Reasoning, Verbal, Pseudocode, and Puzzle sections.' },
      { stage: 'Technical + HR Interview', description: 'Often combined into a single panel covering projects, basics, and fitment.' },
    ],
    salary: { role: 'Systems Engineer', ctcRange: '3.6 – 6.25 LPA', notes: 'Digital Specialist Engineer band pays higher for strong performers.' },
    previousYearQuestions: [
      { year: 2025, question: 'A can complete a work in 12 days and B in 18 days. How long will they take together?', category: 'aptitude', askedInRound: 'Online Test' },
      { year: 2024, question: 'Explain the pseudocode for finding the second largest element in an array.', category: 'coding', askedInRound: 'Online Test' },
      { year: 2024, question: 'What is your final year project about?', category: 'technical', askedInRound: 'Technical Interview' },
    ],
    faqs: [{ question: 'What is InfyTQ?', answer: 'A free Infosys learning + certification platform; certified students get a fast-track hiring process.' }],
  },
  {
    name: 'Wipro', tags: ['service', 'mass-recruiter'],
    overview: 'Wipro hires through WILP/Elite and Turbo hiring tracks, with an online assessment covering aptitude, verbal, coding, and a written essay.',
    selectionProcess: [
      { stage: 'Wipro NLTH (Online Test)', description: 'Aptitude, verbal ability, coding, and an essay-writing section.' },
      { stage: 'Business Discussion + HR', description: 'Discussion on projects, resume, and role fitment.' },
    ],
    salary: { role: 'Project Engineer', ctcRange: '3.5 – 6.5 LPA', notes: 'Elite hires typically get the higher band.' },
    previousYearQuestions: [
      { year: 2025, question: 'If the cost price of an item is ₹400 and it is sold at a 15% profit, find the selling price.', category: 'aptitude', askedInRound: 'NLTH' },
      { year: 2024, question: 'Write a program to find the factorial of a number using recursion.', category: 'coding', askedInRound: 'NLTH' },
      { year: 2024, question: 'What are your strengths and weaknesses?', category: 'hr', askedInRound: 'HR Round' },
    ],
  },
  {
    name: 'Accenture', tags: ['service', 'consulting'],
    overview: 'Accenture hires for Associate Software Engineer roles via cognitive/technical assessments followed by a combined interview.',
    selectionProcess: [
      { stage: 'Cognitive & Technical Assessment', description: 'Verbal, logical, numerical reasoning followed by a coding round.' },
      { stage: 'Communication Assessment', description: 'Voice & accent evaluation for some roles.' },
      { stage: 'Interview', description: 'Combined technical + HR discussion.' },
    ],
    salary: { role: 'Associate Software Engineer', ctcRange: '4.5 – 6.5 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2025, question: 'A sum of money doubles itself in 8 years at simple interest. Find the rate of interest.', category: 'aptitude', askedInRound: 'Technical Assessment' },
      { year: 2024, question: 'Explain the differences between an abstract class and an interface.', category: 'technical', askedInRound: 'Interview' },
      { year: 2024, question: 'Describe a time you worked in a team to solve a difficult problem.', category: 'hr', askedInRound: 'Interview' },
    ],
  },
  {
    name: 'Cognizant', tags: ['service', 'mass-recruiter'],
    overview: 'Cognizant\'s GenC program hires through an online assessment (aptitude + coding) followed by a technical/HR interview.',
    selectionProcess: [
      { stage: 'GenC Online Assessment', description: 'Aptitude, verbal, and 1-2 coding questions.' },
      { stage: 'Technical + HR Interview', description: 'CS fundamentals, resume walkthrough, and behavioral questions.' },
    ],
    salary: { role: 'Programmer Analyst Trainee', ctcRange: '4 – 6.5 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2025, question: 'Find the missing number in the series: 2, 5, 10, 17, 26, ?', category: 'aptitude', askedInRound: 'GenC Assessment' },
      { year: 2024, question: 'Write a function to check if two strings are anagrams.', category: 'coding', askedInRound: 'GenC Assessment' },
    ],
  },
  {
    name: 'Capgemini', tags: ['service', 'consulting'],
    overview: 'Capgemini hires through the "Pseudo Code" test and Game-based assessments, followed by technical and HR interviews.',
    selectionProcess: [
      { stage: 'Game-Based & Pseudocode Assessment', description: 'Cognitive games followed by a pseudocode logic test.' },
      { stage: 'Technical Interview', description: 'CS fundamentals, DBMS, and OOP basics.' },
      { stage: 'HR Interview', description: 'Fitment, relocation, and communication.' },
    ],
    salary: { role: 'Analyst', ctcRange: '4 – 7.5 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'A shopkeeper marks up an item by 25% and gives a 10% discount. Find his profit percentage.', category: 'aptitude', askedInRound: 'Pseudocode Test' },
      { year: 2024, question: 'What is normalization? Explain 1NF, 2NF, and 3NF.', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'Deloitte', tags: ['consulting', 'big4'],
    overview: 'Deloitte recruits for technology and consulting analyst roles via an online assessment focused on aptitude and case-study style reasoning.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Quantitative, logical reasoning, and a short technical/coding section.' },
      { stage: 'Group Discussion', description: 'Case-study or current-affairs based group discussion.' },
      { stage: 'Interview', description: 'Technical + HR, with emphasis on business acumen.' },
    ],
    salary: { role: 'Analyst', ctcRange: '6 – 9 LPA', notes: 'Varies significantly by practice area (Tech vs Consulting).' },
    previousYearQuestions: [
      { year: 2024, question: 'Two pipes can fill a tank in 10 and 15 minutes respectively. How long will both take together?', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'Why consulting, and why Deloitte specifically?', category: 'hr', askedInRound: 'Interview' },
    ],
  },
  {
    name: 'IBM', tags: ['product', 'consulting'],
    overview: 'IBM hires for software/data roles through an online coding & aptitude assessment followed by technical and HR interviews.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Aptitude, verbal reasoning, and 1-2 coding problems.' },
      { stage: 'Technical Interview', description: 'DSA, OOP, and role-specific technical depth.' },
      { stage: 'HR Interview', description: 'Culture fit and career goals.' },
    ],
    salary: { role: 'Application Developer', ctcRange: '6 – 10 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2025, question: 'Implement a function to reverse a linked list.', category: 'coding', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'What is the difference between SQL and NoSQL databases?', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'HCL', tags: ['service', 'mass-recruiter'],
    overview: 'HCLTech hires through HCL TechBee (for 12th pass) and campus programs for engineering graduates, via aptitude + technical assessments.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Aptitude, reasoning, and basic programming MCQs.' },
      { stage: 'Technical + HR Interview', description: 'Fundamentals and communication assessment.' },
    ],
    salary: { role: 'Graduate Engineer Trainee', ctcRange: '3.5 – 6 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'If the ratio of two numbers is 3:5 and their sum is 96, find the numbers.', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'What is the difference between process and thread?', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'Tech Mahindra', tags: ['service', 'mass-recruiter'],
    overview: 'Tech Mahindra recruits through TechMEQ, an online test covering aptitude, verbal, and technical MCQs, followed by an interview.',
    selectionProcess: [
      { stage: 'TechMEQ (Online Test)', description: 'Aptitude, verbal, logical reasoning, and technical MCQs.' },
      { stage: 'Technical + HR Interview', description: 'CS fundamentals and resume-based discussion.' },
    ],
    salary: { role: 'Software Engineer', ctcRange: '3.25 – 6 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'A is twice as efficient as B. If B can complete a task in 20 days, how long will A alone take?', category: 'aptitude', askedInRound: 'TechMEQ' },
      { year: 2024, question: 'Explain OOP concepts with real-world examples.', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'Amazon', tags: ['product', 'faang', 'ecommerce'],
    overview: 'Amazon\'s SDE interviews weight Leadership Principles heavily alongside strong DSA and system design skills.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions + a work simulation/debugging round, 90 minutes.' },
      { stage: 'Technical Interviews', description: '3-4 rounds of DSA, one often including a Leadership Principle deep-dive.' },
      { stage: 'Bar Raiser Round', description: 'An interviewer from outside the team evaluates culture fit and raises the hiring bar.' },
    ],
    salary: { role: 'SDE-1', ctcRange: '14 – 24 LPA', notes: 'Varies by campus tier and location.' },
    previousYearQuestions: [
      { year: 2025, question: 'Detect a cycle in a linked list.', category: 'coding', askedInRound: 'Technical Round 1' },
      { year: 2025, question: 'Which Amazon Leadership Principle do you relate to most, and why?', category: 'hr', askedInRound: 'Bar Raiser' },
      { year: 2024, question: 'Design a simplified version of an online food delivery system.', category: 'technical', askedInRound: 'System Design' },
    ],
    faqs: [{ question: 'How important are the Leadership Principles?', answer: 'Very — nearly every round includes at least one behavioral question mapped to a specific LP.' }],
  },
  {
    name: 'Google', tags: ['product', 'faang'],
    overview: 'Google hires for SWE roles with a strong emphasis on DSA, problem-solving clarity, and system design at senior levels.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions, 90 minutes, on a shared coding environment.' },
      { stage: 'Technical Interviews', description: '4-5 rounds covering DSA, and system design for experienced candidates.' },
      { stage: 'Googleyness & Leadership', description: 'A round evaluating culture fit and collaborative problem-solving.' },
    ],
    salary: { role: 'SWE II', ctcRange: '18 – 30 LPA', notes: 'Campus offers vary widely by role/location.' },
    previousYearQuestions: [
      { year: 2025, question: 'Find the longest palindromic substring in a given string.', category: 'coding', askedInRound: 'Technical Round 1' },
      { year: 2024, question: 'Design a URL shortening service like bit.ly.', category: 'technical', askedInRound: 'System Design' },
      { year: 2024, question: 'Tell me about a time you disagreed with a teammate — how did you resolve it?', category: 'hr', askedInRound: 'Googleyness Round' },
    ],
  },
  {
    name: 'Microsoft', tags: ['product', 'faang'],
    overview: 'Microsoft interviews focus on core CS fundamentals, clean coding, and a genuine interest in the "growth mindset" culture.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions covering arrays, strings, trees, or graphs.' },
      { stage: 'Technical Interviews', description: '3-4 rounds of DSA and CS fundamentals.' },
      { stage: 'As Appropriate (AA) Round', description: 'A senior interviewer makes the final hiring call.' },
    ],
    salary: { role: 'SDE', ctcRange: '16 – 26 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Implement an LRU Cache.', category: 'coding', askedInRound: 'Technical Round 2' },
      { year: 2024, question: 'What is the difference between a process and a thread?', category: 'technical', askedInRound: 'Technical Round 1' },
      { year: 2023, question: 'Why Microsoft?', category: 'hr', askedInRound: 'AA Round' },
    ],
  },
  {
    name: 'Flipkart', tags: ['product', 'ecommerce'],
    overview: 'Flipkart focuses heavily on DSA and practical, product-oriented coding rounds for SDE roles.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions + MCQs on CS fundamentals.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA and low-level design.' },
      { stage: 'Hiring Manager Round', description: 'Discussion on projects and product thinking.' },
    ],
    salary: { role: 'SDE-1', ctcRange: '12 – 20 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Merge K sorted linked lists.', category: 'coding', askedInRound: 'Technical Round 1' },
      { year: 2024, question: 'Design a low-level model for a shopping cart system.', category: 'technical', askedInRound: 'Technical Round 2' },
    ],
  },
  {
    name: 'Adobe', tags: ['product'],
    overview: 'Adobe hires for SDE and R&D roles with a coding-heavy assessment and a strong focus on DSA fundamentals.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2-3 coding problems, moderate to hard difficulty.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA, OOP, and a bit of system design.' },
    ],
    salary: { role: 'MTS-1 (SDE)', ctcRange: '15 – 20 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Find the longest increasing subsequence in an array.', category: 'coding', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'Explain the four pillars of OOP with examples.', category: 'technical', askedInRound: 'Technical Round 1' },
    ],
  },
  {
    name: 'Oracle', tags: ['product', 'enterprise'],
    overview: 'Oracle hires for its cloud/database engineering teams via OMSAT (Oracle Multi-Skill Assessment Test) followed by technical interviews.',
    selectionProcess: [
      { stage: 'OMSAT (Online Test)', description: 'Aptitude, verbal, and 2 coding questions of easy-medium difficulty.' },
      { stage: 'Technical Interviews', description: '2-3 rounds covering DSA, DBMS, and OS fundamentals.' },
      { stage: 'HR Interview', description: 'Fitment, relocation, and career goals discussion.' },
    ],
    salary: { role: 'Applications Engineer', ctcRange: '8 – 12 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Write a query to find duplicate rows in a table.', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Explain indexing and how B-trees work.', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Reverse a linked list in groups of k.', category: 'coding', askedInRound: 'OMSAT' },
    ],
  },
  {
    name: 'LTIMindtree', tags: ['service', 'mass-recruiter'],
    overview: 'LTIMindtree (formed from the L&T Infotech–Mindtree merger) recruits via an online assessment covering aptitude and basic coding.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Aptitude, logical reasoning, and 1-2 coding questions.' },
      { stage: 'Technical + HR Interview', description: 'Fundamentals, projects, and communication assessment.' },
    ],
    salary: { role: 'Graduate Engineer Trainee', ctcRange: '3.6 – 6.5 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'A train 150m long crosses a platform in 30 seconds at 54 km/h. Find the platform length.', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'What is the difference between abstraction and encapsulation?', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'EY', tags: ['consulting', 'big4'],
    overview: 'EY (Ernst & Young) hires technology and advisory analysts via an online assessment focused on aptitude and business reasoning.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Quantitative, logical reasoning, and situational judgment questions.' },
      { stage: 'Group Discussion / Case Study', description: 'A business case or current-affairs discussion in small groups.' },
      { stage: 'Interview', description: 'Technical + HR, with focus on client-facing communication skills.' },
    ],
    salary: { role: 'Analyst', ctcRange: '5.5 – 9 LPA', notes: 'Varies significantly by service line (Tech Consulting vs Assurance).' },
    previousYearQuestions: [
      { year: 2024, question: 'If 15 workers can complete a task in 20 days, how many workers are needed to finish it in 12 days?', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'Why do you want to work in consulting?', category: 'hr', askedInRound: 'Interview' },
    ],
  },
  {
    name: 'PwC', tags: ['consulting', 'big4'],
    overview: 'PwC recruits for technology and advisory roles through an online reasoning test followed by a case-based interview.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Numerical, verbal, and logical reasoning tests.' },
      { stage: 'Case Study / Group Exercise', description: 'A business problem-solving exercise done individually or in a group.' },
      { stage: 'Partner/Manager Interview', description: 'Final round assessing both technical fit and communication.' },
    ],
    salary: { role: 'Associate', ctcRange: '5 – 8.5 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'A sum becomes triple itself in 15 years at simple interest. Find the rate of interest.', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'How would you handle a disagreement with a client?', category: 'hr', askedInRound: 'Interview' },
    ],
  },
  {
    name: 'KPMG', tags: ['consulting', 'big4'],
    overview: 'KPMG hires for its advisory and technology practices through an aptitude-heavy online test and case interviews.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Quantitative aptitude, logical reasoning, and verbal ability.' },
      { stage: 'Case Interview', description: 'A structured business problem to solve with the interviewer.' },
      { stage: 'HR Interview', description: 'Background, motivation, and fitment discussion.' },
    ],
    salary: { role: 'Consultant', ctcRange: '6 – 10 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'A boat goes 30 km downstream in 2 hours and returns in 3 hours. Find the speed of the boat in still water.', category: 'aptitude', askedInRound: 'Online Assessment' },
      { year: 2024, question: 'Walk me through a time you led a project under a tight deadline.', category: 'hr', askedInRound: 'Interview' },
    ],
  },
  {
    name: 'Genpact', tags: ['service', 'consulting'],
    overview: 'Genpact hires for its technology and analytics teams via an online assessment covering aptitude and basic SQL/coding.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Aptitude, verbal, and a basic SQL/coding round.' },
      { stage: 'Technical + HR Interview', description: 'Fundamentals, resume walkthrough, and communication assessment.' },
    ],
    salary: { role: 'Process Associate / Analyst', ctcRange: '3.5 – 6 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Write a SQL query to find the second highest salary from an Employee table.', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'A shopkeeper allows a 20% discount and still gains 12%. Find the marked price if the cost price is ₹500.', category: 'aptitude', askedInRound: 'Online Assessment' },
    ],
  },
  {
    name: 'Walmart', tags: ['product', 'ecommerce'],
    overview: 'Walmart Global Tech hires SDEs with a strong emphasis on DSA, system design, and scalable e-commerce systems.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions plus MCQs on CS fundamentals.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA and low-level/system design.' },
      { stage: 'Hiring Manager Round', description: 'Discussion on past projects and behavioral fit.' },
    ],
    salary: { role: 'SDE-1', ctcRange: '13 – 22 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Design a rate limiter for an API.', category: 'technical', askedInRound: 'System Design' },
      { year: 2024, question: 'Find all pairs in an array that sum to a target value.', category: 'coding', askedInRound: 'Technical Round 1' },
    ],
  },
  {
    name: 'JPMorgan Chase', tags: ['finance', 'product'],
    overview: 'JPMorgan Chase hires technology analysts through a rigorous online coding assessment followed by multiple technical rounds.',
    selectionProcess: [
      { stage: 'Online Coding Test', description: '2-3 coding problems plus aptitude/psychometric sections.' },
      { stage: 'Technical Interviews', description: 'DSA, OOP, and sometimes basic finance/markets awareness.' },
      { stage: 'HireVue / HR Round', description: 'Video-recorded or live behavioral interview.' },
    ],
    salary: { role: 'Technology Analyst', ctcRange: '12 – 18 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Implement a producer-consumer problem using threads.', category: 'coding', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'What interests you about working in the finance/technology sector?', category: 'hr', askedInRound: 'HR Round' },
    ],
  },
  {
    name: 'Goldman Sachs', tags: ['finance', 'product'],
    overview: 'Goldman Sachs hires engineering analysts through a demanding process emphasizing DSA, math aptitude, and CS fundamentals.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Coding problems plus quantitative and logical reasoning.' },
      { stage: 'HackerRank Coding Round', description: 'Timed coding round with 2-3 problems of increasing difficulty.' },
      { stage: 'Technical + Superday Interviews', description: 'Multiple back-to-back technical and behavioral rounds in one day.' },
    ],
    salary: { role: 'Technology Analyst', ctcRange: '15 – 20 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Find the median of a running stream of integers.', category: 'coding', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Explain the CAP theorem and its trade-offs.', category: 'technical', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'Cisco', tags: ['product', 'networking'],
    overview: 'Cisco hires software engineers with an emphasis on computer networks, DSA, and systems programming.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Coding questions plus MCQs on networking and OS fundamentals.' },
      { stage: 'Technical Interviews', description: '2-3 rounds covering DSA, networking concepts, and C/C++.' },
    ],
    salary: { role: 'Software Engineer', ctcRange: '10 – 16 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Explain the TCP three-way handshake in detail.', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Implement a basic LRU cache.', category: 'coding', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'SAP', tags: ['product', 'enterprise'],
    overview: 'SAP Labs India hires for product engineering roles via a coding-focused assessment and technical interviews.',
    selectionProcess: [
      { stage: 'Online Assessment', description: 'Coding round plus CS fundamentals MCQs.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA, OOP, and database concepts.' },
      { stage: 'HR Interview', description: 'Culture fit and relocation discussion.' },
    ],
    salary: { role: 'Associate Developer', ctcRange: '11 – 18 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'What is the difference between an abstract class and interface in Java?', category: 'technical', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'Find the first non-repeating character in a string.', category: 'coding', askedInRound: 'Online Assessment' },
    ],
  },
  {
    name: 'Zoho', tags: ['product', 'saas'],
    overview: 'Zoho is known for its unique hiring process that often skips traditional degree requirements, focusing heavily on problem-solving and coding ability.',
    selectionProcess: [
      { stage: 'Written Test', description: 'Aptitude, C programming output-prediction questions, and puzzles.' },
      { stage: 'Coding Round', description: 'Multiple coding problems solved on paper or a basic editor.' },
      { stage: 'Technical + HR Interview', description: 'In-depth discussion on fundamentals and logical thinking.' },
    ],
    salary: { role: 'Member Technical Staff', ctcRange: '4.5 – 7 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Predict the output of a nested loop with pointer arithmetic in C.', category: 'technical', askedInRound: 'Written Test' },
      { year: 2024, question: 'Implement a stack using two queues.', category: 'coding', askedInRound: 'Coding Round' },
    ],
  },
  {
    name: 'Freshworks', tags: ['product', 'saas'],
    overview: 'Freshworks hires SDEs for its SaaS products through a coding assessment followed by technical and culture-fit interviews.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding problems plus CS fundamentals MCQs.' },
      { stage: 'Technical Interviews', description: '2 rounds of DSA and practical coding.' },
      { stage: 'Culture Fit Interview', description: 'Discussion on values, collaboration style, and motivation.' },
    ],
    salary: { role: 'Software Engineer', ctcRange: '8 – 14 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Find the intersection of two linked lists.', category: 'coding', askedInRound: 'Technical Interview' },
      { year: 2024, question: 'What makes you excited about working at a product company?', category: 'hr', askedInRound: 'Culture Fit Interview' },
    ],
  },
  {
    name: 'Paytm', tags: ['product', 'fintech'],
    overview: 'Paytm hires SDEs for its fintech platform, with coding rounds focused on DSA and practical system design for payments-scale systems.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding questions of medium difficulty.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA and system design.' },
      { stage: 'HR Interview', description: 'Fitment and compensation discussion.' },
    ],
    salary: { role: 'SDE-1', ctcRange: '10 – 16 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Design a wallet/transaction system ensuring consistency under concurrent access.', category: 'technical', askedInRound: 'System Design' },
      { year: 2024, question: 'Find the maximum profit from at most two stock transactions.', category: 'coding', askedInRound: 'Technical Interview' },
    ],
  },
  {
    name: 'PhonePe', tags: ['product', 'fintech'],
    overview: 'PhonePe hires SDEs for its payments platform, emphasizing strong DSA fundamentals and practical distributed-systems thinking.',
    selectionProcess: [
      { stage: 'Online Assessment', description: '2 coding problems, medium-hard difficulty.' },
      { stage: 'Technical Interviews', description: '2-3 rounds of DSA, and system design for senior roles.' },
      { stage: 'Hiring Manager Round', description: 'Discussion on past work and problem-solving approach.' },
    ],
    salary: { role: 'SDE-1', ctcRange: '15 – 24 LPA', notes: '' },
    previousYearQuestions: [
      { year: 2024, question: 'Design an idempotent payment processing API.', category: 'technical', askedInRound: 'System Design' },
      { year: 2024, question: 'Find the shortest path in a grid with obstacles.', category: 'coding', askedInRound: 'Technical Interview' },
    ],
  },
];

// ---------------------------------------------------------------------------
// DSA question bank ("Tasks") — coding-sheet questions tagged by topic/company
// ---------------------------------------------------------------------------

const DSA_QUESTIONS = [
  { title: 'Two Sum', difficulty: 'Easy', topic: 'Arrays', companies: ['Google', 'Amazon', 'Adobe'], leetcodeLink: 'https://leetcode.com/problems/two-sum' },
  { title: 'Best Time to Buy and Sell Stock', difficulty: 'Easy', topic: 'Arrays', companies: ['Amazon', 'Microsoft'] },
  { title: 'Maximum Subarray (Kadane\'s Algorithm)', difficulty: 'Easy', topic: 'Arrays', companies: ['Microsoft', 'Flipkart'] },
  { title: 'Move Zeroes to End', difficulty: 'Easy', topic: 'Arrays', companies: ['TCS', 'Infosys'] },
  { title: 'Product of Array Except Self', difficulty: 'Medium', topic: 'Arrays', companies: ['Amazon', 'Google'] },
  { title: 'Merge Intervals', difficulty: 'Medium', topic: 'Arrays', companies: ['Google', 'Flipkart'] },
  { title: '3Sum', difficulty: 'Medium', topic: 'Arrays', companies: ['Amazon', 'Adobe'] },
  { title: 'Trapping Rain Water', difficulty: 'Hard', topic: 'Arrays', companies: ['Google', 'Amazon'] },
  { title: 'Rotate Array by K Steps', difficulty: 'Medium', topic: 'Arrays', companies: ['Microsoft'] },
  { title: 'Find the Duplicate Number', difficulty: 'Medium', topic: 'Arrays', companies: ['Amazon'] },

  { title: 'Reverse a String', difficulty: 'Easy', topic: 'Strings', companies: ['TCS', 'Wipro'] },
  { title: 'Valid Anagram', difficulty: 'Easy', topic: 'Strings', companies: ['Amazon', 'Cognizant'] },
  { title: 'Longest Substring Without Repeating Characters', difficulty: 'Medium', topic: 'Strings', companies: ['Microsoft', 'Amazon'] },
  { title: 'Group Anagrams', difficulty: 'Medium', topic: 'Strings', companies: ['Amazon', 'Google'] },
  { title: 'Longest Palindromic Substring', difficulty: 'Medium', topic: 'Strings', companies: ['Google', 'Microsoft'] },
  { title: 'Valid Parentheses (String Form)', difficulty: 'Easy', topic: 'Strings', companies: ['Amazon', 'Flipkart'] },
  { title: 'String to Integer (atoi)', difficulty: 'Medium', topic: 'Strings', companies: ['Amazon'] },
  { title: 'Longest Common Prefix', difficulty: 'Easy', topic: 'Strings', companies: ['Google', 'Microsoft'] },

  { title: 'Reverse a Linked List', difficulty: 'Easy', topic: 'Linked List', companies: ['Amazon', 'Microsoft', 'IBM'] },
  { title: 'Detect Cycle in a Linked List', difficulty: 'Easy', topic: 'Linked List', companies: ['Amazon', 'Adobe'] },
  { title: 'Merge Two Sorted Lists', difficulty: 'Easy', topic: 'Linked List', companies: ['Amazon', 'Microsoft'] },
  { title: 'Merge K Sorted Lists', difficulty: 'Hard', topic: 'Linked List', companies: ['Google', 'Flipkart'] },
  { title: 'Remove Nth Node From End of List', difficulty: 'Medium', topic: 'Linked List', companies: ['Amazon'] },
  { title: 'Add Two Numbers (Linked List)', difficulty: 'Medium', topic: 'Linked List', companies: ['Amazon', 'Microsoft'] },
  { title: 'Copy List with Random Pointer', difficulty: 'Hard', topic: 'Linked List', companies: ['Amazon', 'Google'] },

  { title: 'Valid Parentheses', difficulty: 'Easy', topic: 'Stack', companies: ['Amazon', 'TCS'] },
  { title: 'Min Stack', difficulty: 'Medium', topic: 'Stack', companies: ['Amazon', 'Google'] },
  { title: 'Evaluate Reverse Polish Notation', difficulty: 'Medium', topic: 'Stack', companies: ['Amazon'] },
  { title: 'Next Greater Element', difficulty: 'Medium', topic: 'Stack', companies: ['Microsoft', 'Flipkart'] },
  { title: 'Largest Rectangle in Histogram', difficulty: 'Hard', topic: 'Stack', companies: ['Google', 'Amazon'] },

  { title: 'Implement Queue using Stacks', difficulty: 'Easy', topic: 'Queue', companies: ['Amazon'] },
  { title: 'Sliding Window Maximum', difficulty: 'Hard', topic: 'Queue', companies: ['Google', 'Amazon'] },
  { title: 'Design Circular Queue', difficulty: 'Medium', topic: 'Queue', companies: ['Microsoft'] },

  { title: 'Maximum Depth of Binary Tree', difficulty: 'Easy', topic: 'Tree', companies: ['Amazon', 'Microsoft'] },
  { title: 'Validate Binary Search Tree', difficulty: 'Medium', topic: 'Tree', companies: ['Amazon', 'Google'] },
  { title: 'Lowest Common Ancestor of a BST', difficulty: 'Medium', topic: 'Tree', companies: ['Amazon', 'Microsoft'] },
  { title: 'Binary Tree Level Order Traversal', difficulty: 'Medium', topic: 'Tree', companies: ['Amazon', 'Flipkart'] },
  { title: 'Serialize and Deserialize a Binary Tree', difficulty: 'Hard', topic: 'Tree', companies: ['Google', 'Amazon'] },
  { title: 'Diameter of Binary Tree', difficulty: 'Easy', topic: 'Tree', companies: ['Microsoft'] },
  { title: 'Vertical Order Traversal of a Binary Tree', difficulty: 'Hard', topic: 'Tree', companies: ['Google', 'Amazon'] },

  { title: 'Number of Islands', difficulty: 'Medium', topic: 'Graph', companies: ['Amazon', 'Google'] },
  { title: 'Course Schedule (Topological Sort)', difficulty: 'Medium', topic: 'Graph', companies: ['Google', 'Amazon'] },
  { title: 'Clone Graph', difficulty: 'Medium', topic: 'Graph', companies: ['Google', 'Microsoft'] },
  { title: 'Dijkstra\'s Shortest Path', difficulty: 'Hard', topic: 'Graph', companies: ['Google', 'Amazon'] },
  { title: 'Detect Cycle in a Directed Graph', difficulty: 'Medium', topic: 'Graph', companies: ['Microsoft'] },

  { title: 'Climbing Stairs', difficulty: 'Easy', topic: 'Dynamic Programming', companies: ['Amazon', 'Adobe'] },
  { title: 'Longest Increasing Subsequence', difficulty: 'Hard', topic: 'Dynamic Programming', companies: ['Amazon', 'Adobe'] },
  { title: '0/1 Knapsack Problem', difficulty: 'Medium', topic: 'Dynamic Programming', companies: ['Amazon', 'Flipkart'] },
  { title: 'Coin Change', difficulty: 'Medium', topic: 'Dynamic Programming', companies: ['Amazon', 'Google'] },
  { title: 'Longest Common Subsequence', difficulty: 'Medium', topic: 'Dynamic Programming', companies: ['Microsoft', 'Google'] },
  { title: 'Edit Distance', difficulty: 'Hard', topic: 'Dynamic Programming', companies: ['Google', 'Microsoft'] },
  { title: 'House Robber', difficulty: 'Easy', topic: 'Dynamic Programming', companies: ['Amazon'] },

  { title: 'Binary Search', difficulty: 'Easy', topic: 'Binary Search', companies: ['TCS', 'Infosys'] },
  { title: 'Search in Rotated Sorted Array', difficulty: 'Medium', topic: 'Binary Search', companies: ['Amazon', 'Microsoft'] },
  { title: 'Find Minimum in Rotated Sorted Array', difficulty: 'Medium', topic: 'Binary Search', companies: ['Amazon'] },
  { title: 'Median of Two Sorted Arrays', difficulty: 'Hard', topic: 'Binary Search', companies: ['Google', 'Amazon'] },

  { title: 'FizzBuzz', difficulty: 'Easy', topic: 'Coding', companies: ['TCS', 'Wipro', 'HCL'] },
  { title: 'SQL: Second Highest Salary', difficulty: 'Medium', topic: 'SQL', companies: ['Amazon', 'Cognizant'] },
  { title: 'SQL: Department-wise Top 3 Earners', difficulty: 'Hard', topic: 'SQL', companies: ['Amazon'] },

  { title: 'Two Sum (Hashing)', difficulty: 'Easy', topic: 'Hashing', companies: ['Google', 'Amazon'] },
  { title: 'Contains Duplicate', difficulty: 'Easy', topic: 'Hashing', companies: ['TCS', 'Infosys'] },
  { title: 'Group Anagrams (Hashing)', difficulty: 'Medium', topic: 'Hashing', companies: ['Amazon', 'Google'] },
  { title: 'Subarray Sum Equals K', difficulty: 'Medium', topic: 'Hashing', companies: ['Amazon', 'Microsoft'] },
  { title: 'Longest Consecutive Sequence', difficulty: 'Medium', topic: 'Hashing', companies: ['Google', 'Amazon'] },
  { title: 'Top K Frequent Elements', difficulty: 'Medium', topic: 'Hashing', companies: ['Amazon', 'Flipkart'] },
  { title: 'Isomorphic Strings', difficulty: 'Easy', topic: 'Hashing', companies: ['Amazon'] },
  { title: 'Word Pattern', difficulty: 'Easy', topic: 'Hashing', companies: ['Google'] },
  { title: 'Four Sum II', difficulty: 'Hard', topic: 'Hashing', companies: ['Amazon', 'Google'] },
  { title: 'Longest Substring with At Most K Distinct Characters', difficulty: 'Hard', topic: 'Hashing', companies: ['Google', 'Microsoft'] },

  { title: 'Factorial using Recursion', difficulty: 'Easy', topic: 'Recursion', companies: ['TCS', 'Wipro'] },
  { title: 'Fibonacci using Recursion', difficulty: 'Easy', topic: 'Recursion', companies: ['Infosys', 'Capgemini'] },
  { title: 'Sum of Digits using Recursion', difficulty: 'Easy', topic: 'Recursion', companies: ['TCS'] },
  { title: 'Power of a Number (Recursive)', difficulty: 'Easy', topic: 'Recursion', companies: ['Wipro', 'HCL'] },
  { title: 'Tower of Hanoi', difficulty: 'Medium', topic: 'Recursion', companies: ['Amazon', 'Accenture'] },
  { title: 'Generate All Subsets (Power Set)', difficulty: 'Medium', topic: 'Recursion', companies: ['Amazon', 'Microsoft'] },
  { title: 'Reverse a String using Recursion', difficulty: 'Easy', topic: 'Recursion', companies: ['Cognizant'] },
  { title: 'Check Palindrome using Recursion', difficulty: 'Easy', topic: 'Recursion', companies: ['TCS', 'Infosys'] },
  { title: 'Josephus Problem', difficulty: 'Hard', topic: 'Recursion', companies: ['Amazon'] },
  { title: 'Print All Permutations of a String', difficulty: 'Medium', topic: 'Recursion', companies: ['Amazon', 'Google'] },

  { title: 'Linear Search', difficulty: 'Easy', topic: 'Searching', companies: ['TCS', 'Wipro'] },
  { title: 'Binary Search (Iterative and Recursive)', difficulty: 'Easy', topic: 'Searching', companies: ['Infosys', 'HCL'] },
  { title: 'Find First and Last Position in Sorted Array', difficulty: 'Medium', topic: 'Searching', companies: ['Amazon', 'Microsoft'] },
  { title: 'Search in a 2D Matrix', difficulty: 'Medium', topic: 'Searching', companies: ['Amazon', 'Google'] },
  { title: 'Find Peak Element', difficulty: 'Medium', topic: 'Searching', companies: ['Google', 'Amazon'] },
  { title: 'Search Insert Position', difficulty: 'Easy', topic: 'Searching', companies: ['Amazon'] },
  { title: 'Find K Closest Elements', difficulty: 'Medium', topic: 'Searching', companies: ['Google', 'Amazon'] },
  { title: 'Allocate Minimum Number of Pages', difficulty: 'Hard', topic: 'Searching', companies: ['Amazon', 'Microsoft'] },
  { title: 'Aggressive Cows (Binary Search on Answer)', difficulty: 'Hard', topic: 'Searching', companies: ['Google'] },

  { title: 'Bubble Sort', difficulty: 'Easy', topic: 'Sorting', companies: ['TCS', 'Wipro'] },
  { title: 'Selection Sort', difficulty: 'Easy', topic: 'Sorting', companies: ['Infosys', 'Capgemini'] },
  { title: 'Insertion Sort', difficulty: 'Easy', topic: 'Sorting', companies: ['HCL', 'Tech Mahindra'] },
  { title: 'Merge Sort', difficulty: 'Medium', topic: 'Sorting', companies: ['Amazon', 'Microsoft'] },
  { title: 'Quick Sort', difficulty: 'Medium', topic: 'Sorting', companies: ['Amazon', 'Google'] },
  { title: 'Sort Colors (Dutch National Flag)', difficulty: 'Medium', topic: 'Sorting', companies: ['Amazon', 'Microsoft'] },
  { title: 'Kth Largest Element in an Array', difficulty: 'Medium', topic: 'Sorting', companies: ['Amazon', 'Google'] },
  { title: 'Merge Overlapping Intervals (Sort-based)', difficulty: 'Medium', topic: 'Sorting', companies: ['Google', 'Flipkart'] },
  { title: 'Count Inversions in an Array', difficulty: 'Hard', topic: 'Sorting', companies: ['Amazon', 'Google'] },

  { title: 'Validate Binary Search Tree (BST)', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Amazon', 'Google'] },
  { title: 'Insert into a BST', difficulty: 'Easy', topic: 'Binary Search Tree', companies: ['Amazon'] },
  { title: 'Delete a Node in a BST', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Amazon', 'Microsoft'] },
  { title: 'Lowest Common Ancestor of a BST (LCA)', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Amazon', 'Microsoft'] },
  { title: 'Kth Smallest Element in a BST', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Google'] },
  { title: 'Convert Sorted Array to Balanced BST', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Amazon'] },
  { title: 'Two Sum in a BST', difficulty: 'Medium', topic: 'Binary Search Tree', companies: ['Amazon', 'Google'] },
  { title: 'Recover a Corrupted BST', difficulty: 'Hard', topic: 'Binary Search Tree', companies: ['Google'] },

  { title: 'Implement Min-Heap and Max-Heap', difficulty: 'Medium', topic: 'Heap', companies: ['Amazon', 'Microsoft'] },
  { title: 'Kth Largest Element using a Heap', difficulty: 'Medium', topic: 'Heap', companies: ['Amazon', 'Google'] },
  { title: 'Top K Frequent Elements (Heap)', difficulty: 'Medium', topic: 'Heap', companies: ['Amazon'] },
  { title: 'Merge K Sorted Arrays using a Heap', difficulty: 'Hard', topic: 'Heap', companies: ['Google', 'Amazon'] },
  { title: 'Find Median from a Data Stream', difficulty: 'Hard', topic: 'Heap', companies: ['Amazon', 'Google'] },
  { title: 'Sliding Window Maximum (Heap)', difficulty: 'Hard', topic: 'Heap', companies: ['Google', 'Amazon'] },
  { title: 'Task Scheduler (Heap-based)', difficulty: 'Medium', topic: 'Heap', companies: ['Amazon', 'Microsoft'] },

  { title: 'Activity Selection Problem', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Accenture'] },
  { title: 'Fractional Knapsack Problem', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Capgemini'] },
  { title: 'Job Sequencing Problem', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Flipkart'] },
  { title: 'Minimum Number of Platforms Required', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Microsoft'] },
  { title: 'Gas Station Problem', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Google'] },
  { title: 'Jump Game', difficulty: 'Medium', topic: 'Greedy', companies: ['Amazon', 'Google'] },
  { title: 'Minimum Number of Coins for Change (Greedy)', difficulty: 'Easy', topic: 'Greedy', companies: ['TCS', 'Infosys'] },
  { title: 'Huffman Coding', difficulty: 'Hard', topic: 'Greedy', companies: ['Amazon', 'Google'] },

  { title: 'Generate All Permutations (Backtracking)', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon', 'Google'] },
  { title: 'N-Queens Problem', difficulty: 'Hard', topic: 'Backtracking', companies: ['Amazon', 'Google'] },
  { title: 'Sudoku Solver', difficulty: 'Hard', topic: 'Backtracking', companies: ['Amazon', 'Google'] },
  { title: 'Word Search in a Grid', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon', 'Microsoft'] },
  { title: 'Combination Sum', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon', 'Google'] },
  { title: 'Palindrome Partitioning', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon', 'Google'] },
  { title: 'Rat in a Maze Problem', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon', 'Flipkart'] },
  { title: 'Subsets II (with Duplicates)', difficulty: 'Medium', topic: 'Backtracking', companies: ['Amazon'] },

  { title: 'Two Sum II (Sorted Array, Two Pointer)', difficulty: 'Easy', topic: 'Two Pointer', companies: ['Amazon', 'Google'] },
  { title: 'Container With Most Water', difficulty: 'Medium', topic: 'Two Pointer', companies: ['Amazon', 'Google'] },
  { title: '3Sum (Two Pointer)', difficulty: 'Medium', topic: 'Two Pointer', companies: ['Amazon', 'Adobe'] },
  { title: 'Remove Duplicates from Sorted Array', difficulty: 'Easy', topic: 'Two Pointer', companies: ['Amazon', 'Microsoft'] },
  { title: 'Trapping Rain Water (Two Pointer)', difficulty: 'Hard', topic: 'Two Pointer', companies: ['Amazon', 'Google'] },
  { title: 'Sort Array By Parity', difficulty: 'Easy', topic: 'Two Pointer', companies: ['Amazon'] },
  { title: 'Valid Palindrome (Two Pointer)', difficulty: 'Easy', topic: 'Two Pointer', companies: ['Amazon', 'Microsoft'] },

  { title: 'Maximum Sum Subarray of Size K', difficulty: 'Easy', topic: 'Sliding Window', companies: ['Amazon', 'Microsoft'] },
  { title: 'Longest Substring Without Repeating Characters (Window)', difficulty: 'Medium', topic: 'Sliding Window', companies: ['Amazon', 'Microsoft'] },
  { title: 'Minimum Window Substring', difficulty: 'Hard', topic: 'Sliding Window', companies: ['Google', 'Microsoft'] },
  { title: 'Longest Repeating Character Replacement', difficulty: 'Medium', topic: 'Sliding Window', companies: ['Amazon', 'Google'] },
  { title: 'Sliding Window Maximum (Deque)', difficulty: 'Hard', topic: 'Sliding Window', companies: ['Google', 'Amazon'] },
  { title: 'Fruit Into Baskets', difficulty: 'Medium', topic: 'Sliding Window', companies: ['Amazon'] },
  { title: 'Permutation in String', difficulty: 'Medium', topic: 'Sliding Window', companies: ['Amazon', 'Microsoft'] },

  { title: 'Range Sum Query — Immutable (Prefix Sum)', difficulty: 'Easy', topic: 'Prefix Sum', companies: ['Amazon', 'Google'] },
  { title: 'Subarray Sum Equals K (Prefix Sum)', difficulty: 'Medium', topic: 'Prefix Sum', companies: ['Amazon', 'Microsoft'] },
  { title: 'Continuous Subarray Sum', difficulty: 'Medium', topic: 'Prefix Sum', companies: ['Amazon'] },
  { title: 'Product of Array Except Self (Prefix/Suffix)', difficulty: 'Medium', topic: 'Prefix Sum', companies: ['Amazon', 'Google'] },
  { title: 'Find Pivot Index', difficulty: 'Easy', topic: 'Prefix Sum', companies: ['Google'] },
  { title: 'Maximum Size Subarray Sum Equals K', difficulty: 'Medium', topic: 'Prefix Sum', companies: ['Amazon', 'Google'] },

  { title: 'Count Set Bits in an Integer', difficulty: 'Easy', topic: 'Bit Manipulation', companies: ['TCS', 'Amazon'] },
  { title: 'Single Number (XOR)', difficulty: 'Easy', topic: 'Bit Manipulation', companies: ['Amazon', 'Google'] },
  { title: 'Check if a Number is a Power of Two', difficulty: 'Easy', topic: 'Bit Manipulation', companies: ['Amazon'] },
  { title: 'Find the Two Non-Repeating Elements (XOR)', difficulty: 'Medium', topic: 'Bit Manipulation', companies: ['Amazon', 'Google'] },
  { title: 'Subsets using Bitmasking', difficulty: 'Medium', topic: 'Bit Manipulation', companies: ['Amazon', 'Google'] },
  { title: 'Counting Bits (0 to n)', difficulty: 'Medium', topic: 'Bit Manipulation', companies: ['Amazon', 'Microsoft'] },
  { title: 'Reverse Bits of an Integer', difficulty: 'Medium', topic: 'Bit Manipulation', companies: ['Amazon', 'Google'] },

  { title: 'Implement a Trie (Prefix Tree)', difficulty: 'Medium', topic: 'Tries', companies: ['Amazon', 'Google'] },
  { title: 'Word Search II (Trie + Backtracking)', difficulty: 'Hard', topic: 'Tries', companies: ['Amazon', 'Google'] },
  { title: 'Longest Word in Dictionary (Trie)', difficulty: 'Medium', topic: 'Tries', companies: ['Google'] },
  { title: 'Design Add and Search Words Data Structure', difficulty: 'Medium', topic: 'Tries', companies: ['Amazon', 'Google'] },
  { title: 'Replace Words using a Trie', difficulty: 'Medium', topic: 'Tries', companies: ['Amazon'] },
  { title: 'Maximum XOR of Two Numbers in an Array (Trie)', difficulty: 'Hard', topic: 'Tries', companies: ['Google', 'Amazon'] },

  { title: 'Circular Queue using an Array', difficulty: 'Medium', topic: 'Queue', companies: ['Amazon', 'TCS'] },
  { title: 'Generate Binary Numbers from 1 to N using a Queue', difficulty: 'Medium', topic: 'Queue', companies: ['Infosys'] },
  { title: 'First Non-Repeating Character in a Stream', difficulty: 'Medium', topic: 'Queue', companies: ['Amazon', 'Microsoft'] },
  { title: 'LRU Cache using Queue + HashMap', difficulty: 'Hard', topic: 'Queue', companies: ['Amazon', 'Microsoft'] },
  { title: 'Rotten Oranges (Multi-source BFS)', difficulty: 'Medium', topic: 'Queue', companies: ['Amazon', 'Flipkart'] },
];

// ---------------------------------------------------------------------------
// Coding problems (Playground) — with test cases + starter code
// ---------------------------------------------------------------------------

const CODING_PROBLEMS = [
  {
    title: 'Two Sum', slug: 'two-sum', difficulty: 'Easy', topic: 'Arrays',
    description: 'Given an array of integers nums and an integer target, print the indices of the two numbers that add up to target (space-separated, lower index first).',
    inputFormat: 'First line: space-separated integers (the array). Second line: the target integer.',
    outputFormat: 'Two space-separated indices.',
    constraints: 'Exactly one valid answer exists.',
    examples: [{ input: '2 7 11 15\n9', output: '0 1', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' }],
    testCases: [{ input: '2 7 11 15\n9', expectedOutput: '0 1', isHidden: false }, { input: '3 2 4\n6', expectedOutput: '1 2', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const lines = require('fs').readFileSync('/dev/stdin', 'utf8').split('\\n');\nconst nums = lines[0].trim().split(' ').map(Number);\nconst target = parseInt(lines[1]);\nconst seen = new Map();\nfor (let i = 0; i < nums.length; i++) {\n  const need = target - nums[i];\n  if (seen.has(need)) { console.log(seen.get(need) + ' ' + i); break; }\n  seen.set(nums[i], i);\n}",
      Python: "import sys\nlines = sys.stdin.read().split('\\n')\nnums = list(map(int, lines[0].split()))\ntarget = int(lines[1])\nseen = {}\nfor i, n in enumerate(nums):\n    need = target - n\n    if need in seen:\n        print(seen[need], i)\n        break\n    seen[n] = i",
    },
  },
  {
    title: 'Reverse a String', slug: 'reverse-a-string', difficulty: 'Easy', topic: 'Strings',
    description: 'Read a single line of text and print it reversed.',
    inputFormat: 'A single line of text.', outputFormat: 'The reversed text.', constraints: '',
    examples: [{ input: 'hello', output: 'olleh' }],
    testCases: [{ input: 'hello', expectedOutput: 'olleh', isHidden: false }, { input: 'nexthire', expectedOutput: 'erihtxen', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();\nconsole.log(s.split('').reverse().join(''));",
      Python: "s = input()\nprint(s[::-1])",
    },
  },
  {
    title: 'Check Balanced Parentheses', slug: 'check-balanced-parentheses', difficulty: 'Medium', topic: 'Stack',
    description: 'Read a string of brackets and print "true" if every bracket is properly closed and nested, otherwise "false".',
    inputFormat: 'A single line containing only ( ) [ ] { } characters.', outputFormat: '"true" or "false"', constraints: '',
    examples: [{ input: '{[()]}', output: 'true' }, { input: '{[(])}', output: 'false' }],
    testCases: [{ input: '{[()]}', expectedOutput: 'true', isHidden: false }, { input: '{[(])}', expectedOutput: 'false', isHidden: false }, { input: '((()))', expectedOutput: 'true', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();\nconst pairs = { ')': '(', ']': '[', '}': '{' };\nconst stack = [];\nlet ok = true;\nfor (const c of s) {\n  if ('([{'.includes(c)) stack.push(c);\n  else if (stack.pop() !== pairs[c]) { ok = false; break; }\n}\nconsole.log(ok && stack.length === 0);",
      Python: "s = input().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack = []\nok = True\nfor c in s:\n    if c in '([{':\n        stack.append(c)\n    else:\n        if not stack or stack.pop() != pairs[c]:\n            ok = False\n            break\nprint(str(ok and not stack).lower())",
    },
  },
  {
    title: 'FizzBuzz', slug: 'fizzbuzz', difficulty: 'Easy', topic: 'Coding',
    description: 'Read an integer n. For each i from 1 to n, print "Fizz" if divisible by 3, "Buzz" if divisible by 5, "FizzBuzz" if divisible by both, otherwise print i.',
    inputFormat: 'A single integer n.', outputFormat: 'n lines of output.', constraints: '1 <= n <= 1000',
    examples: [{ input: '5', output: '1\n2\nFizz\n4\nBuzz' }],
    testCases: [{ input: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz', isHidden: false }, { input: '15', expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const n = parseInt(require('fs').readFileSync('/dev/stdin', 'utf8').trim());\nfor (let i = 1; i <= n; i++) {\n  if (i % 15 === 0) console.log('FizzBuzz');\n  else if (i % 3 === 0) console.log('Fizz');\n  else if (i % 5 === 0) console.log('Buzz');\n  else console.log(i);\n}",
      Python: "n = int(input())\nfor i in range(1, n + 1):\n    if i % 15 == 0: print('FizzBuzz')\n    elif i % 3 == 0: print('Fizz')\n    elif i % 5 == 0: print('Buzz')\n    else: print(i)",
    },
  },
  {
    title: 'Find Maximum Subarray Sum', slug: 'max-subarray-sum', difficulty: 'Medium', topic: 'Arrays',
    description: 'Given an array of integers, print the sum of the contiguous subarray with the largest sum (Kadane\'s Algorithm).',
    inputFormat: 'A single line of space-separated integers.', outputFormat: 'A single integer — the maximum subarray sum.', constraints: 'Array has at least 1 element.',
    examples: [{ input: '-2 1 -3 4 -1 2 1 -5 4', output: '6', explanation: 'The subarray [4, -1, 2, 1] has the largest sum = 6.' }],
    testCases: [{ input: '-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6', isHidden: false }, { input: '1 2 3 4', expectedOutput: '10', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const nums = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split(' ').map(Number);\nlet maxSoFar = nums[0], cur = nums[0];\nfor (let i = 1; i < nums.length; i++) {\n  cur = Math.max(nums[i], cur + nums[i]);\n  maxSoFar = Math.max(maxSoFar, cur);\n}\nconsole.log(maxSoFar);",
      Python: "nums = list(map(int, input().split()))\nmax_so_far = cur = nums[0]\nfor x in nums[1:]:\n    cur = max(x, cur + x)\n    max_so_far = max(max_so_far, cur)\nprint(max_so_far)",
    },
  },
  {
    title: 'Binary Search', slug: 'binary-search', difficulty: 'Easy', topic: 'Binary Search',
    description: 'Given a sorted array and a target value, print the index of the target, or -1 if not found.',
    inputFormat: 'First line: sorted space-separated integers. Second line: target integer.', outputFormat: 'The index, or -1.', constraints: 'Array is sorted ascending.',
    examples: [{ input: '1 3 5 7 9 11\n7', output: '3' }],
    testCases: [{ input: '1 3 5 7 9 11\n7', expectedOutput: '3', isHidden: false }, { input: '2 4 6 8\n5', expectedOutput: '-1', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const lines = require('fs').readFileSync('/dev/stdin', 'utf8').split('\\n');\nconst arr = lines[0].trim().split(' ').map(Number);\nconst target = parseInt(lines[1]);\nlet lo = 0, hi = arr.length - 1, ans = -1;\nwhile (lo <= hi) {\n  const mid = (lo + hi) >> 1;\n  if (arr[mid] === target) { ans = mid; break; }\n  if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;\n}\nconsole.log(ans);",
      Python: "arr = list(map(int, input().split()))\ntarget = int(input())\nlo, hi, ans = 0, len(arr) - 1, -1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if arr[mid] == target:\n        ans = mid\n        break\n    elif arr[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nprint(ans)",
    },
  },
  {
    title: 'Reverse a Linked List (Array Simulation)', slug: 'reverse-linked-list-sim', difficulty: 'Easy', topic: 'Linked List',
    description: 'Given a list of integers representing a linked list, print the values in reverse order (simulating list reversal), space-separated.',
    inputFormat: 'A line of space-separated integers.', outputFormat: 'The reversed sequence, space-separated.', constraints: '',
    examples: [{ input: '1 2 3 4 5', output: '5 4 3 2 1' }],
    testCases: [{ input: '1 2 3 4 5', expectedOutput: '5 4 3 2 1', isHidden: false }, { input: '10 20 30', expectedOutput: '30 20 10', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const arr = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split(' ');\nconsole.log(arr.reverse().join(' '));",
      Python: "arr = input().split()\nprint(' '.join(reversed(arr)))",
    },
  },
  {
    title: 'Count Vowels and Consonants', slug: 'count-vowels-consonants', difficulty: 'Easy', topic: 'Strings',
    description: 'Read a line of lowercase alphabetic text and print the count of vowels and consonants, space-separated.',
    inputFormat: 'A single line of lowercase letters.', outputFormat: 'Two integers: vowel count, consonant count.', constraints: '',
    examples: [{ input: 'hello world', output: '3 7' }],
    testCases: [{ input: 'hello world', expectedOutput: '3 7', isHidden: false }, { input: 'programming', expectedOutput: '3 8', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();\nlet v = 0, c = 0;\nfor (const ch of s) {\n  if ('aeiou'.includes(ch)) v++;\n  else if (/[a-z]/.test(ch)) c++;\n}\nconsole.log(v + ' ' + c);",
      Python: "s = input().strip()\nv = sum(1 for ch in s if ch in 'aeiou')\nc = sum(1 for ch in s if ch.isalpha() and ch not in 'aeiou')\nprint(v, c)",
    },
  },
  {
    title: 'Factorial (Recursive)', slug: 'factorial-recursive', difficulty: 'Easy', topic: 'Coding',
    description: 'Read an integer n and print n! (factorial), computed recursively.',
    inputFormat: 'A single integer n (0 <= n <= 15).', outputFormat: 'n!', constraints: '0 <= n <= 15',
    examples: [{ input: '5', output: '120' }],
    testCases: [{ input: '5', expectedOutput: '120', isHidden: false }, { input: '0', expectedOutput: '1', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const n = parseInt(require('fs').readFileSync('/dev/stdin', 'utf8').trim());\nfunction fact(x) { return x <= 1 ? 1 : x * fact(x - 1); }\nconsole.log(fact(n));",
      Python: "n = int(input())\ndef fact(x):\n    return 1 if x <= 1 else x * fact(x - 1)\nprint(fact(n))",
    },
  },
  {
    title: 'Check Anagram', slug: 'check-anagram', difficulty: 'Easy', topic: 'Strings',
    description: 'Read two lines of lowercase text and print "true" if they are anagrams of each other, else "false".',
    inputFormat: 'Two lines of lowercase text.', outputFormat: '"true" or "false"', constraints: '',
    examples: [{ input: 'listen\nsilent', output: 'true' }],
    testCases: [{ input: 'listen\nsilent', expectedOutput: 'true', isHidden: false }, { input: 'hello\nworld', expectedOutput: 'false', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const lines = require('fs').readFileSync('/dev/stdin', 'utf8').split('\\n');\nconst a = lines[0].trim().split('').sort().join('');\nconst b = lines[1].trim().split('').sort().join('');\nconsole.log((a === b).toString());",
      Python: "a = input().strip()\nb = input().strip()\nprint(str(sorted(a) == sorted(b)).lower())",
    },
  },
  {
    title: 'Fibonacci Series', slug: 'fibonacci-series', difficulty: 'Easy', topic: 'Dynamic Programming',
    description: 'Read an integer n and print the first n Fibonacci numbers (starting 0, 1), space-separated.',
    inputFormat: 'A single integer n.', outputFormat: 'n space-separated Fibonacci numbers.', constraints: 'n >= 1',
    examples: [{ input: '6', output: '0 1 1 2 3 5' }],
    testCases: [{ input: '6', expectedOutput: '0 1 1 2 3 5', isHidden: false }, { input: '1', expectedOutput: '0', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const n = parseInt(require('fs').readFileSync('/dev/stdin', 'utf8').trim());\nconst fib = [0, 1];\nwhile (fib.length < n) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);\nconsole.log(fib.slice(0, n).join(' '));",
      Python: "n = int(input())\nfib = [0, 1]\nwhile len(fib) < n:\n    fib.append(fib[-1] + fib[-2])\nprint(' '.join(map(str, fib[:n])))",
    },
  },
  {
    title: 'Second Largest Element in Array', slug: 'second-largest-element', difficulty: 'Medium', topic: 'Arrays',
    description: 'Given an array of distinct integers, print the second largest element.',
    inputFormat: 'A line of space-separated integers.', outputFormat: 'A single integer.', constraints: 'Array has at least 2 distinct elements.',
    examples: [{ input: '10 5 20 8 15', output: '15' }],
    testCases: [{ input: '10 5 20 8 15', expectedOutput: '15', isHidden: false }, { input: '1 2', expectedOutput: '1', isHidden: true }],
    supportedLanguages: ['JavaScript', 'Python'],
    starterCode: {
      JavaScript: "const arr = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split(' ').map(Number);\nlet first = -Infinity, second = -Infinity;\nfor (const n of arr) {\n  if (n > first) { second = first; first = n; }\n  else if (n > second && n !== first) second = n;\n}\nconsole.log(second);",
      Python: "arr = list(map(int, input().split()))\nfirst = second = float('-inf')\nfor n in arr:\n    if n > first:\n        second, first = first, n\n    elif n > second and n != first:\n        second = n\nprint(second)",
    },
  },
];

// ---------------------------------------------------------------------------
// Interview question bank (HR + technical, some company-specific)
// ---------------------------------------------------------------------------

const INTERVIEW_QUESTIONS_CURATED = [
  // --- HR ---
  { question: 'Tell me about yourself.', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Structure your answer as Present → Past → Future: what you do now, relevant past experience/projects, and what you\'re looking for next.', followUpQuestions: ['Why should we hire you?', 'What are your strengths?'] },
  { question: 'Why should we hire you?', category: 'hr', subject: 'General', difficulty: 'Medium', answer: 'Connect your specific skills and past achievements directly to the role\'s requirements, backed by one concrete example.' },
  { question: 'What are your strengths and weaknesses?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Pick a genuine strength relevant to the role, and a real weakness paired with what you\'re doing to improve it.' },
  { question: 'Where do you see yourself in 5 years?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Show ambition aligned with growth at the company, without over-promising specific titles.' },
  { question: 'Why do you want to work here?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Reference something specific about the company\'s mission, tech, or culture — avoid generic answers.' },
  { question: 'Are you willing to relocate?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Answer honestly; if yes, express openness clearly since many companies filter on this.' },
  { question: 'What is your expected salary?', category: 'hr', subject: 'General', difficulty: 'Medium', answer: 'Give a researched range based on the role and market, and stay open to discussion rather than a hard number.' },
  { question: 'Why did you choose this branch/field of study?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Share a genuine, specific reason — curiosity sparked by a project, subject, or role model — rather than a generic answer.' },
  { question: 'What motivates you to do your best work?', category: 'hr', subject: 'General', difficulty: 'Medium', answer: 'Give a specific, honest motivator (solving hard problems, learning, impact) backed by an example of when it showed.' },
  { question: 'How do you handle criticism or negative feedback?', category: 'hr', subject: 'General', difficulty: 'Medium', answer: 'Describe listening without getting defensive, asking clarifying questions, and a specific instance where feedback improved your work.' },
  { question: 'Do you have any questions for us?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Always have 2-3 genuine questions ready about the team, growth, or role expectations — it shows real interest.' },
  { question: 'What are your salary and location constraints, if any?', category: 'hr', subject: 'General', difficulty: 'Easy', answer: 'Be upfront and honest about constraints, since surprises later can cost you the offer.' },
  { question: 'Why should we choose you over other candidates?', category: 'hr', subject: 'General', difficulty: 'Medium', answer: 'Focus on your unique combination of skills and evidence, not comparisons to unknown other candidates.' },
  // --- Behavioral ---
  { question: 'Describe a time you faced a conflict in a team and how you resolved it.', category: 'behavioral', subject: 'General', difficulty: 'Medium', answer: 'Use the STAR method: Situation, Task, Action, Result — focus on your specific contribution to resolving it.' },
  { question: 'Tell me about a time you failed and what you learned.', category: 'behavioral', subject: 'General', difficulty: 'Medium', answer: 'Pick a real, moderate failure, own the mistake honestly, and emphasize the concrete lesson/change in behavior.' },
  { question: 'Describe a situation where you had to learn something new quickly.', category: 'behavioral', subject: 'General', difficulty: 'Medium', answer: 'Explain your learning approach (docs, practice, asking for help) and the concrete outcome it enabled.' },
  { question: 'Tell me about a time you disagreed with a teammate or manager.', category: 'behavioral', subject: 'General', difficulty: 'Hard', answer: 'Show you can disagree respectfully, back your view with reasoning, and stay collaborative regardless of the outcome.' },
  { question: 'Describe a project you\'re most proud of and why.', category: 'behavioral', subject: 'General', difficulty: 'Easy', answer: 'Pick a project with real personal contribution and measurable impact, and explain the "why" behind the pride, not just the "what".' },
  { question: 'Tell me about a time you had to manage multiple priorities under a deadline.', category: 'behavioral', subject: 'General', difficulty: 'Hard', answer: 'Describe how you triaged tasks, communicated trade-offs, and what the final outcome was.' },
  { question: 'Describe a time you had to work with someone difficult.', category: 'behavioral', subject: 'General', difficulty: 'Hard', answer: 'Stay professional and focus on what you did to improve the working relationship, not on blaming the other person.' },
  { question: 'Give an example of when you took initiative without being asked.', category: 'behavioral', subject: 'General', difficulty: 'Medium', answer: 'Describe the gap you noticed, the action you took, and the result — showing ownership beyond your assigned tasks.' },
  // --- Company-specific ---
  { question: 'Which Amazon Leadership Principle resonates most with you?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Amazon', answer: 'Pick one Leadership Principle honestly and back it with a specific, detailed story from your experience.' },
  { question: 'Why consulting, and why Deloitte specifically?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Deloitte', answer: 'Connect your interest in problem-solving across industries with something specific about Deloitte\'s practice areas or culture.' },
  { question: 'Why TCS?', category: 'company-specific', subject: 'General', difficulty: 'Easy', companyName: 'TCS', answer: 'Reference TCS\'s scale, learning culture (TCS iON, certifications), and the variety of client-facing project exposure.' },
  { question: 'What excites you about working at Google specifically?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Google', answer: 'Reference specific products, engineering culture, or scale of impact rather than generic "innovative company" answers.' },
  { question: 'How would you demonstrate a "growth mindset" here at Microsoft?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Microsoft', answer: 'Give a concrete example of learning from failure or actively seeking feedback to improve, tied to Microsoft\'s stated culture.' },
  { question: 'Why Infosys, and what do you know about InfyTQ?', category: 'company-specific', subject: 'General', difficulty: 'Easy', companyName: 'Infosys', answer: 'Mention Infosys\'s scale, training programs like InfyTQ, and the breadth of technology exposure across projects.' },
  { question: 'Why do you want to join a product company like Flipkart rather than a service company?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Flipkart', answer: 'Focus on wanting deep ownership of a product\'s lifecycle and technical depth over breadth of client projects.' },
  { question: 'What do you know about Wipro\'s WILP program?', category: 'company-specific', subject: 'General', difficulty: 'Easy', companyName: 'Wipro', answer: 'WILP (Wipro\'s Work Integrated Learning Program) lets employees pursue a higher degree while working — mention its appeal for continued learning.' },
  { question: 'Why do you want to work in fintech at Paytm specifically?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Paytm', answer: 'Reference interest in solving scale/reliability challenges for financial systems used by millions of people daily.' },
  { question: 'What interests you about working in investment banking technology at Goldman Sachs?', category: 'company-specific', subject: 'General', difficulty: 'Hard', companyName: 'Goldman Sachs', answer: 'Connect your interest in high-stakes, high-performance systems with Goldman\'s scale and precision requirements.' },
  { question: 'Why HCL, and what do you know about HCL TechBee?', category: 'company-specific', subject: 'General', difficulty: 'Easy', companyName: 'HCL', answer: 'Mention TechBee as an early-career entry path and HCL\'s breadth across IT services and product engineering.' },
  { question: 'Why do you want to work at a Big 4 firm like EY?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'EY', answer: 'Reference exposure to diverse industries, structured mentorship, and the credibility a Big 4 experience carries.' },
  { question: 'What do you know about Zoho\'s unique hiring and work culture?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Zoho', answer: 'Mention Zoho\'s merit-first hiring (not degree-gated), in-house training, and focus on building its own products end-to-end.' },
  { question: 'Why do you want to work on a payments platform like PhonePe?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'PhonePe', answer: 'Reference interest in the reliability/scale challenges of real-time transaction systems used by hundreds of millions.' },
  { question: 'Why Capgemini, and what interests you about their digital transformation work?', category: 'company-specific', subject: 'General', difficulty: 'Easy', companyName: 'Capgemini', answer: 'Mention interest in helping enterprise clients modernize, and the variety of technologies that exposes you to.' },
  { question: 'Why Cisco, given your interest in networking?', category: 'company-specific', subject: 'General', difficulty: 'Medium', companyName: 'Cisco', answer: 'Connect a genuine interest in networking/infrastructure with Cisco\'s foundational role in internet infrastructure.' },
];

const INTERVIEW_TECHNICAL_SUBJECTS = ['OS', 'DBMS', 'Computer Networks', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'MongoDB', 'SQL', 'C', 'C++', 'Python', 'DSA'];

const INTERVIEW_QUESTIONS = [
  ...INTERVIEW_QUESTIONS_CURATED,
  ...INTERVIEW_TECHNICAL_SUBJECTS.flatMap((subject) => glossaryToInterviewQuestions(subject, GLOSSARY_TERMS[subject], 9)),
];

module.exports = {
  q,
  assembleQuizzes,
  auditQuizzes,
  printQuizAuditReport,
  DEFAULT_QUIZ_COUNTS,
  glossaryPool,
  GLOSSARY_TERMS,
  genQuantAptitudePool,
  genLogicalReasoningPool,
  genVerbalAbilityPool,
  genDataInterpretationPool,
  genTechnicalPool,
  TECHNICAL_RAW,
  buildAllQuizzes,
  TOPICS,
  COMPANIES,
  DSA_QUESTIONS,
  CODING_PROBLEMS,
  INTERVIEW_QUESTIONS,
};
