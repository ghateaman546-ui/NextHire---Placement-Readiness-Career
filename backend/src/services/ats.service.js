/**
 * ats.service.js — deterministic ATS analysis engine.
 *
 * No randomness, no network calls, no AI: the same resume text + job description always produce the
 * same result. Every point in the score can be traced to a rule in this file.
 *
 * SCORE (100 points)
 *   Keyword Match ........ 30   job-description keyword coverage (weighted: required 2, preferred 1)
 *                               — without a JD: richness of recognised technical keywords
 *   Skills Match ......... 20   JD technical skills found in the resume (0.5 credit for a closely related skill)
 *                               — without a JD: breadth across skill categories
 *   Resume Completeness .. 15   summary 2, education 3, experience 2, projects 3, skills 3, certs 1, achievements 1
 *   Experience Relevance . 10   action verbs 3 + measurable results 3 + relevance to JD / tech stack 4
 *   Education ............ 10   degree 4, institution 2, year 2, CGPA/percentage 2
 *   ATS Formatting ....... 10   10 minus penalties for columns, tables, symbols, missing headings, etc.
 *   Contact Information ..  5   email 2, phone 1, LinkedIn 1, GitHub / portfolio 1
 */
const { ENTRIES, BY_NAME, TECHNICAL_TYPES, SKILL_CATEGORY, TYPE_LABEL, ACTION_VERBS, TYPES } = require('../utils/atsKeywords');
const { AtsError } = require('./ats.extractor');

// ───────────────────────────── text helpers ─────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const wordsOf = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}+#.'-]*/gu) || []).length;

const BULLET_RE = /^\s*(?:[•\-–—*·▪●◦>]|\d{1,2}[.)])\s+/;
const isBulletLine = (l) => BULLET_RE.test(l);
const stripBullet = (l) => l.replace(BULLET_RE, '').trim();

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)\d{3,5}[\s.-]?\d{3,5}/g;
const LINKEDIN_RE = /(?:linkedin\.com\/(?:in|pub)\/[\w%-]+)/i;
const GITHUB_RE = /(?:github\.com\/[\w-]+)/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s)>,]+|(?:[a-z0-9-]+\.)+(?:com|io|dev|me|app|tech|in|org|net|co)\/?[^\s)>,]*/gi;
const METRIC_RE =
  /(?:\b\d+(?:\.\d+)?\s?(?:%|x\b|k\b|\+)|[$₹€£]\s?\d|\b\d{2,}\+?\s?(?:users|students|customers|requests|records|ms|seconds|hours|projects|problems|questions|apis|endpoints|downloads|stars|members|participants|teams|clients|visits|lines|queries|transactions|orders|reduction|improvement|faster)\b|\b(?:reduced|increased|improved|decreased|boosted|cut|saved|grew|accelerated)\b[^.\n]{0,40}\d)/i;
const WEAK_START_RE = /^(?:responsible for|worked on|worked with|helped|tasked with|duties included|involved in|participated in|assisted in|was part of)\b/i;
const GENERIC_SUMMARY_RE = /\b(hard[- ]?working|passionate|seeking a challenging|team player|dynamic|go-getter|results[- ]oriented|self[- ]motivated|detail[- ]oriented)\b/gi;
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_RE = new RegExp(`(?:\\b(?:${MONTHS})[a-z]*\\.?\\s*['’]?\\d{2,4}|\\b\\d{1,2}\\/\\d{4}|\\b(?:19|20)\\d{2}\\b|\\bpresent\\b|\\bcurrent\\b|\\b\\d+\\s*(?:months?|mos?|years?|yrs?)\\b)`, 'gi');

// ───────────────────────────── sections ─────────────────────────────

const SECTION_DEFS = [
  { key: 'summary', label: 'Professional Summary', synonyms: ['summary', 'professional summary', 'career summary', 'profile', 'professional profile', 'objective', 'career objective', 'about me', 'about', 'executive summary'] },
  { key: 'education', label: 'Education', synonyms: ['education', 'academic background', 'academics', 'educational qualifications', 'academic qualifications', 'qualifications', 'educational background'] },
  { key: 'experience', label: 'Experience', synonyms: ['experience', 'work experience', 'professional experience', 'internships', 'internship', 'internship experience', 'employment', 'employment history', 'work history', 'industrial training', 'relevant experience', 'training'] },
  { key: 'projects', label: 'Projects', synonyms: ['projects', 'academic projects', 'personal projects', 'key projects', 'technical projects', 'project work', 'selected projects', 'major projects'] },
  { key: 'skills', label: 'Skills', synonyms: ['skills', 'technical skills', 'key skills', 'core competencies', 'competencies', 'technical proficiency', 'skill set', 'skills and tools', 'tools and technologies', 'technologies and tools', 'technical expertise', 'areas of expertise'] },
  { key: 'certifications', label: 'Certifications', synonyms: ['certifications', 'certification', 'certificates', 'courses', 'licenses', 'licences', 'online courses', 'courses and certifications', 'training and certifications', 'licenses and certifications'] },
  { key: 'achievements', label: 'Achievements', synonyms: ['achievements', 'awards', 'honors', 'honours', 'accomplishments', 'awards and achievements', 'extracurricular', 'extracurriculars', 'extracurricular activities', 'positions of responsibility', 'activities', 'co-curricular', 'leadership', 'hackathons', 'competitive programming', 'achievements and awards'] },
];
const SECTION_BY_SYNONYM = new Map();
SECTION_DEFS.forEach((d) => d.synonyms.forEach((s) => SECTION_BY_SYNONYM.set(s, d.key)));
const INLINE_HEADINGS = new Set(['skills', 'technical skills', 'key skills', 'core competencies', 'certifications', 'achievements', 'awards', 'summary', 'professional summary', 'objective', 'career objective']);
const LINKS_HEADING = new Set(['links', 'profiles', 'social links', 'online profiles', 'portfolio']);

function normHeading(line) {
  return line
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns { key, inline } if the line is a section heading (optionally with inline content after a colon). */
function matchHeading(rawLine) {
  const line = rawLine.trim();
  if (!line || line.length > 70) return null;
  if (isBulletLine(line)) return null;

  const colon = line.match(/^([A-Za-z&/ ]{3,40})\s*[:–—-]\s*(.+)$/);
  if (colon) {
    const label = normHeading(colon[1]);
    const key = SECTION_BY_SYNONYM.get(label);
    // Inline "Heading: content" is only trusted for unambiguous labels — "Technologies: React, Node" inside a
    // project, or "Training: 6 weeks", must not be mistaken for a new section.
    if (key && INLINE_HEADINGS.has(label)) return { key, inline: colon[2].trim() };
  }

  if (/[.!?]$/.test(line) || line.includes(',')) return null;
  const n = normHeading(line);
  if (!n || n.split(' ').length > 5) return null;
  if (SECTION_BY_SYNONYM.has(n)) return { key: SECTION_BY_SYNONYM.get(n), inline: '' };
  if (LINKS_HEADING.has(n)) return { key: 'links', inline: '' };
  return null;
}

function splitSections(text) {
  const lines = text.split('\n');
  const sections = {};
  const order = [];
  let current = 'header';
  sections.header = [];
  for (const raw of lines) {
    const h = matchHeading(raw);
    if (h) {
      current = h.key;
      if (!sections[current]) {
        sections[current] = [];
        order.push(current);
      }
      if (h.inline) sections[current].push(h.inline);
      continue;
    }
    sections[current].push(raw);
  }
  const joined = {};
  Object.keys(sections).forEach((k) => {
    joined[k] = sections[k].join('\n').trim();
  });
  return { sections: joined, headingCount: order.length, order };
}

// ───────────────────────────── keyword matching ─────────────────────────────

const STRICT_STOP_NEXT = new Set(['to', 'with', 'and', 'the', 'your', 'is', 'a', 'an', 'in', 'on', 'for', 'of', 'yourself', 'quickly', 'fast', 'at', 'as', 'by', 'or', 'our', 'their']);
const SEPARATORS = new Set([',', '/', '|', '•', ';', '(', ')', '[', ']', ':', '&']);

const MATCHERS = [];
for (const entry of ENTRIES) {
  for (const alias of entry.aliases) {
    const ambiguous = Boolean(entry.strict) && alias !== alias.toLowerCase();
    const before = '(?<![\\p{L}\\p{N}_+#])';
    const after = '(?![\\p{L}\\p{N}_])' + (/[+#]$/.test(alias) ? '' : '(?![+#])');
    const body = escapeRe(alias);
    MATCHERS.push({
      entry,
      alias,
      ambiguous,
      short: alias.length <= 2,
      exact: ambiguous ? new RegExp(before + body + after, 'gu') : null,
      loose: new RegExp(before + body + after, 'giu'),
    });
  }
}

function lineBounds(text, idx) {
  const start = text.lastIndexOf('\n', idx - 1) + 1;
  let end = text.indexOf('\n', idx);
  if (end === -1) end = text.length;
  return [start, end];
}

function neighbour(text, idx, len, lineStart, lineEnd) {
  let i = idx - 1;
  while (i >= lineStart && (text[i] === ' ' || text[i] === '\t')) i -= 1;
  const prev = i < lineStart ? '\n' : text[i];
  let j = idx + len;
  while (j < lineEnd && (text[j] === ' ' || text[j] === '\t')) j += 1;
  const next = j >= lineEnd ? '\n' : text[j];
  return { prev, next, after: text.slice(j, lineEnd) };
}

/**
 * Finds every dictionary skill in `text`.
 * @returns {Map<string,{count:number, entry:object}>}
 */
function findSkills(text) {
  const found = new Map();
  const add = (entry, n = 1) => {
    const cur = found.get(entry.name);
    if (cur) cur.count += n;
    else found.set(entry.name, { count: n, entry });
  };

  // pass 1 — unambiguous aliases
  const plainLines = new Set();
  const lineIdx = (pos) => {
    let n = 0;
    for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n += 1;
    return n;
  };
  for (const m of MATCHERS) {
    if (m.ambiguous) continue;
    m.loose.lastIndex = 0;
    let r;
    let n = 0;
    while ((r = m.loose.exec(text)) !== null) {
      n += 1;
      plainLines.add(lineIdx(r.index));
      if (r[0].length === 0) m.loose.lastIndex += 1;
    }
    if (n) add(m.entry, n);
  }

  // pass 2 — ambiguous aliases (C, R, Go, React, Express, Spring, Excel, Rust, Swift)
  for (const m of MATCHERS) {
    if (!m.ambiguous) continue;
    m.loose.lastIndex = 0;
    let r;
    let n = 0;
    while ((r = m.loose.exec(text)) !== null) {
      const idx = r.index;
      const [ls, le] = lineBounds(text, idx);
      const { prev, next, after } = neighbour(text, idx, r[0].length, ls, le);
      const hasSep = SEPARATORS.has(prev) || SEPARATORS.has(next) || (prev === '\n' && next === '\n');
      const exactCase = r[0] === m.alias;
      let ok = false;
      if (m.short) {
        ok = exactCase && hasSep && (plainLines.has(lineIdx(idx)) || /^(?:skills|languages|technologies|tools)/i.test(text.slice(ls, idx).trim()));
      } else if (exactCase) {
        const firstWord = (after.match(/^[A-Za-z0-9']+/) || [''])[0].toLowerCase();
        const sentenceStart = prev === '\n' || prev === '.';
        ok = !(sentenceStart && STRICT_STOP_NEXT.has(firstWord)) && !/^(?:19|20)\d{2}$/.test(firstWord) && !/^\d/.test(firstWord);
      } else {
        ok = hasSep;
      }
      if (ok) n += 1;
      if (r[0].length === 0) m.loose.lastIndex += 1;
    }
    if (n) add(m.entry, n);
  }
  return found;
}

function findLiteral(text, term) {
  const re = new RegExp(`(?<![\\p{L}\\p{N}_+#])${escapeRe(term)}(?![\\p{L}\\p{N}_])(?![+#])`, 'giu');
  return (text.match(re) || []).length;
}

// ── job description keyword extraction

const EXTRA_STOP = new Set(
  ('API APIS UI UX SAAS B2B B2C USA AND THE FOR NOT YOU OUR ALL MUST INC LLC LTD CTC LPA ASAP HR CEO CTO PHD MBA BTECH EEO EOE WFH FAQ ' +
    'LinkedIn YouTube iPhone PayPal WhatsApp Facebook Instagram Twitter OpenAI MacBook PowerPoint SharePoint').split(/\s+/)
);

function extractJobKeywords(jd) {
  const lines = jd.split('\n');
  const required = new Map(); // name -> {entry, count, importance}
  let mode = 'required';
  const known = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    const isHeadingish = line.length < 80 && !/[.!?]$/.test(line);
    if (isHeadingish && /(preferred|nice[- ]to[- ]have|good[- ]to[- ]have|bonus|desirable|optional|a plus)/.test(low)) mode = 'preferred';
    else if (isHeadingish && /(requirement|required|must[- ]have|qualification|what you.?ll need|responsibilit|what we.?re looking|skills|about you|you have)/.test(low)) mode = 'required';
    const lineMode = /(preferred|nice[- ]to[- ]have|good[- ]to[- ]have|bonus|\ba plus\b|is a plus|desirable)/.test(low) ? 'preferred' : mode;

    const here = findSkills(line);
    for (const [name, { count, entry }] of here) {
      known.add(name);
      const weight = lineMode === 'required' ? 2 : 1;
      const cur = required.get(name);
      if (cur) {
        cur.count += count;
        cur.importance = Math.max(cur.importance, weight);
      } else required.set(name, { entry, count, importance: weight });
    }
  }

  // Extra technology tokens that are not in the dictionary — only accepted on lines that also name a known skill,
  // so company / product names in the "about us" text are not mistaken for requirements.
  const extras = new Map();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || findSkills(line).size === 0) continue;
    const tokens = line.match(/\b[A-Za-z][A-Za-z0-9+#.]*[A-Za-z0-9+#]\b/g) || [];
    for (const tok of tokens) {
      if (EXTRA_STOP.has(tok) || EXTRA_STOP.has(tok.toUpperCase())) continue;
      const dotJs = /\.js$/i.test(tok);
      const camel = /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(tok) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(tok);
      if (!(dotJs || camel)) continue;
      if (findSkills(tok).size > 0) continue;
      const key = tok.toLowerCase();
      if (BY_NAME.has(tok)) continue;
      extras.set(key, { name: tok, count: (extras.get(key)?.count || 0) + 1 });
    }
  }

  const list = [];
  for (const [name, v] of required) {
    list.push({
      name,
      type: v.entry.type,
      typeLabel: TYPE_LABEL[v.entry.type],
      importance: v.importance + (v.count >= 3 ? 1 : 0),
      priority: v.importance >= 2 ? 'required' : 'preferred',
      jdMentions: v.count,
      inferred: false,
    });
  }
  [...extras.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10)
    .forEach((x) =>
      list.push({ name: x.name, type: 'technology', typeLabel: 'Technology', importance: 1, priority: 'preferred', jdMentions: x.count, inferred: true })
    );
  return list;
}

// reverse "related" map: skill -> names of skills that list it as related
const REVERSE_RELATED = new Map();
for (const e of ENTRIES) {
  for (const r of e.related || []) {
    if (!REVERSE_RELATED.has(r)) REVERSE_RELATED.set(r, new Set());
    REVERSE_RELATED.get(r).add(e.name);
  }
}
function relatedNames(name) {
  const entry = BY_NAME.get(name);
  const out = new Set(entry?.related || []);
  (REVERSE_RELATED.get(name) || []).forEach((n) => out.add(n));
  out.delete(name);
  return [...out];
}

// ───────────────────────────── contact ─────────────────────────────

function analyzeContact(text, header) {
  const head = `${header}\n${text.split('\n').slice(0, 15).join('\n')}`;
  const email = text.match(EMAIL_RE);
  let phone = null;
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13 && !/^(?:19|20)\d{2}(?:19|20)\d{2}/.test(digits)) {
      phone = m[0];
      break;
    }
  }
  const linkedin = text.match(LINKEDIN_RE);
  const github = text.match(GITHUB_RE);
  const urls = (text.match(URL_RE) || []).filter((u) => !EMAIL_RE.test(u) && !LINKEDIN_RE.test(u) && !GITHUB_RE.test(u) && /[a-z]/i.test(u));
  const portfolio = urls.find((u) => !/^(?:node|react|express|next|vue)\./i.test(u) && !/\.(?:js|json)$/i.test(u));
  return {
    email: Boolean(email),
    phone: Boolean(phone),
    linkedin: Boolean(linkedin),
    github: Boolean(github),
    portfolio: Boolean(portfolio),
    emailInFirstLines: Boolean(email) && EMAIL_RE.test(head),
    anyLink: Boolean(linkedin || github || portfolio),
  };
}

// ───────────────────────────── content analysis ─────────────────────────────

function statementLines(sectionText) {
  if (!sectionText) return [];
  const lines = sectionText.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter(isBulletLine).map(stripBullet);
  if (bullets.length) return bullets;
  return lines.filter((l) => l.length > 45 && !/^(?:tech|technologies|stack|tools|built with|link)/i.test(l));
}

function startsWithActionVerb(line) {
  const first = (stripBullet(line).match(/^[A-Za-z]+/) || [''])[0].toLowerCase();
  if (!first) return false;
  if (ACTION_VERBS.has(first)) return true;
  return first.length > 4 && first.endsWith('ed') && !['needed', 'based'].includes(first);
}

function splitProjectBlocks(sectionText) {
  if (!sectionText) return [];
  const blocks = [];
  let cur = null;
  for (const raw of sectionText.split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (cur) cur.sawBlank = true;
      continue;
    }
    const bullet = isBulletLine(line);
    const continuation = /^(?:tech(?:nologies| stack)?|stack|tools|built with|link|github|live|demo|url)\b/i.test(line);
    const titleish = !bullet && !continuation && line.length <= 100 && !/[.]$/.test(line);
    if (titleish && (!cur || cur.sawBlank || cur.bullets > 0 || cur.desc > 0)) {
      cur = { title: line, lines: [line], bullets: 0, desc: 0, sawBlank: false };
      blocks.push(cur);
      continue;
    }
    if (!cur) {
      cur = { title: truncate(stripBullet(line), 60), lines: [], bullets: 0, desc: 0, sawBlank: false };
      blocks.push(cur);
    }
    cur.lines.push(line);
    if (bullet) cur.bullets += 1;
    else if (!continuation) cur.desc += 1;
  }
  return blocks;
}

function parseSkillItems(sectionText) {
  if (!sectionText) return [];
  return sectionText
    .split(/[\n,|•;]/)
    .map((s) => s.replace(/^[A-Za-z &/]{2,30}:\s*/, '').replace(BULLET_RE, '').trim())
    .flatMap((s) => (s.length > 40 ? [] : [s]))
    .filter((s) => s.length > 0 && s.length <= 40);
}

// ───────────────────────────── formatting ─────────────────────────────

function analyzeFormatting({ text, meta, source, sectionInfo, wordCount }) {
  const items = [];
  const push = (id, label, status, message, problem, suggestion) => items.push({ id, label, status, message, problem, suggestion });
  const lines = text.split('\n').filter((l) => l.trim());
  let penalty = 0;
  const notes = [];

  const builder = source === 'builder';

  // readable text (always true here — scanned PDFs are rejected earlier)
  push('readable-text', 'Selectable text', 'good', builder ? 'Resume is generated from structured NextHire data.' : 'Text was extracted cleanly from the file.');

  if (!builder) {
    // columns
    const stripDates = (s) => s.replace(DATE_RE, ' ');
    let columnLike = 0;
    for (const l of lines) {
      if (!/\S {3,}\S/.test(l)) continue;
      const parts = stripDates(l).split(/ {3,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2 && parts.filter((p) => wordsOf(p) >= 2).length >= 2) columnLike += 1;
    }
    const ratio = lines.length ? columnLike / lines.length : 0;
    if (columnLike >= 6 && ratio >= 0.3) {
      penalty += 3;
      push('columns', 'Single-column layout', 'problem', 'Many lines look like side-by-side columns.', 'Multi-column layouts are often read left-to-right across both columns by ATS parsers, which scrambles sentences and merges unrelated sections.', 'Switch to a single-column layout. Put skills, education and experience one below the other.');
    } else if (columnLike >= 4 && ratio >= 0.12) {
      penalty += 1.5;
      push('columns', 'Single-column layout', 'warning', 'Some parts of the resume look like they are laid out in columns.', 'Columns or tab-aligned blocks can be read out of order by some ATS parsers.', 'Prefer a single column. If you keep a skills grid, make sure each skill is still readable as plain text.');
    } else {
      push('columns', 'Single-column layout', 'good', 'Text flows in a single reading order.');
    }

    // tables
    if (meta.tables >= 2) {
      penalty += 2.5;
      push('tables', 'No tables', 'problem', `${meta.tables} tables were found in the document.`, 'Many ATS tools skip or scramble table content, so skills or experience placed inside tables may not be read.', 'Replace tables with plain headings and bullet points.');
    } else if (meta.tables === 1) {
      penalty += 1;
      push('tables', 'No tables', 'warning', 'One table was found in the document.', 'Content inside tables may be skipped or reordered by some ATS parsers.', 'Move the table content into normal paragraphs or bullets.');
    } else {
      push('tables', 'No tables', 'good', 'No tables detected.');
    }

    // images
    if (meta.images >= 3) {
      penalty += 1.5;
      push('graphics', 'Minimal graphics', 'problem', `${meta.images} images/graphics were found.`, 'Text inside images (logos, skill bars, icons) is invisible to an ATS and adds noise.', 'Remove skill bars, icons and decorative images. Write skills as text.');
    } else if (meta.images >= 1) {
      penalty += 0.5;
      push('graphics', 'Minimal graphics', 'warning', `${meta.images} image(s) found in the document.`, 'Anything written inside an image cannot be read by an ATS.', 'Make sure no important text (name, contact details, skills) lives inside an image.');
    } else {
      push('graphics', 'Minimal graphics', 'good', meta.fileType === 'docx' ? 'No embedded images detected.' : 'No image-only content detected.');
    }

    // symbols & garbled characters
    const compact = text.replace(/\s/g, '');
    const odd = (compact.match(/[^\p{L}\p{N}\s.,;:()\-–—'"/&+#@%•|_[\]!?$₹*=<>€£]/gu) || []).length;
    const oddRatio = compact.length ? odd / compact.length : 0;
    const garbled = (text.match(/\uFFFD/g) || []).length;
    if (garbled > 3 || oddRatio > 0.03) {
      penalty += 2;
      push('symbols', 'Standard characters', 'problem', 'Unusual or unreadable characters were found in the extracted text.', 'Decorative icons, custom fonts or symbol bullets can turn into garbled characters when an ATS reads the file.', 'Use plain bullets (•, -) and standard fonts such as Arial, Calibri or Times New Roman. Avoid emoji and icon fonts.');
    } else if (oddRatio > 0.01) {
      penalty += 1;
      push('symbols', 'Standard characters', 'warning', 'A few unusual symbols were found.', 'Uncommon symbols may not be recognised by older ATS software.', 'Replace decorative symbols with standard bullets or plain text.');
    } else {
      push('symbols', 'Standard characters', 'good', 'No problematic characters detected.');
    }

    // headings
    const recognised = sectionInfo.headingCount;
    if (recognised < 3) {
      penalty += 3;
      push('headings', 'Standard section headings', 'problem', `Only ${recognised} standard section heading(s) could be recognised.`, 'ATS software relies on familiar headings (Education, Experience, Skills…) to file your information in the right place.', 'Use plain, standard headings such as Education, Experience, Projects, Skills, Certifications.');
    } else {
      push('headings', 'Standard section headings', 'good', `${recognised} standard section headings recognised.`);
    }

    // non-standard all-caps headings
    const maybeHeadings = lines
      .slice(3)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z &/-]{4,40}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 4 && !matchHeading(l) && !/\d/.test(l));
    if (maybeHeadings.length) {
      penalty += 0.5;
      const shown = [...new Set(maybeHeadings)].slice(0, 3).join(', ');
      push('custom-headings', 'Consistent heading names', 'warning', `Possible non-standard headings: ${shown}.`, 'Creative heading names (e.g. "My Journey") may not be mapped to a standard section by an ATS.', 'Rename them to standard headings, e.g. "Experience" or "Projects". Ignore this if those lines are not headings.');
    }

    // page length
    if (meta.pages > 2) {
      penalty += 1;
      push('length', 'Resume length', 'warning', `The PDF has ${meta.pages} pages.`, 'Long resumes dilute keywords and are rarely read fully, especially for early-career roles.', 'Aim for one page (two at most) and keep the most relevant content.');
    } else if (wordCount < 150) {
      penalty += 2;
      push('length', 'Resume length', 'problem', `Only ${wordCount} words were found.`, 'Very short resumes give an ATS too little to match against.', 'Add detail to your projects, skills and experience.');
    } else if (wordCount > 1100) {
      penalty += 1;
      push('length', 'Resume length', 'warning', `The resume has about ${wordCount} words.`, 'Very dense resumes are harder to parse and skim.', 'Trim older or less relevant content so the key points stand out.');
    } else {
      push('length', 'Resume length', 'good', meta.pages ? `${meta.pages} page(s), ${wordCount} words.` : `About ${wordCount} words.`);
    }
  } else {
    push('structure', 'Standard structure', 'good', 'NextHire builder resumes use standard section headings in a single column.');
  }

  // bullet usage & long paragraphs (apply to both sources)
  const bulletCount = lines.filter(isBulletLine).length;
  const hasDetailSections = Boolean(sectionInfo.sections.experience || sectionInfo.sections.projects);
  if (hasDetailSections && bulletCount < 4) {
    penalty += 1;
    push('bullets', 'Bullet points', 'warning', `Only ${bulletCount} bullet point(s) found in a resume with experience/projects.`, 'Short bullets are easier for both ATS parsers and recruiters to scan than long paragraphs.', 'Describe each project or role in 2–4 short bullet points that start with an action verb.');
  } else {
    push('bullets', 'Bullet points', 'good', `${bulletCount} bullet point(s) found.`);
  }

  const detail = `${sectionInfo.sections.experience || ''}\n${sectionInfo.sections.projects || ''}`.split('\n').filter((l) => l.trim());
  const longParas = detail.filter((l) => !isBulletLine(l) && l.length > 280).length;
  if (longParas > 0) {
    penalty += 1;
    push('paragraphs', 'Concise descriptions', 'warning', `${longParas} very long paragraph(s) in experience/projects.`, 'Long blocks of text bury keywords and achievements.', 'Break long paragraphs into short bullets of one line or two.');
  } else {
    push('paragraphs', 'Concise descriptions', 'good', 'No overly long paragraphs detected.');
  }

  if (!builder) {
    notes.push('Fonts, header/footer content and graphics cannot be fully verified from extracted text — keep contact details in the main body of the page, not in a header or footer.');
  }

  return { items, score: round1(clamp(10 - penalty, 0, 10)), notes };
}

// ───────────────────────────── main analysis ─────────────────────────────

function gradeFor(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs improvement';
}

/**
 * @param {object} p
 * @param {string} p.text            cleaned resume text
 * @param {string} [p.jobDescription]
 * @param {'upload'|'builder'} [p.source]
 * @param {{fileType?:string,pages?:number,tables?:number,images?:number}} [p.meta]
 */
function analyze({ text, jobDescription = '', source = 'upload', meta = {} }) {
  if (!text || !text.trim()) throw new AtsError('No resume text to analyze.', 422, 'NO_TEXT');
  const m = { fileType: meta.fileType || '', pages: meta.pages || 0, tables: meta.tables || 0, images: meta.images || 0 };
  const jd = (jobDescription || '').trim();

  const sectionInfo = splitSections(text);
  const { sections: secText } = sectionInfo;
  const lines = text.split('\n').filter((l) => l.trim());
  const wordCount = wordsOf(text);
  const parserWeak = sectionInfo.headingCount < 2; // headings could not be reliably detected

  // ── skills in the resume
  const resumeSkills = findSkills(text);
  const resumeSkillNames = new Set(resumeSkills.keys());
  const technical = [...resumeSkills.values()].filter((v) => TECHNICAL_TYPES.has(v.entry.type));
  const skillBuckets = { programmingLanguages: [], frameworks: [], databases: [], tools: [], otherSkills: [] };
  technical
    .sort((a, b) => b.count - a.count || a.entry.name.localeCompare(b.entry.name))
    .forEach((v) => skillBuckets[SKILL_CATEGORY[v.entry.type]].push(v.entry.name));
  const softSkills = [...resumeSkills.values()].filter((v) => v.entry.type === TYPES.SOFT).map((v) => v.entry.name).sort();
  const certMentions = [...resumeSkills.values()].filter((v) => v.entry.type === TYPES.CERT).map((v) => v.entry.name).sort();

  // ── job description keywords
  let jdKeywords = [];
  let mode = 'general';
  const notes = [];
  if (jd) {
    jdKeywords = extractJobKeywords(jd);
    if (jdKeywords.length > 0) mode = 'job-match';
    else notes.push('No recognisable skills or keywords were found in the job description, so a general resume analysis was done instead. Paste the full job description for a role-specific match.');
  }

  const matched = [];
  const missing = [];
  for (const k of jdKeywords) {
    const inResume = k.inferred ? findLiteral(text, k.name) : resumeSkills.get(k.name)?.count || 0;
    if (inResume > 0) matched.push({ ...k, resumeMentions: inResume });
    else {
      const rel = k.inferred ? [] : relatedNames(k.name).filter((n) => resumeSkillNames.has(n));
      const entryType = k.type;
      let advice = 'gap';
      if (rel.length > 0 || entryType === TYPES.SOFT || entryType === TYPES.DOMAIN) advice = 'related';
      missing.push({ ...k, advice, relatedTo: rel.slice(0, 3), resumeMentions: 0 });
    }
  }

  // ── sections
  const hasContent = {
    education: /\b(?:b\.?\s?tech|b\.?\s?e\b|bachelor|m\.?\s?tech|master|mba|b\.?\s?sc|m\.?\s?sc|bca|mca|diploma|cgpa|gpa|university|institute|college|12th|10th|hsc|ssc)\b/i.test(text),
    experience: /\b(?:intern(?:ship)?|worked at|work experience|trainee|full[- ]time|part[- ]time|freelanc\w*|employed)\b/i.test(text),
    projects: /\bproject(?:s)?\b/i.test(text) || /\b(?:github\.com|built a|developed a|developed an|built an)\b/i.test(text),
    skills: technical.length >= 3,
    certifications: /\b(?:certified|certificate|certification|coursera|nptel|udemy|edx)\b/i.test(text) || certMentions.length > 0,
    achievements: /\b(?:won|winner|rank(?:ed)?|hackathon|award|scholarship|finalist|topper|secured\s+\d)\b/i.test(text),
    summary: false,
  };
  const sectionStatus = {};
  const sectionList = SECTION_DEFS.map((d) => {
    let status = 'missing';
    let note = '';
    if (secText[d.key] !== undefined && (secText[d.key].length > 0 || sectionInfo.order.includes(d.key))) {
      status = secText[d.key].length > 15 ? 'found' : 'uncertain';
      if (status === 'uncertain') note = 'A heading was found but little content under it.';
    } else if (hasContent[d.key]) {
      status = 'uncertain';
      note = 'Related content was found, but no clear "' + d.label + '" heading — an ATS may not file it correctly.';
    } else if (parserWeak) {
      status = 'uncertain';
      note = 'Section headings could not be read reliably, so this section could not be confirmed.';
    }
    sectionStatus[d.key] = status;
    return { key: d.key, label: d.label, status, note };
  });
  const contact = analyzeContact(text, secText.header || '');
  const contactFound = contact.email || contact.phone;
  sectionList.unshift({
    key: 'contact',
    label: 'Contact Information',
    status: contact.email && contact.phone ? 'found' : contactFound ? 'uncertain' : parserWeak ? 'uncertain' : 'missing',
    note: contact.email && contact.phone ? '' : !contact.email && !contact.phone ? 'No email or phone number could be extracted.' : `Could not extract your ${contact.email ? 'phone number' : 'email'}.`,
  });
  sectionList.push({
    key: 'links',
    label: 'Links (LinkedIn / GitHub / Portfolio)',
    status: contact.anyLink ? 'found' : 'missing',
    note: contact.anyLink ? '' : 'No LinkedIn, GitHub or portfolio link found.',
  });

  // ── formatting
  const fmt = analyzeFormatting({ text, meta: m, source, sectionInfo, wordCount });

  // ── content: summary
  const summaryText = secText.summary || '';
  const summaryWords = wordsOf(summaryText);
  const summaryFindings = [];
  const summaryKeywordHits = jd && mode === 'job-match' ? matched.filter((k) => findLiteral(summaryText, k.name) > 0 || (!k.inferred && findSkills(summaryText).has(k.name))).length : 0;
  if (!summaryText) summaryFindings.push({ status: 'problem', text: 'No professional summary found.' });
  else {
    if (summaryWords < 20) summaryFindings.push({ status: 'warning', text: `Summary is very short (${summaryWords} words).` });
    else if (summaryWords > 90) summaryFindings.push({ status: 'warning', text: `Summary is long (${summaryWords} words) — 2–3 sentences works best.` });
    else summaryFindings.push({ status: 'good', text: `Summary length is good (${summaryWords} words).` });
    const generic = [...new Set((summaryText.match(GENERIC_SUMMARY_RE) || []).map((s) => s.toLowerCase()))];
    if (generic.length) summaryFindings.push({ status: 'warning', text: `Contains generic phrases (${generic.slice(0, 3).join(', ')}) that say little to an ATS or recruiter.` });
    if (mode === 'job-match') {
      summaryFindings.push(summaryKeywordHits >= 2 ? { status: 'good', text: `Summary mentions ${summaryKeywordHits} keywords from the job description.` } : { status: 'warning', text: 'Summary mentions few keywords from the job description.' });
    }
  }

  // ── content: experience & projects
  const expLines = statementLines(secText.experience);
  const projBlocks = splitProjectBlocks(secText.projects);
  const projLines = statementLines(secText.projects);
  const pool = [...expLines, ...projLines];
  const verbLines = pool.filter(startsWithActionVerb).length;
  const metricLines = pool.filter((l) => METRIC_RE.test(l)).length;
  const weakStarts = pool.filter((l) => WEAK_START_RE.test(stripBullet(l)));
  const verbRatio = pool.length ? verbLines / pool.length : 0;

  const expFindings = [];
  if (!secText.experience) {
    expFindings.push({ status: sectionStatus.experience === 'uncertain' ? 'warning' : 'problem', text: sectionStatus.experience === 'uncertain' ? 'Experience could not be confirmed (no clear heading found).' : 'No experience section found. Internships, freelance work, open-source or training count.' });
  } else {
    const titleFound = /\b(?:intern|engineer|developer|analyst|trainee|associate|manager|lead|consultant|researcher|volunteer|member|coordinator|executive|assistant|designer|administrator)\b/i.test(secText.experience);
    const dates = (secText.experience.match(DATE_RE) || []).length;
    expFindings.push({ status: titleFound ? 'good' : 'warning', text: titleFound ? 'Job titles detected.' : 'No clear job title detected — state your role (e.g. "Software Engineering Intern").' });
    expFindings.push({ status: dates ? 'good' : 'warning', text: dates ? 'Dates/durations detected.' : 'No dates or duration found for the experience entries.' });
    expFindings.push({ status: expLines.length >= 2 ? 'good' : 'warning', text: `${expLines.length} description line(s) found.` });
  }
  if (pool.length) {
    expFindings.push({ status: verbRatio >= 0.7 ? 'good' : verbRatio >= 0.4 ? 'warning' : 'problem', text: `${verbLines} of ${pool.length} bullet(s) start with a strong action verb.` });
    expFindings.push({ status: metricLines >= 3 ? 'good' : metricLines >= 1 ? 'warning' : 'problem', text: `${metricLines} bullet(s) include measurable results (numbers, %, scale).` });
  }

  const projFindings = [];
  const projWithTech = projBlocks.filter((b) => findSkills(b.lines.join('\n')).size > 0 || /\b(?:tech|stack|built with)\b/i.test(b.lines.join(' '))).length;
  const projWithDesc = projBlocks.filter((b) => b.bullets > 0 || b.desc > 0).length;
  const projWithMetric = projBlocks.filter((b) => METRIC_RE.test(b.lines.join(' '))).length;
  if (!secText.projects) {
    projFindings.push({ status: sectionStatus.projects === 'uncertain' ? 'warning' : 'problem', text: sectionStatus.projects === 'uncertain' ? 'Projects could not be confirmed (no clear heading found).' : 'No projects section found — projects are the main proof of skill for students.' });
  } else {
    projFindings.push({ status: projBlocks.length >= 2 ? 'good' : 'warning', text: `${projBlocks.length} project(s) detected${projBlocks.length < 2 ? ' — 2–3 solid projects are recommended' : ''}.` });
    if (projBlocks.length) {
      projFindings.push({ status: projWithTech === projBlocks.length ? 'good' : 'warning', text: `${projWithTech} of ${projBlocks.length} project(s) list technologies used.` });
      projFindings.push({ status: projWithDesc === projBlocks.length ? 'good' : 'warning', text: `${projWithDesc} of ${projBlocks.length} project(s) have a description.` });
      projFindings.push({ status: projWithMetric > 0 ? 'good' : 'warning', text: projWithMetric > 0 ? `${projWithMetric} project(s) show measurable impact.` : 'No project mentions measurable impact (users, speed, accuracy, scale…).' });
      if (mode === 'job-match') {
        const rel = projBlocks.filter((b) => matched.some((k) => findLiteral(b.lines.join(' '), k.name) > 0)).length;
        projFindings.push({ status: rel > 0 ? 'good' : 'warning', text: `${rel} of ${projBlocks.length} project(s) use keywords from the job description.` });
      }
    }
  }

  // ── content: skills
  const skillItems = parseSkillItems(secText.skills);
  const lowerItems = skillItems.map((s) => s.toLowerCase());
  const dupes = [...new Set(lowerItems.filter((s, i) => lowerItems.indexOf(s) !== i))];
  const skillFindings = [];
  if (!secText.skills) {
    skillFindings.push({ status: sectionStatus.skills === 'uncertain' ? 'warning' : 'problem', text: sectionStatus.skills === 'uncertain' ? 'A skills section could not be confirmed (no clear heading found).' : 'No skills section found.' });
  } else {
    skillFindings.push({ status: technical.length >= 6 ? 'good' : 'warning', text: `${technical.length} recognised technical skills across the resume.` });
    if (skillItems.length > 40) skillFindings.push({ status: 'warning', text: `Skills section lists ${skillItems.length} items — a very long list looks like keyword stuffing. Keep the most relevant.` });
    if (dupes.length) skillFindings.push({ status: 'warning', text: `Duplicate skills listed: ${dupes.slice(0, 5).join(', ')}.` });
    else skillFindings.push({ status: 'good', text: 'No duplicate skills.' });
  }
  const cats = Object.entries(skillBuckets).filter(([, v]) => v.length).length;
  if (mode === 'job-match') {
    const techJd = jdKeywords.filter((k) => k.type !== TYPES.SOFT && k.type !== TYPES.DOMAIN && k.type !== TYPES.CERT);
    const techMatched = matched.filter((k) => techJd.includes(k) || techJd.some((t) => t.name === k.name)).length;
    skillFindings.push({ status: techJd.length && techMatched / techJd.length >= 0.6 ? 'good' : 'warning', text: `${techMatched} of ${techJd.length} technical skills in the job description appear in your resume.` });
  }

  // ── content: education
  const eduSource = secText.education || (sectionStatus.education === 'uncertain' ? text : '');
  const eduFlags = {
    degree: /\b(?:b\.?\s?tech|b\.?\s?e\b|bachelor\w*|m\.?\s?tech|master\w*|mba|b\.?\s?sc|m\.?\s?sc|bca|mca|diploma|ph\.?d|b\.?\s?com|12th|hsc|class xii)\b/i.test(eduSource),
    institution: /\b(?:university|institute|college|school|academy|iit|nit|iiit|vidyalaya|polytechnic)\b/i.test(eduSource),
    year: /\b(?:19|20)\d{2}\b/.test(eduSource),
    cgpa: /\b(?:cgpa|gpa|percentage|percent|\d{1,2}(?:\.\d+)?\s?\/\s?10|\d{2}(?:\.\d+)?\s?%)/i.test(eduSource),
  };
  const eduFindings = [];
  if (!eduSource) eduFindings.push({ status: 'problem', text: 'No education details found.' });
  else {
    eduFindings.push({ status: eduFlags.degree ? 'good' : 'warning', text: eduFlags.degree ? 'Degree detected.' : 'Degree/qualification name not detected.' });
    eduFindings.push({ status: eduFlags.institution ? 'good' : 'warning', text: eduFlags.institution ? 'Institution detected.' : 'Institution name not detected.' });
    eduFindings.push({ status: eduFlags.year ? 'good' : 'warning', text: eduFlags.year ? 'Graduation year/duration detected.' : 'No graduation year found.' });
    eduFindings.push({ status: eduFlags.cgpa ? 'good' : 'warning', text: eduFlags.cgpa ? 'CGPA / percentage detected.' : 'No CGPA or percentage found (recommended for campus hiring).' });
  }

  // ───────────── scoring ─────────────
  const breakdown = [];

  // 1. Keyword match (30)
  let keywordPct;
  let keywordExplain;
  if (mode === 'job-match') {
    const total = jdKeywords.reduce((s, k) => s + k.importance, 0);
    const got = matched.reduce((s, k) => s + k.importance, 0);
    keywordPct = total ? got / total : 0;
    keywordExplain = `${matched.length} of ${jdKeywords.length} job-description keywords found in your resume (required keywords count double).`;
  } else {
    keywordPct = clamp(technical.length / 18, 0, 1);
    keywordExplain = `General mode (no job description): ${technical.length} recognised technical keywords. Around 18 gives full marks.`;
  }
  breakdown.push({ key: 'keywords', label: 'Keyword Match', score: Math.round(keywordPct * 30), max: 30, explanation: keywordExplain });

  // 2. Skills match (20)
  let skillsPct;
  let skillsExplain;
  const techJd = jdKeywords.filter((k) => !['soft', 'domain', 'certification'].includes(k.type));
  if (mode === 'job-match' && techJd.length > 0) {
    let credit = 0;
    let close = 0;
    for (const k of techJd) {
      if (resumeSkillNames.has(k.name) || (k.inferred && findLiteral(text, k.name) > 0)) credit += 1;
      else if (!k.inferred && relatedNames(k.name).some((n) => resumeSkillNames.has(n))) {
        credit += 0.5;
        close += 1;
      }
    }
    skillsPct = credit / techJd.length;
    skillsExplain = `${techJd.length} technical skills requested; you match ${techJd.filter((k) => resumeSkillNames.has(k.name) || (k.inferred && findLiteral(text, k.name) > 0)).length}${close ? ` and have a closely related skill for ${close} more (half credit)` : ''}.`;
  } else if (mode === 'job-match') {
    skillsPct = clamp(technical.length / 10, 0, 1);
    skillsExplain = 'The job description lists no technical skills, so your technical skill breadth was scored instead.';
  } else {
    skillsPct = cats / 5;
    skillsExplain = `General mode: skills found in ${cats} of 5 categories (languages, frameworks, databases, tools, concepts).`;
  }
  breakdown.push({ key: 'skills', label: 'Skills Match', score: Math.round(skillsPct * 20), max: 20, explanation: skillsExplain });

  // 3. Completeness (15)
  const credit = (key, pts) => (sectionStatus[key] === 'found' ? pts : sectionStatus[key] === 'uncertain' ? pts / 2 : 0);
  const completeness = credit('summary', 2) + credit('education', 3) + credit('experience', 2) + credit('projects', 3) + credit('skills', 3) + credit('certifications', 1) + credit('achievements', 1);
  const missingSecs = SECTION_DEFS.filter((d) => sectionStatus[d.key] === 'missing').map((d) => d.label);
  breakdown.push({
    key: 'completeness',
    label: 'Resume Completeness',
    score: Math.round(completeness),
    max: 15,
    explanation: missingSecs.length ? `Missing sections: ${missingSecs.join(', ')}.` : 'All key sections are present.',
  });

  // 4. Experience relevance (10)
  let expScore = 0;
  let expExplain;
  if (pool.length === 0) {
    expExplain = 'No experience or project descriptions were found to evaluate.';
  } else {
    const verbPts = 3 * clamp(verbRatio / 0.7, 0, 1);
    const metricPts = 3 * clamp(metricLines / 3, 0, 1);
    let relPts;
    const poolText = `${secText.experience || ''}\n${secText.projects || ''}`;
    if (mode === 'job-match') {
      const total = jdKeywords.reduce((s, k) => s + k.importance, 0);
      const poolSkills = findSkills(poolText);
      const inPool = jdKeywords.reduce((s, k) => {
        const hit = k.inferred ? findLiteral(poolText, k.name) > 0 : poolSkills.has(k.name);
        return s + (hit ? k.importance : 0);
      }, 0);
      relPts = 4 * (total ? inPool / total : 0);
    } else {
      relPts = 4 * clamp([...findSkills(poolText).values()].filter((v) => TECHNICAL_TYPES.has(v.entry.type)).length / 6, 0, 1);
    }
    expScore = verbPts + metricPts + relPts;
    expExplain = `Action verbs ${round1(verbPts)}/3 · measurable results ${round1(metricPts)}/3 · ${mode === 'job-match' ? 'relevance to the job' : 'technologies shown in use'} ${round1(relPts)}/4.`;
  }
  breakdown.push({ key: 'experience', label: 'Experience Relevance', score: Math.round(expScore), max: 10, explanation: expExplain });

  // 5. Education (10)
  const eduScore = (eduFlags.degree ? 4 : 0) + (eduFlags.institution ? 2 : 0) + (eduFlags.year ? 2 : 0) + (eduFlags.cgpa ? 2 : 0);
  const eduMissing = Object.entries({ degree: 'degree', institution: 'institution', year: 'year', cgpa: 'CGPA/percentage' }).filter(([k]) => !eduFlags[k]).map(([, v]) => v);
  breakdown.push({
    key: 'education',
    label: 'Education',
    score: eduSource ? eduScore : 0,
    max: 10,
    explanation: !eduSource ? 'No education details found.' : eduMissing.length ? `Not detected: ${eduMissing.join(', ')}.` : 'Degree, institution, year and CGPA all detected.',
  });

  // 6. Formatting (10)
  const fmtProblems = fmt.items.filter((i) => i.status !== 'good').length;
  breakdown.push({
    key: 'formatting',
    label: 'ATS Formatting',
    score: Math.round(fmt.score),
    max: 10,
    explanation: fmtProblems ? `${fmtProblems} formatting check(s) need attention.` : 'No formatting problems detected.',
  });

  // 7. Contact (5)
  const contactScore = (contact.email ? 2 : 0) + (contact.phone ? 1 : 0) + (contact.linkedin ? 1 : 0) + (contact.github || contact.portfolio ? 1 : 0);
  const contactMissing = [!contact.email && 'email', !contact.phone && 'phone number', !contact.linkedin && 'LinkedIn', !(contact.github || contact.portfolio) && 'GitHub/portfolio'].filter(Boolean);
  breakdown.push({
    key: 'contact',
    label: 'Contact Information',
    score: contactScore,
    max: 5,
    explanation: contactMissing.length ? `Not found: ${contactMissing.join(', ')}.` : 'Email, phone, LinkedIn and GitHub/portfolio all found.',
  });

  breakdown.forEach((b) => {
    b.percent = Math.round((b.score / b.max) * 100);
  });
  const score = breakdown.reduce((s, b) => s + b.score, 0);

  // ───────────── suggestions ─────────────
  const suggestions = [];
  const sug = (priority, category, title, detail) => suggestions.push({ priority, category, title, detail });

  if (mode === 'general' && !jd) {
    sug('low', 'Job match', 'Add a job description for a role-specific score', 'You ran a general analysis. Paste the job description of a role you are targeting to see which keywords and skills you are missing for that exact job.');
  }
  if (mode === 'job-match') {
    const relMissing = missing.filter((k) => k.advice === 'related').sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
    const gapMissing = missing.filter((k) => k.advice === 'gap').sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
    if (relMissing.length) {
      const top = relMissing.slice(0, 5);
      const withRel = top.filter((k) => k.relatedTo.length);
      sug(
        top.some((k) => k.priority === 'required') ? 'high' : 'medium',
        'Keywords',
        `Add related keywords you may already have: ${top.map((k) => k.name).join(', ')}`,
        withRel.length
          ? `Your resume already shows ${withRel.map((k) => `${k.relatedTo.join('/')}`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')}. The job description also asks for ${top.map((k) => k.name).join(', ')}. If you have genuinely used or practised these, name them in your Skills section and in a project or experience bullet.`
          : `The job description asks for ${top.map((k) => k.name).join(', ')}. If you have genuinely demonstrated these, show them in a project or experience bullet, not just in a list.`
      );
    }
    if (gapMissing.length) {
      const top = gapMissing.slice(0, 5);
      sug(
        top.some((k) => k.priority === 'required') ? 'medium' : 'low',
        'Skill gaps',
        `Skill gaps for this role: ${top.map((k) => k.name).join(', ')}`,
        'Nothing in your resume shows these yet. Only add them if you have real experience. If you do not, a small project that uses them is the honest way to close the gap — then list it with measurable results.'
      );
    }
  }
  for (const d of SECTION_DEFS) {
    const st = sectionStatus[d.key];
    if (st === 'missing') {
      const tips = {
        summary: ['medium', 'Add a 2–3 line professional summary with your target role, strongest skills and one achievement.'],
        education: ['high', 'Add an Education section with degree, institution, year and CGPA.'],
        experience: ['medium', 'Add an Experience section — internships, freelance work, open-source contributions or training all count. If you have none, strengthen the Projects section.'],
        projects: ['high', 'Add 2–3 projects with the tech stack used and what the project achieved.'],
        skills: ['high', 'Add a Skills section grouped by category (languages, frameworks, databases, tools).'],
        certifications: ['low', 'Add relevant certifications or courses (NPTEL, Coursera, vendor certifications) if you have them.'],
        achievements: ['low', 'Add achievements such as hackathons, competitive-programming ranks, scholarships or leadership roles if you have them.'],
      }[d.key];
      sug(tips[0], 'Sections', `Add ${/^[AEIOU]/i.test(d.label) ? 'an' : 'a'} ${d.label} section`, tips[1]);
    } else if (st === 'uncertain' && !parserWeak && secText[d.key] === undefined && hasContent[d.key]) {
      sug('medium', 'Sections', `Add a clear "${d.label}" heading`, `Content related to ${d.label.toLowerCase()} was found but without a standard heading. Use the plain heading "${d.synonyms[0].replace(/^./, (c) => c.toUpperCase())}" so an ATS can file it correctly.`);
    }
  }
  if (!contact.email) sug('high', 'Contact', 'Add a professional email address', 'No email could be extracted. Put it in the main body of the page (not in a header/footer) as plain text.');
  if (!contact.phone) sug('medium', 'Contact', 'Add a phone number', source === 'builder' ? 'The NextHire builder has no phone field, so add your number when you export or share the resume.' : 'No phone number could be extracted. Add it near your email as plain text.');
  if (!contact.linkedin) sug('low', 'Contact', 'Add your LinkedIn profile URL', 'Recruiters often check LinkedIn; include the full link as plain text.');
  if (!contact.github && !contact.portfolio) sug('low', 'Contact', 'Add a GitHub or portfolio link', 'For technical roles, a GitHub or portfolio link backs up your projects.');

  if (pool.length) {
    if (metricLines < 3) {
      const example = pool.find((l) => !METRIC_RE.test(l) && l.length > 25);
      sug('high', 'Impact', `Quantify your results (only ${metricLines} of ${pool.length} bullets have numbers)`, `Add scale or outcomes — users, speed-ups, accuracy, number of records, % improvement.${example ? ` For example, rewrite “${truncate(example, 90)}” to say how much, how many or how fast.` : ''}`);
    }
    if (verbRatio < 0.7) {
      const weak = weakStarts[0];
      sug('medium', 'Wording', `Start more bullets with strong action verbs (${verbLines} of ${pool.length} do)`, `Use verbs like Built, Designed, Implemented, Optimized, Deployed.${weak ? ` “${truncate(weak, 70)}” starts with a weak phrase — rewrite it with an action verb.` : ''}`);
    }
  }
  if (secText.summary) {
    if (summaryWords < 20) sug('medium', 'Summary', 'Expand your professional summary', `It is only ${summaryWords} words. Aim for 2–3 sentences covering your target role, key skills and strongest result.`);
    else if (summaryWords > 90) sug('low', 'Summary', 'Shorten your professional summary', `It is ${summaryWords} words. Keep it to 2–3 sentences.`);
    if (mode === 'job-match' && summaryKeywordHits < 2) sug('medium', 'Summary', 'Align your summary with the job description', 'Mention the role and your two or three most relevant matching skills in the first lines.');
  }
  if (secText.projects && projBlocks.length > 0) {
    if (projWithTech < projBlocks.length) sug('medium', 'Projects', 'State the tech stack for every project', `${projBlocks.length - projWithTech} of ${projBlocks.length} project(s) do not clearly list the technologies used — ATS keyword matching depends on this.`);
    if (projBlocks.length < 2) sug('low', 'Projects', 'Add one or two more projects', 'Two to three well-described projects make a stronger case than one.');
  }
  if (dupes.length) sug('low', 'Skills', 'Remove duplicate skills', `Listed more than once: ${dupes.slice(0, 5).join(', ')}.`);
  if (secText.education) {
    const eduGaps = eduMissing;
    if (eduGaps.length) sug('low', 'Education', `Complete your education details (${eduGaps.join(', ')})`, 'Degree, institution, year and CGPA/percentage are the standard fields recruiters and ATS filters look for.');
  }
  for (const item of fmt.items) {
    if (item.status === 'good') continue;
    sug(item.status === 'problem' ? 'high' : 'medium', 'Formatting', `Fix formatting: ${item.label}`, `${item.problem} ${item.suggestion}`);
  }

  const order = { high: 0, medium: 1, low: 2 };
  const seen = new Set();
  const finalSuggestions = suggestions
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => order[a.priority] - order[b.priority] || a._i - b._i)
    .filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true)))
    .slice(0, 12)
    .map(({ _i, ...rest }, idx) => ({ id: idx + 1, ...rest }));

  if (source === 'upload') notes.push(...fmt.notes);
  if (parserWeak) notes.push('Few standard section headings could be detected, so some sections are marked "unconfirmed" rather than "missing".');

  const matchedPct = mode === 'job-match' ? Math.round(breakdown[0].percent) : null;
  const jdCount = (arr) => arr.length;

  return {
    score,
    grade: gradeFor(score),
    mode,
    source,
    jobDescriptionProvided: Boolean(jd),
    fileType: m.fileType,
    breakdown,
    keywordMatch: breakdown[0].percent,
    skillsMatch: breakdown[1].percent,
    completenessScore: breakdown[2].percent,
    formattingScore: breakdown[5].percent,
    keywords: {
      matchPercent: mode === 'job-match' ? matchedPct : null,
      totalJobKeywords: jdCount(jdKeywords),
      matched: matched.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name)),
      missing: missing.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name)),
    },
    skills: {
      ...skillBuckets,
      soft: softSkills,
      matched: mode === 'job-match' ? techJd.filter((k) => resumeSkillNames.has(k.name) || (k.inferred && findLiteral(text, k.name) > 0)).map((k) => k.name) : [],
      missing: mode === 'job-match' ? techJd.filter((k) => !(resumeSkillNames.has(k.name) || (k.inferred && findLiteral(text, k.name) > 0))).map((k) => k.name) : [],
      additional: mode === 'job-match' ? technical.map((v) => v.entry.name).filter((n) => !jdKeywords.some((k) => k.name === n)) : [],
    },
    sections: sectionList,
    formatting: fmt.items,
    content: {
      summary: { status: !summaryText ? 'problem' : summaryFindings.some((f) => f.status === 'warning') ? 'warning' : 'good', findings: summaryFindings },
      experience: { status: expFindings.some((f) => f.status === 'problem') ? 'problem' : expFindings.some((f) => f.status === 'warning') ? 'warning' : 'good', findings: expFindings },
      projects: { status: projFindings.some((f) => f.status === 'problem') ? 'problem' : projFindings.some((f) => f.status === 'warning') ? 'warning' : 'good', findings: projFindings },
      skills: { status: skillFindings.some((f) => f.status === 'problem') ? 'problem' : skillFindings.some((f) => f.status === 'warning') ? 'warning' : 'good', findings: skillFindings },
      education: { status: eduFindings.some((f) => f.status === 'problem') ? 'problem' : eduFindings.some((f) => f.status === 'warning') ? 'warning' : 'good', findings: eduFindings },
    },
    contact: { email: contact.email, phone: contact.phone, linkedin: contact.linkedin, github: contact.github, portfolio: contact.portfolio },
    suggestions: finalSuggestions,
    stats: { wordCount, pages: m.pages, bulletPoints: lines.filter(isBulletLine).length, measurableBullets: metricLines, actionVerbBullets: verbLines, statementBullets: pool.length },
    notes,
  };
}

// ───────────────────────────── builder resume → text ─────────────────────────────

function toBullets(desc) {
  const s = String(desc || '').trim();
  if (!s) return [];
  let parts = s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].length > 140) parts = parts[0].split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.map((p) => `• ${stripBullet(p)}`);
}

/**
 * Renders a saved NextHire Resume document (plus basic account contact info) into plain text with standard
 * headings, so it flows through the same analysis pipeline as an uploaded file.
 */
function builderResumeToText(resume, user = {}) {
  const s = resume?.sections || {};
  const out = [];
  const contactBits = [user.email, user.linkedin, user.github].filter(Boolean);
  if (user.name) out.push(user.name);
  if (contactBits.length) out.push(contactBits.join(' | '));

  if ((s.summary || '').trim()) out.push('', 'SUMMARY', s.summary.trim());

  const edu = (s.education || []).filter((e) => e && (e.institution || e.degree));
  if (edu.length) {
    out.push('', 'EDUCATION');
    edu.forEach((e) => out.push([e.degree, e.institution].filter(Boolean).join(', ') + [e.year ? ` | ${e.year}` : '', e.cgpa ? ` | CGPA: ${e.cgpa}` : ''].join('')));
  }

  const exp = (s.experience || []).filter((e) => e && (e.company || e.role || e.description));
  if (exp.length) {
    out.push('', 'EXPERIENCE');
    exp.forEach((e) => {
      out.push([e.role, e.company].filter(Boolean).join(' — ') + (e.duration ? ` | ${e.duration}` : ''));
      out.push(...toBullets(e.description));
    });
  }

  const proj = (s.projects || []).filter((p) => p && (p.title || p.description));
  if (proj.length) {
    out.push('', 'PROJECTS');
    proj.forEach((p, i) => {
      if (i > 0) out.push('');
      out.push(p.title || 'Project');
      if ((p.techStack || []).length) out.push(`Tech Stack: ${p.techStack.join(', ')}`);
      out.push(...toBullets(p.description));
      if (p.link) out.push(p.link);
    });
  }

  const skills = (s.skills || []).map((x) => String(x).trim()).filter(Boolean);
  if (skills.length) out.push('', 'SKILLS', skills.join(', '));

  const certs = (s.certifications || []).filter((c) => c && c.title);
  if (certs.length) {
    out.push('', 'CERTIFICATIONS');
    certs.forEach((c) => out.push(`• ${c.title}${c.issuer ? ` — ${c.issuer}` : ''}${c.year ? ` (${c.year})` : ''}`));
  }

  const ach = (s.achievements || []).map((x) => String(x).trim()).filter(Boolean);
  if (ach.length) {
    out.push('', 'ACHIEVEMENTS');
    ach.forEach((a) => out.push(`• ${a}`));
  }
  return out.join('\n').trim();
}

module.exports = { analyze, builderResumeToText, extractJobKeywords, findSkills, splitSections, gradeFor };
