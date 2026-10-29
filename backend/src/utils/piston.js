/**
 * Code executor — used by the free-form Playground (/api/execute). Coding Problems are
 * learning-only and no longer execute code. Python/C++/Java use mockExecutor.js by default.
 *
 * JavaScript runs LOCALLY in an isolated, resource-capped Node.js subprocess
 * (see runJavaScriptLocally below) — this was moved off the public Piston
 * API because that free, unauthenticated instance is rate-limited and
 * documented by its own maintainers as running "at capacity", which was
 * causing consistent failures in production even with retries. Other
 * languages (Python, C++, Java) still run via Piston, since executing those
 * safely would require installing their compilers/interpreters on this
 * server, which is out of scope here — Piston keeps its retry logic for
 * transient failures on those languages.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { mockExecute } = require('./mockExecutor');

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const REQUEST_TIMEOUT_MS = 13000;

const LANGUAGE_MAP = {
  JavaScript: { language: 'javascript', version: '*', filename: 'main.js' },
  Python: { language: 'python', version: '*', filename: 'main.py' },
  'C++': { language: 'cpp', version: '*', filename: 'main.cpp' },
  Java: { language: 'java', version: '*', filename: 'Main.java' },
};

// ---------------------------------------------------------------------------
// Local JavaScript execution (isolated OS subprocess, not Piston)
// ---------------------------------------------------------------------------

const JS_TIMEOUT_MS = 8000;
const JS_MAX_OUTPUT_CHARS = 200 * 1000; // 200k chars — plenty for a coding exercise, caps runaway output

/**
 * Runs student JavaScript in a separate `node` child process (isolated from
 * this server's own process/memory), with:
 *  - a hard wall-clock timeout (kills the process — protects against infinite loops)
 *  - a capped V8 heap size for the child (protects against memory-bomb code)
 *  - stdin backed by a real temp FILE (not a pipe) so the extremely common
 *    `require('fs').readFileSync('/dev/stdin', 'utf8')` idiom — used by every
 *    starter solution in this app, Two Sum included — resolves correctly.
 *    (A pipe has no filesystem path, so re-opening '/dev/stdin' by path
 *    throws ENXIO on a pipe; a real file doesn't have that problem.)
 *  - stdout/stderr captured and truncated if a program tries to print unbounded output
 *
 * This is a process-level sandbox (separate OS process, capped time/memory,
 * always killed and cleaned up) rather than a full untrusted-code security
 * sandbox — it does not block filesystem/network access from within the
 * child process. For a placement-prep practice tool where users only run
 * their own submitted solutions this is a reasonable, honest trade-off; a
 * production judge serving untrusted third parties at scale should add
 * container-level isolation (e.g. gVisor/Firecracker) on top of this.
 */
function runJavaScriptLocally({ code, stdin }) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomBytes(8).toString('hex');
    const codeFile = path.join(os.tmpdir(), `nexthire-exec-${id}.js`);
    const stdinFile = path.join(os.tmpdir(), `nexthire-stdin-${id}.txt`);
    const cleanup = () => {
      fs.unlink(codeFile, () => {});
      fs.unlink(stdinFile, () => {});
    };

    let stdinFd;
    try {
      fs.writeFileSync(codeFile, code, 'utf8');
      fs.writeFileSync(stdinFile, stdin || '', 'utf8');
      stdinFd = fs.openSync(stdinFile, 'r');
    } catch (setupErr) {
      cleanup();
      return reject(setupErr);
    }

    let child;
    try {
      child = spawn(process.execPath, ['--max-old-space-size=64', codeFile], {
        // stdio[0] is a real file fd (not a pipe) so /dev/stdin resolves for readers;
        // Node duplicates it for the child, so we close our own copy right after spawning.
        stdio: [stdinFd, 'pipe', 'pipe'],
      });
    } catch (spawnErr) {
      fs.closeSync(stdinFd);
      cleanup();
      return reject(spawnErr);
    }
    fs.close(stdinFd, () => {});

    let stdout = '';
    let stderr = '';
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, JS_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      if (stdout.length < JS_MAX_OUTPUT_CHARS) stdout += chunk.toString();
      else outputTruncated = true;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < JS_MAX_OUTPUT_CHARS) stderr += chunk.toString();
      else outputTruncated = true;
    });

    child.on('error', (spawnErr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(spawnErr);
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        language: 'JavaScript',
        version: process.version,
        stdout: stdout + (outputTruncated ? '\n… (output truncated)' : ''),
        stderr: timedOut ? 'Execution timed out. Check for infinite loops or reduce the workload.' : stderr,
        exitCode: timedOut ? null : exitCode,
        compileError: false,
        timedOut,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Piston fallback — Python, C++, Java, and JavaScript if local exec fails
// ---------------------------------------------------------------------------

// The public Piston instance (emkc.org) is documented by its maintainers as
// rate-limited to 5 req/s and "at capacity" — under normal load it can
// intermittently return 429/502/503 for a moment. A short retry with backoff
// absorbs those transient blips without the student ever seeing an error for
// something that would have succeeded on the next attempt.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callPistonOnce({ pistonLanguage, version, filename, code, stdin }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const pistonRes = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        language: pistonLanguage,
        version,
        files: [{ name: filename, content: code }],
        stdin: stdin || '',
        compile_timeout: 10000,
        run_timeout: 8000,
        compile_memory_limit: -1,
        run_memory_limit: -1,
      }),
    });

    if (!pistonRes.ok) {
      const bodyText = await pistonRes.text().catch(() => '');
      const err = new Error(`Piston responded ${pistonRes.status}: ${bodyText.slice(0, 300)}`);
      err.upstreamStatus = pistonRes.status;
      throw err;
    }
    return await pistonRes.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Piston request timed out');
      timeoutErr.upstreamStatus = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function runOnPistonRemote({ language, code, stdin }) {
  const { language: pistonLanguage, version, filename } = LANGUAGE_MAP[language];
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callPistonOnce({ pistonLanguage, version, filename, code, stdin });
      const compile = result.compile || null;
      const run = result.run || {};
      const compileFailed = compile && compile.code !== 0;

      return {
        language,
        version: result.version,
        stdout: run.stdout || '',
        stderr: compileFailed ? compile.stderr : run.stderr || '',
        exitCode: compileFailed ? compile.code : run.code,
        compileError: compileFailed,
        timedOut: run.signal === 'SIGKILL',
      };
    } catch (err) {
      lastErr = err;
      const isRetryable = !err.upstreamStatus || RETRYABLE_STATUS.has(err.upstreamStatus);
      // eslint-disable-next-line no-console
      console.error(`[piston] attempt ${attempt}/${MAX_ATTEMPTS} failed${err.upstreamStatus ? ` (status ${err.upstreamStatus})` : ''}: ${err.message}`);
      if (!isRetryable || attempt === MAX_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS * attempt); // 800ms, then 1600ms
    }
  }

  const friendly =
    lastErr?.upstreamStatus === 504
      ? 'Execution timed out. Check for infinite loops or reduce the workload.'
      : 'The code execution service is currently unavailable after retrying. Please try again shortly.';
  throw Object.assign(new Error(friendly), { statusCode: lastErr?.upstreamStatus === 504 ? 504 : 502 });
}

async function runOnPiston({ language, code, stdin }) {
  if (!LANGUAGE_MAP[language]) {
    throw Object.assign(new Error(`Unsupported language. Choose one of: ${Object.keys(LANGUAGE_MAP).join(', ')}.`), { statusCode: 400 });
  }
  if (typeof code !== 'string' || !code.trim()) {
    throw Object.assign(new Error('No code to run.'), { statusCode: 400 });
  }

  if (language === 'JavaScript') {
    try {
      return await runJavaScriptLocally({ code, stdin });
    } catch (localErr) {
      // Local execution should basically never fail (it's just spawning `node`), but if the
      // host environment somehow blocks child_process, fall back to the mock engine rather than erroring out.
      console.error('[exec] Local JavaScript execution failed, using mock execution:', localErr.message);
      return mockExecute({ language, code, stdin });
    }
  }

  // Python / C++ / Java: the public Piston service is no longer required. By default these run on the
  // built-in mock engine (see mockExecutor.js), so the Playground works with no external dependency.
  // Set USE_PISTON=true to try real execution first; any Piston failure still falls back to the mock engine.
  if (process.env.USE_PISTON === 'true') {
    try {
      return await runOnPistonRemote({ language, code, stdin });
    } catch (remoteErr) {
      console.error('[exec] Piston unavailable, using mock execution:', remoteErr.message);
    }
  }
  return mockExecute({ language, code, stdin });
}

module.exports = { runOnPiston, LANGUAGE_MAP, MAX_CODE_LENGTH: 20000 };
