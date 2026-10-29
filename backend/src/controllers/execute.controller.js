const { asyncHandler } = require('../middleware/errorHandler');
const { runOnPiston, LANGUAGE_MAP, MAX_CODE_LENGTH } = require('../utils/piston');

/**
 * Code execution.
 * JavaScript runs locally in an isolated, resource-capped Node.js subprocess
 * (see utils/piston.js) — separate process, capped memory, hard timeout,
 * always killed/cleaned up. Other languages (Python, C++, Java) are proxied
 * to Piston (https://github.com/engineer-man/piston), a free sandboxed
 * execution engine, since running their compilers/interpreters isn't
 * available on this server.
 *
 * We add our own layer on top regardless of which path runs: a language
 * whitelist, a max code length, a request timeout, and a dedicated rate
 * limiter (see middleware/rateLimiter).
 */

/** POST /api/execute — { language, code, stdin? } */
exports.executeCode = asyncHandler(async (req, res) => {
  const { language, code, stdin } = req.body;

  if (!language || !LANGUAGE_MAP[language]) {
    return res.status(400).json({ success: false, message: `Unsupported language. Choose one of: ${Object.keys(LANGUAGE_MAP).join(', ')}.` });
  }
  if (!code || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Code cannot be empty.' });
  }
  if (code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({ success: false, message: `Code exceeds the ${MAX_CODE_LENGTH}-character limit.` });
  }

  try {
    const data = await runOnPiston({ language, code, stdin });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    throw err;
  }
});
