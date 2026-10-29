/**
 * mockExecutor.js — dependency-free "mock execution" for the Playground.
 *
 * Used for Python / C++ / Java (and as a last-resort fallback for JavaScript) so
 * the Playground works with NO external code-execution service.
 *
 * This is a small, SAFE simulator, not a real interpreter:
 *  - It NEVER evals or runs user code. It tokenises and evaluates a limited subset itself
 *    (print statements, variables, arithmetic, strings, f-strings, lists, loops, if/else,
 *    common builtins, stdin via input()/cin).
 *  - Calls to the user's own functions are computed only for a few well-known algorithms
 *    (two-sum, factorial, fibonacci, is-prime, gcd). Anything else that can't be
 *    simulated is shown as `<simulated: expression>` instead of failing.
 *  - Cheap static checks reproduce common errors (unbalanced brackets, missing main,
 *    Python 2 print, wrong public class name, NameError, ZeroDivisionError…).
 *
 * Every result carries mock:true / executionMode:'Mock Execution' plus a short note.
 */

const MAX_STEPS = 200000;
const MAX_OUTPUT = 100000;

/* ------------------------------------------------------------------ values */

class Flt { constructor(n) { this.n = n; } }                 // float (Python / Java / C++)
class Unknown { constructor(src) { this.src = src; } }       // value we can't compute
class Unsupported extends Error {}                           // can't simulate this construct
class SimError extends Error { constructor(type, msg) { super(msg); this.type = type; } }
class Signal { constructor(kind) { this.kind = kind; } }     // break / continue / return
class TimeoutSim extends Error {}

const val = (v) => { if (v instanceof Unknown) throw new Unsupported(); return v; };
const isNum = (v) => typeof v === 'number' || typeof v === 'bigint' || v instanceof Flt;
const numOf = (v) => (v instanceof Flt ? v.n : Number(v));

function truthy(v) {
  v = val(v);
  if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
  if (v instanceof Flt) return v.n !== 0;
  if (typeof v === 'bigint') return v !== 0n;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/* ---------------------------------------------------------------- utilities */

/** Removes comments (keeps newlines so line numbers survive). */
function stripComments(code, lang) {
  let out = '';
  let q = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (q) {
      out += c;
      if (c === '\\') { out += code[++i] || ''; } else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || (c === '`' && lang === 'JavaScript')) { q = c; out += c; continue; }
    if (lang === 'Python') {
      if (c === '#') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    } else if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      out += '\n';
      continue;
    } else if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') out += '\n'; i++; }
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** Splits on a delimiter at bracket depth 0 and outside string/char literals. */
function splitTop(s, delim) {
  const out = [];
  let depth = 0; let q = null; let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && s.startsWith(delim, i)) { out.push(s.slice(last, i)); i += delim.length - 1; last = i + 1; }
  }
  out.push(s.slice(last));
  return out;
}

/** Index of the bracket matching the one at `open` (string-aware); -1 if none. */
function findMatching(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (')]}'.includes(c)) { if (stack.pop() !== c) return -1; if (!stack.length) return i; }
  }
  return -1;
}

function unescapeStr(raw) {
  return raw.replace(/\\(n|t|r|0|\\|'|"|`)/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', "'": "'", '"': '"', '`': '`' }[c]));
}

function topLevelIndexOf(s, ch) {
  const parts = splitTop(s, ch);
  return parts.length > 1 ? parts[0].length : -1;
}

/* --------------------------------------------------------------- formatting */

function fltStr(n, lang) {
  if (Number.isNaN(n)) return lang === 'Python' ? 'nan' : 'NaN';
  if (!Number.isFinite(n)) return `${n < 0 ? '-' : ''}${lang === 'Python' ? 'inf' : 'Infinity'}`;
  if (lang === 'C++') return String(Number(n.toPrecision(6)));
  return Number.isInteger(n) && Math.abs(n) < 1e16 ? n.toFixed(1) : String(n);
}

/** Python str()/repr(), Java String.valueOf, C++ cout, JS console.log formatting. */
function fmt(v, lang, nested = false) {
  if (v instanceof Unknown) return `<simulated: ${v.src}>`;
  if (v === null || v === undefined) return { Python: 'None', Java: 'null', JavaScript: v === undefined ? 'undefined' : 'null', 'C++': '0' }[lang];
  if (typeof v === 'boolean') return lang === 'Python' ? (v ? 'True' : 'False') : lang === 'C++' ? (v ? '1' : '0') : String(v);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Flt) return fltStr(v.n, lang);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (!nested) return v;
    return lang === 'Python' ? `'${v}'` : lang === 'JavaScript' ? `'${v}'` : v;
  }
  if (Array.isArray(v)) {
    if (lang === 'C++') throw new Unsupported();
    const inner = v.map((x) => fmt(x, lang, true));
    if (lang === 'JavaScript') return inner.length ? `[ ${inner.join(', ')} ]` : '[]';
    if (lang === 'Python' && v.tuple) return `(${inner.join(', ')}${v.length === 1 ? ',' : ''})`;
    return `[${inner.join(', ')}]`;
  }
  return String(v);
}

/** printf / String.format / Python "%" formatting. */
function fmtPrintf(f, args, lang) {
  let ai = 0;
  return f.replace(/%([-+ 0#,]*)(\d+)?(?:\.(\d+))?(?:hh|h|ll|l|z|j|t|L)?([diouxXeEfFgGcsSb%n])/g, (m, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    if (conv === 'n') return '\n';
    if (ai >= args.length) {
      if (lang === 'Java') throw new SimError('MissingFormatArgumentException', `Format specifier '${m}'`);
      if (lang === 'Python') throw new SimError('TypeError', 'not enough arguments for format string');
      return m;
    }
    const a = val(args[ai++]);
    let s;
    const n = () => (typeof a === 'bigint' ? a : numOf(a));
    switch (conv) {
      case 'd': case 'i': case 'u': s = typeof a === 'bigint' ? a.toString() : String(Math.trunc(numOf(a))); break;
      case 'f': case 'F': s = numOf(a).toFixed(prec === undefined ? 6 : Number(prec)); break;
      case 'e': case 'E': s = numOf(a).toExponential(prec === undefined ? 6 : Number(prec)).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); break;
      case 'g': case 'G': s = String(Number(numOf(a).toPrecision(prec === undefined ? 6 : Number(prec) || 1))); break;
      case 'x': s = Number(n()).toString(16); break;
      case 'X': s = Number(n()).toString(16).toUpperCase(); break;
      case 'o': s = Number(n()).toString(8); break;
      case 'c': s = typeof a === 'number' ? String.fromCharCode(a) : String(a); break;
      case 'b': s = String(a); break;
      default: s = fmt(a, lang === 'Python' ? 'Java' : lang); if (prec !== undefined) s = s.slice(0, Number(prec));
    }
    if (flags.includes(',') && /^-?\d+$/.test(s)) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (flags.includes('+') && 'dfFeEgGi'.includes(conv) && !s.startsWith('-')) s = `+${s}`;
    if (width && s.length < Number(width)) {
      if (flags.includes('-')) s = s.padEnd(Number(width));
      else if (flags.includes('0') && 'diuxXfFeEgG'.includes(conv)) { const neg = s.startsWith('-') || s.startsWith('+'); s = (neg ? s[0] : '') + s.slice(neg ? 1 : 0).padStart(Number(width) - (neg ? 1 : 0), '0'); }
      else s = s.padStart(Number(width));
    }
    return s;
  });
}

/* ---------------------------------------------------------------- tokenizer */

function tokenize(src, lang) {
  const toks = [];
  const isPy = lang === 'Python';
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    const rest = src.slice(i);
    let m;
    if (lang === 'JavaScript' && src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end < 0) throw new Unsupported();
      toks.push({ t: 'str', v: src.slice(i + 1, end), prefix: 'tpl', s: i, e: end + 1 });
      i = end + 1; continue;
    }
    if ((m = /^([fFrRbBuU]{0,2})("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(rest)) && (m[1] === '' || isPy)) {
      toks.push({ t: 'str', v: m[2].slice(1, -1), prefix: m[1].toLowerCase(), quote: m[2][0], s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if ((m = /^(?:(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?)[LlUuFf]*/.exec(rest)) && /[0-9.]/.test(src[i])) {
      const isFloat = /[.eE]/.test(m[0]) || (/[fF]$/.test(m[0]) && !isPy);
      const n = parseFloat(m[1] + (m[2] || ''));
      toks.push({ t: 'num', v: isFloat && lang !== 'JavaScript' ? new Flt(n) : n, s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_$][\w$]*(?:::[A-Za-z_]\w*)*/.exec(rest))) {
      const word = m[0].replace(/^std::/, '');
      toks.push({ t: isPy && ['and', 'or', 'not', 'in', 'is'].includes(word) ? 'op' : 'id', v: word, s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if ((m = /^(\*\*|\/\/|==|!=|<=|>=|&&|\|\||[-+*/%()[\],<>!.?:])/.exec(rest))) {
      toks.push({ t: 'op', v: m[0], s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    throw new Unsupported();
  }
  return toks;
}

/* --------------------------------------------------------- reference algorithms */

const REF_FUNCS = {
  twosum: (nums, target) => {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
      const need = target - numOf(nums[i]);
      if (seen.has(need)) return [seen.get(need), i];
      seen.set(numOf(nums[i]), i);
    }
    return [];
  },
  factorial: (n) => { let r = 1n; for (let i = 2n; i <= BigInt(Math.trunc(numOf(n))); i++) r *= i; return r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : r; },
  fibonacci: (n) => { let a = 0n; let b = 1n; for (let i = 0; i < numOf(n); i++) [a, b] = [b, a + b]; return a <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(a) : a; },
  isprime: (n) => { n = numOf(n); if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; },
  gcd: (a, b) => { a = Math.abs(numOf(a)); b = Math.abs(numOf(b)); while (b) [a, b] = [b, a % b]; return a; },
};
const REF_ALIASES = { fib: 'fibonacci', fibo: 'fibonacci', isprimenumber: 'isprime', isprime: 'isprime', twosum: 'twosum', factorial: 'factorial', fibonacci: 'fibonacci', gcd: 'gcd' };
const normName = (n) => n.toLowerCase().replace(/_/g, '');

/* ------------------------------------------------------------- expression eval */

const NAMESPACES = new Set(['Math', 'Integer', 'Double', 'String', 'Character', 'Long', 'math', 'Number', 'Boolean']);

function toNumberVal(x, lang) { return lang === 'JavaScript' ? numOf(x) : x; }

function arith(op, a, b, lang) {
  a = val(a); b = val(b);
  const py = lang === 'Python';
  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (typeof a === 'string' || typeof b === 'string') {
      if (py) throw new SimError('TypeError', typeof a === 'string' ? `can only concatenate str (not "${typeName(b)}") to str` : `unsupported operand type(s) for +: '${typeName(a)}' and 'str'`);
      if (lang === 'C++') throw new Unsupported();
      return fmt(a, lang) + fmt(b, lang);
    }
  }
  if (py && op === '%' && typeof a === 'string') return fmtPrintf(a, Array.isArray(b) && b.tuple ? b : [b], 'Python');
  if (py && op === '*' && (typeof a === 'string' || Array.isArray(a)) && isNum(b)) {
    const n = Math.max(0, numOf(b));
    return typeof a === 'string' ? a.repeat(n) : Array.from({ length: n }, () => a).flat();
  }
  if (!isNum(a) || !isNum(b)) {
    if (py) throw new SimError('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
    throw new Unsupported();
  }
  const anyFlt = a instanceof Flt || b instanceof Flt;
  const big = typeof a === 'bigint' || typeof b === 'bigint';
  if (big && !anyFlt && op !== '/') {
    const x = BigInt(a); const y = BigInt(b);
    switch (op) {
      case '+': return x + y; case '-': return x - y; case '*': return x * y;
      case '//': case '/': if (y === 0n) throw new SimError('ZeroDivisionError', 'integer division or modulo by zero'); return x / y;
      case '%': return x % y;
      case '**': return x ** y;
      default: break;
    }
  }
  const x = numOf(a); const y = numOf(b);
  const mk = (n) => (anyFlt && lang !== 'JavaScript' ? new Flt(n) : n);
  switch (op) {
    case '+': return mk(x + y);
    case '-': return mk(x - y);
    case '*': { const r = x * y; return !anyFlt && !Number.isSafeInteger(r) && py ? BigInt(a) * BigInt(b) : mk(r); }
    case '/':
      if (py) { if (y === 0) throw new SimError('ZeroDivisionError', 'division by zero'); return new Flt(x / y); }
      if (lang === 'JavaScript') return x / y;
      if (anyFlt) return new Flt(x / y);
      if (y === 0) { if (lang === 'Java') throw new SimError('ArithmeticException', '/ by zero'); throw new SimError('FPE', 'Floating point exception'); }
      return Math.trunc(x / y);
    case '//': if (y === 0) throw new SimError('ZeroDivisionError', 'integer division or modulo by zero'); return mk(Math.floor(x / y));
    case '%':
      if (y === 0) { if (py) throw new SimError('ZeroDivisionError', 'integer modulo by zero'); if (lang === 'Java') throw new SimError('ArithmeticException', '/ by zero'); if (lang === 'C++') throw new SimError('FPE', 'Floating point exception'); }
      return mk(py ? ((x % y) + y) % y : x % y);
    case '**': {
      if (!anyFlt && y >= 0) { const r = BigInt(a) ** BigInt(b); return r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : r; }
      return new Flt(x ** y);
    }
    default: throw new Unsupported();
  }
}

function typeName(v) {
  if (typeof v === 'string') return 'str';
  if (v instanceof Flt) return 'float';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return v.tuple ? 'tuple' : 'list';
  if (v === null) return 'NoneType';
  return 'int';
}

function compare(op, a, b) {
  a = val(a); b = val(b);
  const norm = (v) => (v instanceof Flt ? v.n : typeof v === 'bigint' ? Number(v) : v);
  const x = norm(a); const y = norm(b);
  const eq = () => (Array.isArray(x) || Array.isArray(y) ? JSON.stringify(x, (k, vv) => (vv instanceof Flt ? vv.n : typeof vv === 'bigint' ? Number(vv) : vv)) === JSON.stringify(y, (k, vv) => (vv instanceof Flt ? vv.n : typeof vv === 'bigint' ? Number(vv) : vv)) : x === y);
  switch (op) {
    case '==': return eq();
    case '!=': return !eq();
    case '<': return x < y;
    case '>': return x > y;
    case '<=': return x <= y;
    case '>=': return x >= y;
    default: throw new Unsupported();
  }
}

class ExprEval {
  constructor(toks, ctx, env, src) { this.toks = toks; this.p = 0; this.ctx = ctx; this.env = env; this.src = src; }

  peek(o = 0) { return this.toks[this.p + o]; }
  isOp(v, o = 0) { const t = this.peek(o); return !!t && t.t === 'op' && t.v === v; }
  isId(v, o = 0) { const t = this.peek(o); return !!t && t.t === 'id' && t.v === v; }
  eat(v) { if (!this.isOp(v)) throw new Unsupported(); this.p++; }
  get py() { return this.ctx.lang === 'Python'; }
  get lang() { return this.ctx.lang; }

  parseExpr() {
    const c = this.parseOr();
    if (this.py && this.isId('if')) {
      this.p++;
      const cond = this.parseOr();
      if (!this.isId('else')) throw new Unsupported();
      this.p++;
      const other = this.parseExpr();
      return truthy(cond) ? c : other;
    }
    if (!this.py && this.isOp('?')) {
      this.p++;
      const a = this.parseExpr(); this.eat(':'); const b = this.parseExpr();
      return truthy(c) ? a : b;
    }
    return c;
  }

  parseOr() {
    let l = this.parseAnd();
    while (this.isOp('or') || this.isOp('||')) {
      this.p++;
      const r = this.parseAnd();
      l = this.py ? (truthy(l) ? l : r) : truthy(l) || truthy(r);
    }
    return l;
  }

  parseAnd() {
    let l = this.parseNot();
    while (this.isOp('and') || this.isOp('&&')) {
      this.p++;
      const r = this.parseNot();
      l = this.py ? (truthy(l) ? r : l) : truthy(l) && truthy(r);
    }
    return l;
  }

  parseNot() {
    if (this.isOp('not') && !this.isOp('in', 1)) { this.p++; return !truthy(this.parseNot()); }
    if (this.isOp('!') ) { this.p++; return !truthy(this.parseNot()); }
    return this.parseCompare();
  }

  parseCompare() {
    let l = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op') break;
      if (['==', '!=', '<', '>', '<=', '>='].includes(t.v)) { this.p++; l = compare(t.v, l, this.parseAdd()); continue; }
      if (this.py && (t.v === 'in' || (t.v === 'not' && this.isOp('in', 1)))) {
        const neg = t.v === 'not';
        this.p += neg ? 2 : 1;
        const r = val(this.parseAdd());
        const a = val(l);
        const res = typeof r === 'string' ? r.includes(a) : Array.isArray(r) ? r.some((x) => compare('==', x, a)) : (() => { throw new Unsupported(); })();
        l = neg ? !res : res; continue;
      }
      if (this.py && t.v === 'is') {
        this.p++;
        const neg = this.isOp('not');
        if (neg) this.p++;
        const r = this.parseAdd();
        const res = val(l) === val(r);
        l = neg ? !res : res; continue;
      }
      break;
    }
    return l;
  }

  parseAdd() {
    let l = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) { const op = this.toks[this.p++].v; l = arith(op, l, this.parseMul(), this.lang); }
    return l;
  }

  parseMul() {
    let l = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%') || (this.py && this.isOp('//'))) { const op = this.toks[this.p++].v; l = arith(op, l, this.parseUnary(), this.lang); }
    return l;
  }

  parseUnary() {
    if (this.isOp('-')) { this.p++; return arith('-', 0, this.parseUnary(), this.lang); }
    if (this.isOp('+')) { this.p++; return this.parseUnary(); }
    return this.parsePow();
  }

  parsePow() {
    const base = this.parsePostfix();
    if (this.py && this.isOp('**')) { this.p++; return arith('**', base, this.parseUnary(), 'Python'); }
    return base;
  }

  argList() {
    const args = [];
    this.eat('(');
    while (!this.isOp(')')) {
      args.push(this.parseExpr());
      if (this.isOp(',')) this.p++; else break;
    }
    this.eat(')');
    return args;
  }

  parsePostfix() {
    const startTok = this.peek();
    let v = this.parseAtom();
    for (;;) {
      if (this.isOp('[')) {
        this.p++;
        v = this.indexOrSlice(val(v));
      } else if (this.isOp('.')) {
        this.p++;
        const name = this.peek();
        if (!name || name.t !== 'id') throw new Unsupported();
        this.p++;
        if (this.isOp('(')) v = this.callMethod(val(v), name.v, this.argList());
        else if (name.v === 'length' && (Array.isArray(val(v)) || typeof val(v) === 'string')) v = val(v).length;
        else throw new Unsupported();
      } else break;
    }
    void startTok;
    return v;
  }

  indexOrSlice(obj) {
    let lo; let hi; let step; let isSlice = false;
    if (!this.isOp(':')) lo = this.parseExpr();
    if (this.py && this.isOp(':')) {
      isSlice = true; this.p++;
      if (!this.isOp(']') && !this.isOp(':')) hi = this.parseExpr();
      if (this.isOp(':')) { this.p++; if (!this.isOp(']')) step = this.parseExpr(); }
    }
    this.eat(']');
    if (!Array.isArray(obj) && typeof obj !== 'string') throw this.py ? new SimError('TypeError', `'${typeName(obj)}' object is not subscriptable`) : new Unsupported();
    const len = obj.length;
    if (isSlice) {
      const st = step === undefined ? 1 : numOf(val(step));
      if (st === 0) throw new SimError('ValueError', 'slice step cannot be zero');
      const norm = (x, d) => { if (x === undefined) return d; let n = numOf(val(x)); if (n < 0) n += len; return n; };
      const arr = Array.from(obj);
      let out = [];
      if (st > 0) { for (let i = Math.max(0, Math.min(norm(lo, 0), len)); i < Math.min(norm(hi, len), len); i += st) out.push(arr[i]); }
      else { for (let i = Math.min(len - 1, norm(lo, len - 1)); i > Math.max(-1, norm(hi, -1) === -1 && hi === undefined ? -1 : norm(hi, -1)); i += st) out.push(arr[i]); }
      if (typeof obj === 'string') out = out.join('');
      else if (obj.tuple) out.tuple = true;
      return out;
    }
    let i = numOf(val(lo));
    if (this.py && i < 0) i += len;
    if (i < 0 || i >= len || !Number.isInteger(i)) {
      if (this.py) throw new SimError('IndexError', typeof obj === 'string' ? 'string index out of range' : 'list index out of range');
      if (this.lang === 'Java') throw new SimError('ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${len}`);
      if (this.lang === 'JavaScript') return undefined;
      throw new Unsupported(); // C++ out-of-range is undefined behaviour
    }
    return obj[i];
  }

  callMethod(obj, name, args) {
    const a = args.map(val);
    if (typeof obj === 'string') {
      switch (name) {
        case 'upper': case 'toUpperCase': return obj.toUpperCase();
        case 'lower': case 'toLowerCase': return obj.toLowerCase();
        case 'strip': case 'trim': return obj.trim();
        case 'length': case 'size': return obj.length;
        case 'isEmpty': return obj.length === 0;
        case 'charAt': return obj[numOf(a[0])] ?? (() => { throw new SimError('StringIndexOutOfBoundsException', `index ${numOf(a[0])}, length ${obj.length}`); })();
        case 'substring': case 'substr': return obj.substring(numOf(a[0]), a[1] === undefined ? undefined : name === 'substr' ? numOf(a[0]) + numOf(a[1]) : numOf(a[1]));
        case 'equals': return obj === a[0];
        case 'contains': return obj.includes(a[0]);
        case 'replace': return obj.split(a[0]).join(a[1]);
        case 'startswith': return obj.startsWith(a[0]);
        case 'endswith': return obj.endsWith(a[0]);
        case 'split': { const parts = a.length ? obj.split(a[0]) : obj.trim().split(/\s+/).filter(Boolean); return parts; }
        case 'join': return a[0].map((x) => fmt(x, 'Python')).join(obj);
        case 'indexOf': return obj.indexOf(a[0]);
        default: throw new Unsupported();
      }
    }
    if (Array.isArray(obj)) {
      switch (name) {
        case 'append': case 'push_back': case 'add': case 'push': obj.push(a[0]); return null;
        case 'pop': if (!obj.length) throw new SimError('IndexError', 'pop from empty list'); return obj.pop();
        case 'extend': obj.push(...a[0]); return null;
        case 'sort': obj.sort((x, y) => (numOf(x) > numOf(y) ? 1 : numOf(x) < numOf(y) ? -1 : 0)); return null;
        case 'reverse': obj.reverse(); return null;
        case 'size': case 'length': return obj.length;
        case 'get': return this.indexOrSliceValue(obj, numOf(a[0]));
        default: throw new Unsupported();
      }
    }
    throw new Unsupported();
  }

  indexOrSliceValue(obj, i) {
    if (i < 0 || i >= obj.length) throw new SimError('IndexOutOfBoundsException', `Index ${i} out of bounds for length ${obj.length}`);
    return obj[i];
  }

  namespaceCall(ns, name, args) {
    const a = args.map(val); const lang = this.lang;
    const f = { abs: (x) => (x instanceof Flt ? new Flt(Math.abs(x.n)) : Math.abs(numOf(x))), pow: (x, y) => new Flt(numOf(x) ** numOf(y)), sqrt: (x) => new Flt(Math.sqrt(numOf(x))), max: (x, y) => (numOf(x) >= numOf(y) ? x : y), min: (x, y) => (numOf(x) <= numOf(y) ? x : y), floor: (x) => (lang === 'JavaScript' ? Math.floor(numOf(x)) : new Flt(Math.floor(numOf(x)))), ceil: (x) => (lang === 'JavaScript' ? Math.ceil(numOf(x)) : new Flt(Math.ceil(numOf(x)))), round: (x) => Math.round(numOf(x)) };
    if ((ns === 'Math' || ns === 'math') && f[name]) return name === 'floor' || name === 'ceil' ? (this.py ? (name === 'floor' ? Math.floor(numOf(a[0])) : Math.ceil(numOf(a[0]))) : f[name](...a)) : f[name](...a);
    if (ns === 'math' && name === 'factorial') return REF_FUNCS.factorial(a[0]);
    if (ns === 'math' && name === 'gcd') return REF_FUNCS.gcd(a[0], a[1]);
    if (ns === 'Integer' && (name === 'parseInt' || name === 'valueOf')) { const n = parseInt(a[0], 10); if (Number.isNaN(n)) throw new SimError('NumberFormatException', `For input string: "${a[0]}"`); return n; }
    if (ns === 'Double' && name === 'parseDouble') return new Flt(parseFloat(a[0]));
    if (ns === 'String' && (name === 'valueOf')) return fmt(a[0], 'Java');
    if (ns === 'String' && name === 'format') return fmtPrintf(String(a[0]), a.slice(1), 'Java');
    if (ns === 'Number' && name === 'isInteger') return Number.isInteger(numOf(a[0]));
    throw new Unsupported();
  }

  namespaceConst(ns, name) {
    const c = { 'Math.PI': new Flt(Math.PI), 'math.pi': new Flt(Math.PI), 'Math.E': new Flt(Math.E), 'Integer.MAX_VALUE': 2147483647, 'Integer.MIN_VALUE': -2147483648, 'Long.MAX_VALUE': 9223372036854775807n };
    const key = `${ns}.${name}`;
    if (key in c) return c[key];
    throw new Unsupported();
  }

  builtin(name, args) {
    const lang = this.lang; const a = args.map(val);
    const toInt = (x) => (typeof x === 'string' ? (/^\s*[-+]?\d+\s*$/.test(x) ? parseInt(x, 10) : (() => { throw new SimError('ValueError', `invalid literal for int() with base 10: '${x}'`); })()) : x instanceof Flt ? Math.trunc(x.n) : x);
    if (lang === 'Python') {
      switch (name) {
        case 'len': if (typeof a[0] !== 'string' && !Array.isArray(a[0])) throw new SimError('TypeError', `object of type '${typeName(a[0])}' has no len()`); return a[0].length;
        case 'str': return fmt(a[0], 'Python');
        case 'int': return toInt(a[0]);
        case 'float': return new Flt(typeof a[0] === 'string' ? parseFloat(a[0]) : numOf(a[0]));
        case 'bool': return truthy(a[0]);
        case 'abs': return a[0] instanceof Flt ? new Flt(Math.abs(a[0].n)) : Math.abs(numOf(a[0]));
        case 'max': case 'min': { const arr = a.length === 1 && Array.isArray(a[0]) ? a[0] : a; if (!arr.length) throw new SimError('ValueError', `${name}() arg is an empty sequence`); return arr.reduce((m, x) => ((name === 'max' ? numOf(x) > numOf(m) : numOf(x) < numOf(m)) ? x : m)); }
        case 'sum': { const arr = a[0]; return arr.reduce((s, x) => arith('+', s, x, 'Python'), a[1] === undefined ? 0 : a[1]); }
        case 'round': return a[1] === undefined ? Math.round(numOf(a[0])) : new Flt(Number(numOf(a[0]).toFixed(numOf(a[1]))));
        case 'pow': return arith('**', a[0], a[1], 'Python');
        case 'range': {
          const [s, e, st] = a.length === 1 ? [0, numOf(a[0]), 1] : [numOf(a[0]), numOf(a[1]), a[2] === undefined ? 1 : numOf(a[2])];
          if (st === 0) throw new SimError('ValueError', 'range() arg 3 must not be zero');
          if (Math.abs(e - s) / Math.abs(st) > 1e6) throw new Unsupported();
          const out = []; for (let i = s; st > 0 ? i < e : i > e; i += st) out.push(i); return out;
        }
        case 'list': return typeof a[0] === 'string' ? a[0].split('') : Array.from(a[0] || []);
        case 'sorted': return Array.from(a[0]).sort((x, y) => (numOf(x) > numOf(y) ? 1 : numOf(x) < numOf(y) ? -1 : typeof x === 'string' ? (x > y ? 1 : x < y ? -1 : 0) : 0));
        case 'reversed': return Array.from(a[0]).reverse();
        case 'chr': return String.fromCharCode(numOf(a[0]));
        case 'ord': return a[0].charCodeAt(0);
        case 'input': {
          if (a[0] !== undefined) this.ctx.write(fmt(a[0], 'Python'));
          if (!this.ctx.stdinLines.length) throw new SimError('EOFError', 'EOF when reading a line');
          return this.ctx.stdinLines.shift();
        }
        default: return undefined;
      }
    }
    switch (name) {
      case 'abs': return a[0] instanceof Flt ? new Flt(Math.abs(a[0].n)) : Math.abs(numOf(a[0]));
      case 'max': return numOf(a[0]) >= numOf(a[1]) ? a[0] : a[1];
      case 'min': return numOf(a[0]) <= numOf(a[1]) ? a[0] : a[1];
      case 'pow': return new Flt(numOf(a[0]) ** numOf(a[1]));
      case 'sqrt': return new Flt(Math.sqrt(numOf(a[0])));
      case 'floor': return new Flt(Math.floor(numOf(a[0])));
      case 'ceil': return new Flt(Math.ceil(numOf(a[0])));
      case 'to_string': return fmt(a[0], 'Java');
      case 'stoi': return parseInt(a[0], 10);
      case 'parseInt': return parseInt(a[0], 10);
      case 'String': return fmt(a[0], 'JavaScript');
      case 'Number': return Number(a[0]);
      default: return undefined;
    }
  }

  callFunction(name, args, startTok, endTok) {
    const callSrc = this.src.slice(startTok.s, endTok.e);
    const norm = normName(name);
    const refKey = REF_ALIASES[norm];
    if (refKey && this.ctx.defined.has(name)) {
      try { return REF_FUNCS[refKey](...args.map(val)); } catch (e) { if (!(e instanceof Unsupported)) throw e; }
    }
    if (this.ctx.defined.has(name)) return new Unknown(callSrc);
    const b = this.builtin(name, args);
    if (b !== undefined) return b;
    if (this.py && !this.ctx.lenient && !this.env.has(name)) throw new SimError('NameError', `name '${name}' is not defined`);
    return new Unknown(callSrc);
  }

  listAtom() {
    // toks[p-1] is '['. Detect comprehension by looking for a depth-0 'for'.
    let depth = 0; let forIdx = -1; let end = -1;
    for (let i = this.p; i < this.toks.length; i++) {
      const t = this.toks[i];
      if (t.t === 'op' && '([{'.includes(t.v)) depth++;
      else if (t.t === 'op' && ')]}'.includes(t.v)) { if (depth === 0) { end = i; break; } depth--; }
      else if (depth === 0 && this.py && t.t === 'id' && t.v === 'for' && forIdx < 0) forIdx = i;
    }
    if (end < 0) throw new Unsupported();
    if (forIdx >= 0) {
      const exprToks = this.toks.slice(this.p, forIdx);
      const v = this.toks[forIdx + 1]; const inTok = this.toks[forIdx + 2];
      if (!v || v.t !== 'id' || !inTok || inTok.v !== 'in') throw new Unsupported();
      let ifIdx = -1; let d2 = 0;
      for (let i = forIdx + 3; i < end; i++) { const t = this.toks[i]; if (t.t === 'op' && '([{'.includes(t.v)) d2++; else if (t.t === 'op' && ')]}'.includes(t.v)) d2--; else if (d2 === 0 && t.t === 'id' && t.v === 'if') { ifIdx = i; break; } }
      const iterToks = this.toks.slice(forIdx + 3, ifIdx < 0 ? end : ifIdx);
      const condToks = ifIdx < 0 ? null : this.toks.slice(ifIdx + 1, end);
      const iterable = val(new ExprEval(iterToks, this.ctx, this.env, this.src).parseExpr());
      const items = typeof iterable === 'string' ? iterable.split('') : iterable;
      if (!Array.isArray(items)) throw new Unsupported();
      const out = [];
      const local = new Map(this.env);
      for (const it of items) {
        this.ctx.tick();
        local.set(v.v, it);
        if (condToks && !truthy(new ExprEval(condToks, this.ctx, local, this.src).parseExpr())) continue;
        out.push(new ExprEval(exprToks, this.ctx, local, this.src).parseExpr());
      }
      this.p = end + 1;
      return out;
    }
    const items = [];
    while (!this.isOp(']')) {
      items.push(this.parseExpr());
      if (this.isOp(',')) this.p++; else break;
    }
    this.eat(']');
    return items;
  }

  parseAtom() {
    const t = this.peek();
    if (!t) throw new Unsupported();
    if (t.t === 'num') { this.p++; return t.v; }
    if (t.t === 'str') {
      this.p++;
      let s = t.v;
      if (t.prefix.includes('f') || t.prefix === 'tpl') s = this.interpolate(s, t.prefix === 'tpl');
      else if (!t.prefix.includes('r')) s = unescapeStr(s);
      // adjacent string literal concatenation (Python / C++)
      while (this.peek() && this.peek().t === 'str' && this.lang !== 'Java' && this.lang !== 'JavaScript') { const n = this.peek(); this.p++; s += n.prefix.includes('f') ? this.interpolate(n.v, false) : unescapeStr(n.v); }
      return s;
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        this.p++;
        const first = this.parseExpr();
        if (this.py && this.isOp(',')) {
          const items = [first];
          while (this.isOp(',')) { this.p++; if (this.isOp(')')) break; items.push(this.parseExpr()); }
          this.eat(')');
          items.tuple = true;
          return items;
        }
        this.eat(')');
        return first;
      }
      if (t.v === '[') { this.p++; return this.listAtom(); }
      throw new Unsupported();
    }
    // identifier
    this.p++;
    const name = t.v;
    if (this.py) {
      if (name === 'True') return true;
      if (name === 'False') return false;
      if (name === 'None') return null;
    } else {
      if (name === 'true') return true;
      if (name === 'false') return false;
      if (name === 'null' || name === 'nullptr') return null;
      if (name === 'undefined') return undefined;
      if (name === 'new') throw new Unsupported();
    }
    if (NAMESPACES.has(name) && this.isOp('.') && this.peek(1) && this.peek(1).t === 'id') {
      const member = this.peek(1).v;
      if (name === 'math' && !this.ctx.imports.has('math')) throw new SimError('NameError', "name 'math' is not defined");
      this.p += 2;
      if (this.isOp('(')) return this.namespaceCall(name, member, this.argList());
      return this.namespaceConst(name, member);
    }
    if (this.isOp('(')) {
      const args = this.argList();
      return this.callFunction(name, args, t, this.toks[this.p - 1]);
    }
    if (this.env.has(name)) return this.env.get(name);
    if (this.py && this.ctx.imports.has(name)) return new Unknown(name);
    if (this.py && !this.ctx.lenient) throw new SimError('NameError', `name '${name}' is not defined`);
    if (this.ctx.defined.has(name)) return new Unknown(name);
    if (!this.py && (name === 'endl')) return '\n';
    return new Unknown(name);
  }

  interpolate(raw, isTemplate) {
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (isTemplate ? (c === '$' && raw[i + 1] === '{') : c === '{') {
        if (!isTemplate && raw[i + 1] === '{') { out += '{'; i++; continue; }
        const open = isTemplate ? i + 1 : i;
        const close = findMatching(raw, open);
        if (close < 0) throw new Unsupported();
        let inner = raw.slice(open + 1, close);
        let spec = '';
        if (!isTemplate) {
          const parts = splitTop(inner, ':');
          if (parts.length > 1) { spec = parts.pop(); inner = parts.join(':'); }
          inner = inner.replace(/![rsa]$/, '');
        }
        const v = val(evalExpr(inner, this.ctx, this.env));
        out += spec ? applySpec(v, spec.trim()) : fmt(v, this.py ? 'Python' : 'JavaScript');
        i = close;
      } else if (!isTemplate && c === '}' && raw[i + 1] === '}') { out += '}'; i++; } else out += unescapeStr(c === '\\' ? raw.slice(i, ++i + 1) : c);
    }
    return out;
  }
}

function applySpec(v, spec) {
  const m = /^([<>^]?)(0?)(\d+)?(,)?(?:\.(\d+))?([dfsxXeE%]?)$/.exec(spec);
  if (!m) return fmt(v, 'Python');
  const [, align, zero, width, comma, prec, type] = m;
  let s;
  if (type === 'f' || (prec !== undefined && !type && isNum(v))) s = numOf(v).toFixed(prec === undefined ? 6 : Number(prec));
  else if (type === '%') s = `${(numOf(v) * 100).toFixed(prec === undefined ? 6 : Number(prec))}%`;
  else if (type === 'x') s = Number(v).toString(16);
  else if (type === 'X') s = Number(v).toString(16).toUpperCase();
  else if (type === 'e') s = numOf(v).toExponential(prec === undefined ? 6 : Number(prec)).replace(/e([+-])(\d)$/, 'e$10$2');
  else s = fmt(v, 'Python');
  if (comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (width) {
    const w = Number(width);
    const defaultRight = isNum(v);
    const al = align || (zero ? '>' : defaultRight ? '>' : '<');
    const fill = zero ? '0' : ' ';
    if (al === '<') s = s.padEnd(w, fill);
    else if (al === '>') s = s.padStart(w, fill);
    else { const total = Math.max(0, w - s.length); s = fill.repeat(Math.floor(total / 2)) + s + fill.repeat(Math.ceil(total / 2)); }
  }
  return s;
}

function evalExpr(src, ctx, env) {
  const toks = tokenize(src, ctx.lang);
  if (!toks.length) throw new Unsupported();
  const e = new ExprEval(toks, ctx, env, src);
  const v = e.parseExpr();
  if (e.p < toks.length) throw new Unsupported();
  return v;
}

/** Evaluates `src`; returns an Unknown (never throws Unsupported) so assignments can proceed. */
function evalOrUnknown(src, ctx, env) {
  try { return evalExpr(src, ctx, env); } catch (e) {
    if (e instanceof Unsupported) { ctx.simulated++; return new Unknown(src.trim()); }
    throw e;
  }
}

/** Formats an expression's value for printing, falling back to a <simulated: …> placeholder. */
function printable(src, ctx, env) {
  try {
    const v = evalExpr(src, ctx, env);
    if (v instanceof Unknown) { ctx.simulated++; return `<simulated: ${v.src}>`; }
    return fmt(v, ctx.lang);
  } catch (e) {
    if (e instanceof Unsupported) { ctx.simulated++; return `<simulated: ${src.trim()}>`; }
    throw e;
  }
}

/* -------------------------------------------------------------- context */

function makeCtx(lang, code, stdin) {
  const ctx = {
    lang, out: '', err: '', truncated: false, steps: 0, simulated: 0, lenient: false,
    defined: new Set(), imports: new Set(), stdinLines: [], stdinTokens: [],
    write(s) { if (this.out.length < MAX_OUTPUT) this.out += s; else this.truncated = true; },
    tick() { if (++this.steps > MAX_STEPS) throw new TimeoutSim(); },
  };
  const lines = String(stdin || '').replace(/\r/g, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  ctx.stdinLines = lines;
  ctx.stdinTokens = String(stdin || '').split(/\s+/).filter(Boolean);
  // functions defined by the program (used to decide "user function" vs "unknown identifier")
  let m;
  if (lang === 'Python') { const re = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)|^\s*class\s+([A-Za-z_]\w*)/gm; while ((m = re.exec(code))) ctx.defined.add(m[1] || m[2]); const im = /^\s*import\s+([\w., ]+)|^\s*from\s+([\w.]+)\s+import/gm; while ((m = im.exec(code))) (m[1] ? m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()) : [m[2]]).forEach((x) => ctx.imports.add(x)); }
  else {
    const re = /\b([A-Za-z_]\w*)\s*\([^;(){}]*\)\s*(?:const\s*)?(?:throws\s+[\w.,\s]+)?\{/g;
    const skip = new Set(['if', 'for', 'while', 'switch', 'catch', 'main', 'return', 'else']);
    while ((m = re.exec(code))) if (!skip.has(m[1])) ctx.defined.add(m[1]);
    const jf = /\bfunction\s+([A-Za-z_$][\w$]*)/g; while ((m = jf.exec(code))) ctx.defined.add(m[1]);
  }
  return ctx;
}

/* ------------------------------------------------------------ Python engine */

function joinLogicalLines(code) {
  const raw = code.split('\n');
  const lines = [];
  let buf = ''; let startNo = 0; let depth = 0; let q = null;
  raw.forEach((line, idx) => {
    if (!buf) startNo = idx + 1;
    buf += (buf ? ' ' : '') + (buf ? line.trim() : line);
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
    }
    q = null;
    if (depth <= 0 && !/\\\s*$/.test(line)) { lines.push({ text: buf, no: startNo }); buf = ''; depth = 0; }
  });
  if (buf) lines.push({ text: buf, no: startNo });
  return lines
    .map((l) => { const indent = (/^[ \t]*/.exec(l.text)[0].replace(/\t/g, '    ')).length; return { text: l.text.trim(), indent, no: l.no }; })
    .filter((l) => l.text);
}

function pyStatic(lines, code) {
  // unterminated brackets / strings are caught by joinLogicalLines' leftover depth — check explicitly:
  const stripped = code.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '');
  const stack = []; let q = null; let lineNo = 1;
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === '\n') { if (q) return { line: lineNo, msg: `unterminated string literal (detected at line ${lineNo})` }; lineNo++; continue; }
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '#') { while (i < stripped.length && stripped[i] !== '\n') i++; i--; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if ('([{'.includes(c)) stack.push({ c, line: lineNo });
    else if (')]}'.includes(c)) {
      const top = stack.pop();
      const want = { ')': '(', ']': '[', '}': '{' }[c];
      if (!top) return { line: lineNo, msg: `unmatched '${c}'` };
      if (top.c !== want) return { line: lineNo, msg: `closing parenthesis '${c}' does not match opening parenthesis '${top.c}'` };
    }
  }
  if (stack.length) return { line: stack[stack.length - 1].line, msg: `'${stack[stack.length - 1].c}' was never closed` };
  for (const l of lines) {
    if (/^print\s+[^\s=(]/.test(l.text) || /^print\s+["']/.test(l.text)) return { line: l.no, msg: "Missing parentheses in call to 'print'. Did you mean print(...)?" };
    if (/^(if|elif|for|while|def|class)\b/.test(l.text) && topLevelIndexOf(l.text, ':') < 0) return { line: l.no, msg: "expected ':'" };
    if (/^(else|try|finally)\s*$/.test(l.text)) return { line: l.no, msg: "expected ':'" };
  }
  return null;
}

function parsePyBlock(lines, i, indent) {
  const stmts = [];
  while (i < lines.length && lines[i].indent >= indent) {
    const ln = lines[i];
    if (ln.indent > indent) { i++; continue; } // stray deeper line (skipped body of unsupported stmt)
    const text = ln.text;
    const colonIdx = /^(if|elif|else|while|for|def|class|try|except|finally|with)\b/.test(text) ? topLevelIndexOf(text, ':') : -1;
    if (colonIdx >= 0) {
      const head = text.slice(0, colonIdx).trim();
      const tail = text.slice(colonIdx + 1).trim();
      let body = [];
      let next = i + 1;
      if (tail) body = [{ kind: 'simple', text: tail, no: ln.no }];
      else if (next < lines.length && lines[next].indent > indent) {
        const r = parsePyBlock(lines, next, lines[next].indent);
        body = r.stmts; next = r.next;
      }
      stmts.push({ kind: 'block', head, body, no: ln.no });
      i = next;
    } else {
      stmts.push({ kind: 'simple', text, no: ln.no });
      i++;
    }
  }
  return { stmts, next: i };
}

function execPyBlock(stmts, ctx, env) {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    ctx.tick();
    ctx.curLine = s.no;
    if (s.kind === 'simple') { execPySimple(s.text, ctx, env); continue; }
    const head = s.head;
    let m;
    if ((m = /^if\s+([\s\S]+)$/.exec(head))) {
      // gather elif/else chain
      let matched = false;
      let cond = m[1]; let body = s.body;
      for (;;) {
        if (!matched) {
          let ok;
          try { ok = truthy(evalExpr(cond, ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ctx.lenient = true; ok = false; } else throw e; }
          if (ok) { matched = true; execPyBlock(body, ctx, env); }
        }
        const nx = stmts[i + 1];
        if (nx && nx.kind === 'block' && /^elif\s+/.test(nx.head)) { i++; cond = nx.head.replace(/^elif\s+/, ''); body = nx.body; continue; }
        if (nx && nx.kind === 'block' && /^else$/.test(nx.head)) { i++; if (!matched) execPyBlock(nx.body, ctx, env); }
        break;
      }
    } else if ((m = /^while\s+([\s\S]+)$/.exec(head))) {
      for (;;) {
        ctx.tick();
        let ok;
        try { ok = truthy(evalExpr(m[1], ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ctx.lenient = true; break; } throw e; }
        if (!ok) break;
        try { execPyBlock(s.body, ctx, env); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
      }
    } else if ((m = /^for\s+([A-Za-z_]\w*)\s+in\s+([\s\S]+)$/.exec(head))) {
      let iterable;
      try { iterable = val(evalExpr(m[2], ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ctx.lenient = true; continue; } throw e; }
      const items = typeof iterable === 'string' ? iterable.split('') : iterable;
      if (!Array.isArray(items)) { ctx.simulated++; ctx.lenient = true; continue; }
      for (const it of Array.from(items)) {
        ctx.tick();
        env.set(m[1], it);
        try { execPyBlock(s.body, ctx, env); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
      }
    } else if (/^(try|finally)$/.test(head)) {
      execPyBlock(s.body, ctx, env);
    } else {
      // def / class / with / except / for with tuple targets…: not executed (and later names may be missing)
      ctx.simulated++;
      ctx.lenient = true;
    }
  }
}

function execPySimple(text, ctx, env) {
  let m;
  if (/^(pass|global\s|nonlocal\s|del\s)/.test(text)) return;
  if (/^(import|from)\s/.test(text)) return;
  if (text === 'break') throw new Signal('break');
  if (text === 'continue') throw new Signal('continue');
  if (/^return\b/.test(text)) return;
  if ((m = /^raise\s+([A-Za-z_]\w*)\s*(?:\(([\s\S]*)\))?$/.exec(text))) {
    let msg = '';
    if (m[2]) { try { msg = fmt(evalExpr(m[2], ctx, env), 'Python'); } catch (e) { if (!(e instanceof Unsupported)) throw e; } }
    throw new SimError(m[1], msg);
  }
  if ((m = /^assert\s+([\s\S]+)$/.exec(text))) {
    try { if (!truthy(evalExpr(splitTop(m[1], ',')[0], ctx, env))) throw new SimError('AssertionError', ''); } catch (e) { if (!(e instanceof Unsupported)) throw e; ctx.simulated++; }
    return;
  }
  if ((m = /^print\s*\(([\s\S]*)\)\s*$/.exec(text))) { pyPrint(m[1], ctx, env); return; }
  if ((m = /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=(?!=)\s*([\s\S]+)$/.exec(text))) {
    const names = m[1].split(',').map((x) => x.trim());
    const rhs = splitTop(m[2], ',');
    if (rhs.length === names.length) { const vals = rhs.map((r) => evalOrUnknown(r, ctx, env)); names.forEach((n, k) => env.set(n, vals[k])); return; }
    names.forEach((n) => env.set(n, new Unknown(m[2].trim()))); ctx.simulated++; return;
  }
  if ((m = /^([A-Za-z_]\w*)\s*(\[[\s\S]+\])?\s*(\/\/=|\*\*=|[-+*/%]=|=)(?!=)\s*([\s\S]+)$/.exec(text))) {
    const [, name, idx, op, rhsSrc] = m;
    if (idx) {
      const target = env.get(name);
      if (!Array.isArray(target)) { ctx.simulated++; return; }
      const i = numOf(val(evalExpr(idx.slice(1, -1), ctx, env)));
      const pos = i < 0 ? i + target.length : i;
      if (pos < 0 || pos >= target.length) throw new SimError('IndexError', 'list assignment index out of range');
      const rv = evalOrUnknown(rhsSrc, ctx, env);
      target[pos] = op === '=' ? rv : arith(op.slice(0, -1), target[pos], rv, 'Python');
      return;
    }
    const rv = evalOrUnknown(rhsSrc, ctx, env);
    if (op === '=') env.set(name, rv);
    else {
      if (!env.has(name)) { if (!ctx.lenient) throw new SimError('NameError', `name '${name}' is not defined`); env.set(name, new Unknown(name)); return; }
      try { env.set(name, arith(op.slice(0, -1), env.get(name), rv, 'Python')); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; env.set(name, new Unknown(text)); } else throw e; }
    }
    return;
  }
  // expression statement (function call, method call…)
  try { evalExpr(text, ctx, env); } catch (e) { if (e instanceof Unsupported) ctx.simulated++; else throw e; }
}

function pyPrint(argSrc, ctx, env) {
  const parts = argSrc.trim() ? splitTop(argSrc, ',').map((x) => x.trim()).filter((x, i, arr) => x || i < arr.length - 1) : [];
  let sep = ' '; let end = '\n'; let toErr = false;
  const outs = [];
  for (const p of parts) {
    const kw = /^(sep|end|file|flush)\s*=(?!=)\s*([\s\S]*)$/.exec(p);
    if (kw) {
      if (kw[1] === 'sep') sep = fmt(evalOrUnknown(kw[2], ctx, env), 'Python');
      else if (kw[1] === 'end') end = fmt(evalOrUnknown(kw[2], ctx, env), 'Python');
      else if (kw[1] === 'file' && /stderr/.test(kw[2])) toErr = true;
      continue;
    }
    if (p.startsWith('*')) { outs.push(`<simulated: ${p}>`); ctx.simulated++; continue; }
    outs.push(printable(p, ctx, env));
  }
  const line = outs.join(sep) + end;
  if (toErr) ctx.err += line; else ctx.write(line);
}

function runPython(code, ctx) {
  const clean = stripComments(code, 'Python');
  // drop docstring-only lines
  const noDoc = clean.replace(/^[ \t]*("""[\s\S]*?"""|'''[\s\S]*?''')[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ''));
  const lines = joinLogicalLines(noDoc);
  const syn = pyStatic(lines, noDoc);
  if (syn) return { compileError: true, stderr: `  File "main.py", line ${syn.line}\nSyntaxError: ${syn.msg}\n` };
  const { stmts } = parsePyBlock(lines, 0, lines.length ? lines[0].indent : 0);
  const env = new Map();
  try { execPyBlock(stmts, ctx, env); } catch (e) {
    if (e instanceof Signal) return {};
    if (e instanceof SimError) return { runtimeError: true, stderr: `Traceback (most recent call last):\n  File "main.py", line ${ctx.curLine}, in <module>\n${e.type}${e.message ? `: ${e.message}` : ''}\n` };
    throw e;
  }
  return {};
}

/* ----------------------------------------------------------- C-like engine */

const C_KEYWORDS = new Set(['return', 'cout', 'cin', 'cerr', 'else', 'delete', 'throw', 'new', 'break', 'continue', 'goto', 'case', 'typedef', 'using', 'namespace', 'console', 'System']);

function extractBlock(text, openIdx) { const close = findMatching(text, openIdx); return close < 0 ? null : text.slice(openIdx + 1, close); }

function readCStatement(text, i) {
  const ws = /\s/;
  while (i < text.length && (ws.test(text[i]) || text[i] === ';')) i++;
  if (i >= text.length) return null;
  if (text[i] === '#') { while (i < text.length && text[i] !== '\n') i++; return readCStatement(text, i); }
  if (text[i] === '{') { const close = findMatching(text, i); if (close < 0) throw new Unsupported(); return [{ kind: 'block', body: parseCStatements(text.slice(i + 1, close)) }, close + 1]; }
  let m;
  const rest = text.slice(i);
  if ((m = /^(for|while|if)\s*\(/.exec(rest))) {
    const open = i + m[0].length - 1;
    const close = findMatching(text, open);
    if (close < 0) throw new Unsupported();
    const header = text.slice(open + 1, close);
    const bodyRead = readCStatement(text, close + 1);
    const body = bodyRead ? bodyRead[0] : { kind: 'block', body: [] };
    let next = bodyRead ? bodyRead[1] : close + 1;
    let orelse = null;
    if (m[1] === 'if') {
      const after = /^\s*else\b/.exec(text.slice(next));
      if (after) { const er = readCStatement(text, next + after[0].length); if (er) { orelse = er[0]; next = er[1]; } }
    }
    return [{ kind: m[1], header, body, orelse }, next];
  }
  if (/^(do|switch|try)\b/.test(rest)) throw new Unsupported();
  if ((m = /^(function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*|class\s+\w+[^{]*)\{/.exec(rest))) { const close = findMatching(text, i + m[0].length - 1); return [{ kind: 'skip' }, close < 0 ? text.length : close + 1]; }
  // simple statement up to top-level ';'
  let depth = 0; let q = null; let j = i;
  for (; j < text.length; j++) {
    const c = text[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || (c === '`')) { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) break;
  }
  return [{ kind: 'simple', text: text.slice(i, j).trim() }, j + 1];
}

function parseCStatements(text) {
  const out = [];
  let i = 0;
  for (;;) { const r = readCStatement(text, i); if (!r) break; out.push(r[0]); i = r[1]; }
  return out;
}

function coerceDecl(type, v, lang) {
  if (v instanceof Unknown) return v;
  const base = type.trim().split(/\s+/).pop().replace(/[&*]/g, '');
  if (/^(double|float)$/.test(base) && isNum(v)) return lang === 'JavaScript' ? v : new Flt(numOf(v));
  if (/^(int|long|short|size_t|Integer|Long)$/.test(base) && v instanceof Flt) return Math.trunc(v.n);
  if (/^(bool|boolean)$/.test(base) && typeof v !== 'boolean') return truthy(v);
  return v;
}

function cInit(rhs, type, ctx, env) {
  rhs = rhs.trim();
  let m;
  if (rhs.startsWith('{') && rhs.endsWith('}')) return splitTop(rhs.slice(1, -1), ',').filter((x) => x.trim()).map((x) => evalOrUnknown(x, ctx, env));
  if ((m = /^new\s+(?:int|long|double|boolean|char|String|float)\s*\[\s*([^\]]+)\s*\]$/.exec(rhs))) { const n = numOf(val(evalExpr(m[1], ctx, env))); const z = /double|float/.test(rhs) ? new Flt(0) : /boolean/.test(rhs) ? false : /String/.test(rhs) ? null : 0; return Array.from({ length: n }, () => z); }
  if ((m = /^new\s+(?:int|long|double|String)\s*\[\s*\]\s*\{([\s\S]*)\}$/.exec(rhs))) return splitTop(m[1], ',').filter((x) => x.trim()).map((x) => evalOrUnknown(x, ctx, env));
  if (/^new\s+(ArrayList|LinkedList|Vector)\b/.test(rhs)) return [];
  return coerceDecl(type, evalOrUnknown(rhs, ctx, env), ctx.lang);
}

function execCSimple(text, ctx, env) {
  let m;
  const lang = ctx.lang;
  if (!text) return;
  if (lang === 'C++') text = text.replace(/^std::/, '');
  if (text === 'break') throw new Signal('break');
  if (text === 'continue') throw new Signal('continue');
  if (/^return\b/.test(text)) throw new Signal('return');
  if (/^(using|typedef|import|package)\b/.test(text)) return;

  // output ----------------------------------------------------------------
  if (lang === 'C++' && (m = /^(cout|cerr)\s*<<([\s\S]*)$/.exec(text))) {
    let s = '';
    for (const part of splitTop(m[2], '<<')) { const p = part.trim().replace(/^std::/, ''); s += p === 'endl' ? '\n' : printable(p, ctx, env); }
    if (m[1] === 'cerr') ctx.err += s; else ctx.write(s);
    return;
  }
  if (lang === 'C++' && (m = /^cin\s*>>([\s\S]*)$/.exec(text))) {
    for (const part of splitTop(m[1], '>>')) { const name = part.trim(); const tok = ctx.stdinTokens.shift(); env.set(name, tok === undefined ? 0 : /^-?\d+$/.test(tok) ? parseInt(tok, 10) : /^-?\d*\.\d+$/.test(tok) ? new Flt(parseFloat(tok)) : tok); }
    return;
  }
  if ((m = /^(?:std::)?printf\s*\(([\s\S]*)\)$/.exec(text)) || (m = /^System\.out\.(printf|format)\s*\(([\s\S]*)\)$/.exec(text))) {
    const argSrc = m[2] !== undefined ? m[2] : m[1];
    const args = splitTop(argSrc, ',');
    const f = val(evalExpr(args[0], ctx, env));
    try { ctx.write(fmtPrintf(String(f), args.slice(1).map((a) => evalOrUnknown(a, ctx, env)), lang)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ctx.write(`<simulated: ${text}>`); } else throw e; }
    return;
  }
  if ((m = /^System\.(out|err)\.(println|print)\s*\(([\s\S]*)\)$/.exec(text))) {
    const s = (m[3].trim() ? printable(m[3], ctx, env) : '') + (m[2] === 'println' ? '\n' : '');
    if (m[1] === 'err') ctx.err += s; else ctx.write(s);
    return;
  }
  if ((m = /^console\.(log|error|info|warn)\s*\(([\s\S]*)\)$/.exec(text))) {
    const s = (m[2].trim() ? splitTop(m[2], ',').map((a) => printable(a, ctx, env)).join(' ') : '') + '\n';
    if (m[1] === 'error' || m[1] === 'warn') ctx.err += s; else ctx.write(s);
    return;
  }

  // increments -------------------------------------------------------------
  if ((m = /^(?:\+\+|--)\s*([A-Za-z_$][\w$]*)$/.exec(text)) || (m = /^([A-Za-z_$][\w$]*)\s*(\+\+|--)$/.exec(text))) {
    const isPre = /^(\+\+|--)/.test(text);
    const name = m[1]; const op = isPre ? text.slice(0, 2) : m[2];
    if (env.has(name) && !(env.get(name) instanceof Unknown)) env.set(name, arith(op === '++' ? '+' : '-', env.get(name), 1, lang));
    return;
  }

  // declarations -----------------------------------------------------------
  if (lang === 'JavaScript' && (m = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*([\s\S]+))?$/.exec(text))) { env.set(m[1], m[2] === undefined ? undefined : cInit(m[2], '', ctx, env)); return; }
  if (lang !== 'JavaScript' && (m = /^((?:(?:const|final|static|unsigned|signed|long|short)\s+)*[A-Za-z_][\w:]*(?:\s*<[^;=()]*>)?(?:\s*\[\s*\])*(?:\s*[&*])?)\s+([A-Za-z_]\w*)\s*(\[\s*\d*\s*\])?\s*(?:=\s*([\s\S]+))?$/.exec(text)) && !C_KEYWORDS.has(m[1].split(/\s+/)[0])) {
    const [, type, name, arr, init] = m;
    if (init !== undefined) env.set(name, cInit(init, type, ctx, env));
    else if (arr) { const n = /\d+/.exec(arr); env.set(name, n ? Array.from({ length: Number(n[0]) }, () => 0) : []); }
    else if (/vector|List|Set|Map|Deque|Queue|Stack/.test(type)) env.set(name, /Map|Set|map|set/.test(type) ? new Unknown(`${type} ${name}`) : []);
    else if (/^(int|long|short|size_t|char|unsigned|long long)/.test(type) || /\b(int|long|short)\b/.test(type)) env.set(name, 0);
    else if (/double|float/.test(type)) env.set(name, new Flt(0));
    else if (/bool/.test(type)) env.set(name, false);
    else if (/string|String/.test(type)) env.set(name, '');
    else env.set(name, new Unknown(name));
    return;
  }

  // assignment (incl. compound and indexed) --------------------------------
  if ((m = /^([A-Za-z_$][\w$]*)\s*(\[[\s\S]+\])?\s*(<<=|>>=|[-+*/%]=|=)(?!=)\s*([\s\S]+)$/.exec(text))) {
    const [, name, idx, op, rhsSrc] = m;
    const rv = evalOrUnknown(rhsSrc, ctx, env);
    if (idx) {
      const target = env.get(name);
      if (!Array.isArray(target)) { ctx.simulated++; return; }
      const i = numOf(val(evalExpr(idx.slice(1, -1), ctx, env)));
      if (i < 0 || i >= target.length) { if (lang === 'Java') throw new SimError('ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${target.length}`); ctx.simulated++; return; }
      target[i] = op === '=' ? rv : arith(op.slice(0, -1), target[i], rv, lang);
      return;
    }
    if (op === '=') env.set(name, rv);
    else if (env.has(name)) { try { env.set(name, arith(op.slice(0, -1), env.get(name), rv, lang)); } catch (e) { if (e instanceof Unsupported) env.set(name, new Unknown(text)); else throw e; } }
    return;
  }

  // expression statement ----------------------------------------------------
  try { evalExpr(text, ctx, env); } catch (e) { if (e instanceof Unsupported) ctx.simulated++; else throw e; }
}

function execCBlock(stmts, ctx, env) {
  for (const s of stmts) {
    ctx.tick();
    switch (s.kind) {
      case 'simple': execCSimple(s.text, ctx, env); break;
      case 'skip': ctx.simulated++; break;
      case 'block': execCBlock(s.body, ctx, env); break;
      case 'if': {
        let ok;
        try { ok = truthy(evalExpr(s.header, ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ok = false; } else throw e; }
        if (ok) execCBlock([s.body], ctx, env); else if (s.orelse) execCBlock([s.orelse], ctx, env);
        break;
      }
      case 'while': {
        for (;;) {
          ctx.tick();
          let ok;
          try { ok = truthy(evalExpr(s.header, ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ok = false; } else throw e; }
          if (!ok) break;
          try { execCBlock([s.body], ctx, env); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
        }
        break;
      }
      case 'for': {
        const iter = /^(?:(?:const|let|var|final)\s+)?(?:[\w:<>,]+&?\s+)*([A-Za-z_$][\w$]*)\s*(?::|\bof\b)\s*([\s\S]+)$/.exec(s.header);
        if (splitTop(s.header, ';').length < 3 && iter) {
          let coll;
          try { coll = val(evalExpr(iter[2], ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; break; } throw e; }
          const items = typeof coll === 'string' ? coll.split('') : coll;
          if (!Array.isArray(items)) { ctx.simulated++; break; }
          for (const it of Array.from(items)) {
            ctx.tick(); env.set(iter[1], it);
            try { execCBlock([s.body], ctx, env); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
          }
          break;
        }
        const [init, cond, incr] = splitTop(s.header, ';');
        if (init === undefined || incr === undefined) { ctx.simulated++; break; }
        if (init.trim()) execCSimple(init.trim(), ctx, env);
        for (;;) {
          ctx.tick();
          if (cond.trim()) {
            let ok;
            try { ok = truthy(evalExpr(cond, ctx, env)); } catch (e) { if (e instanceof Unsupported) { ctx.simulated++; ok = false; } else throw e; }
            if (!ok) break;
          }
          let brk = false;
          try { execCBlock([s.body], ctx, env); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') brk = true; else if (!(sig instanceof Signal && sig.kind === 'continue')) throw sig; }
          if (brk) break;
          for (const part of splitTop(incr, ',')) if (part.trim()) execCSimple(part.trim(), ctx, env);
        }
        break;
      }
      default: break;
    }
  }
}

function cStatic(code, lang) {
  const stack = []; let q = null; let line = 1;
  const src = stripComments(code, lang);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\n') { line++; if (q === '"') return { line, msg: lang === 'Java' ? 'unclosed string literal' : 'missing terminating " character' }; q = q === "'" ? null : q; continue; }
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if ('([{'.includes(c)) stack.push({ c, line });
    else if (')]}'.includes(c)) {
      const top = stack.pop();
      if (!top || { ')': '(', ']': '[', '}': '{' }[c] !== top.c) return { line, msg: lang === 'Java' ? 'class, interface, enum, or record expected' : `expected declaration before '${c}' token` };
    }
  }
  if (stack.length) {
    const c = stack[stack.length - 1].c;
    return { line, msg: lang === 'Java' ? 'reached end of file while parsing' : c === '{' ? "expected '}' at end of input" : `expected '${{ '(': ')', '[': ']' }[c]}' at end of input` };
  }
  return null;
}

function runCLike(code, ctx) {
  const lang = ctx.lang;
  const isJava = lang === 'Java';
  const file = isJava ? 'Main.java' : 'main.cpp';
  const src = stripComments(code, lang);

  const syn = cStatic(code, lang);
  if (syn) return { compileError: true, stderr: `${file}:${syn.line}: error: ${syn.msg}\n${isJava ? '1 error' : ''}\n` };

  if (isJava) {
    const pc = /\bpublic\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/.exec(src);
    if (pc && pc[1] !== 'Main') {
      const line = src.slice(0, pc.index).split('\n').length;
      return { compileError: true, stderr: `Main.java:${line}: error: class ${pc[1]} is public, should be declared in a file named ${pc[1]}.java\n1 error\n` };
    }
  }
  const mainRe = isJava ? /\bstatic\s+void\s+main\s*\([^)]*\)\s*(?:throws\s+[\w.,\s]+)?\{/ : /\b(?:int|void)\s+main\s*\([^)]*\)\s*\{/;
  const mm = mainRe.exec(src);
  if (!mm) {
    return isJava
      ? { runtimeError: true, stderr: 'Error: Main method not found in class Main, please define the main method as:\n   public static void main(String[] args)\n' }
      : { compileError: true, stderr: "/usr/bin/ld: /usr/lib/gcc/x86_64-linux-gnu/crt1.o: in function `_start':\n(.text+0x1b): undefined reference to `main'\ncollect2: error: ld returned 1 exit status\n" };
  }
  const bodyText = extractBlock(src, mm.index + mm[0].length - 1);
  const stmts = parseCStatements(bodyText);
  const env = new Map();
  try { execCBlock(stmts, ctx, env); } catch (e) {
    if (e instanceof Signal) return {};
    if (e instanceof SimError) {
      if (isJava) return { runtimeError: true, stderr: `Exception in thread "main" java.lang.${e.type}: ${e.message}\n\tat Main.main(Main.java)\n` };
      return { runtimeError: true, exitCode: 136, stderr: 'Floating point exception (core dumped)\n' };
    }
    throw e;
  }
  return {};
}

function runJavaScript(code, ctx) {
  const src = stripComments(code, 'JavaScript');
  const stmts = parseCStatements(src);
  const env = new Map();
  try { execCBlock(stmts, ctx, env); } catch (e) {
    if (e instanceof Signal) return {};
    if (e instanceof SimError) return { runtimeError: true, stderr: `${e.type}: ${e.message}\n` };
    throw e;
  }
  return {};
}

/* -------------------------------------------------------------------- API */

const SUPPORTED = new Set(['JavaScript', 'Python', 'C++', 'Java']);

/**
 * mockExecute({ language, code, stdin }) → same shape as the real executor, plus
 * { mock: true, executionMode: 'Mock Execution', note }. Never throws for user code.
 */
function mockExecute({ language, code, stdin = '' }) {
  const result = {
    language, version: null, stdout: '', stderr: '', exitCode: 0,
    compileError: false, timedOut: false,
    mock: true, executionMode: 'Mock Execution', note: '',
  };
  const baseNote = `Mock Execution — this output was produced by the built-in simulator, not a real ${language} runtime.`;
  result.note = baseNote;

  if (!SUPPORTED.has(language) || typeof code !== 'string' || !code.trim()) {
    result.stderr = 'No code to run.';
    result.exitCode = 1;
    return result;
  }

  const ctx = makeCtx(language, code, stdin);
  let outcome = {};
  try {
    outcome = language === 'Python' ? runPython(code, ctx) : language === 'JavaScript' ? runJavaScript(code, ctx) : runCLike(code, ctx);
  } catch (e) {
    if (e instanceof TimeoutSim) {
      result.timedOut = true; result.exitCode = null;
      result.stderr = 'Execution timed out. Check for infinite loops or reduce the workload.';
    } else {
      // Anything unexpected inside the simulator must never surface as a failure.
      ctx.simulated++;
      outcome = {};
    }
  }

  result.stdout = ctx.out + (ctx.truncated ? '\n… (output truncated)' : '');
  if (!result.timedOut) {
    result.stderr = (ctx.err || '') + (outcome.stderr || '');
    result.compileError = !!outcome.compileError;
    result.exitCode = outcome.compileError || outcome.runtimeError ? (outcome.exitCode ?? 1) : 0;
  }
  if (ctx.simulated > 0 && !result.compileError) {
    result.note += ' Parts that call your own functions or use features the simulator doesn\'t support are shown as <simulated: …>.';
    if (!result.stdout && !result.stderr && !result.timedOut) {
      result.stdout = `[Mock] ${language} code parsed successfully, but its result could not be simulated (it doesn't print anything the simulator can evaluate).`;
    }
  }
  return result;
}

module.exports = { mockExecute };
