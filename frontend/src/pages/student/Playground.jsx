import { useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { runCode } from '../../services/execute.service.js';

const languages = ['JavaScript', 'Python', 'C++', 'Java'];

// Full, runnable starter programs (not bare functions) so "Run" produces real output immediately.
const starter = {
  JavaScript: `function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n\nconsole.log(twoSum([2, 7, 11, 15], 9));`,
  Python: `def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        need = target - n\n        if need in seen:\n            return [seen[need], i]\n        seen[n] = i\n    return []\n\nprint(two_sum([2, 7, 11, 15], 9))`,
  'C++': `#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int,int> seen;\n    for (int i = 0; i < (int)nums.size(); i++) {\n        int need = target - nums[i];\n        if (seen.count(need)) return {seen[need], i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}\n\nint main() {\n    vector<int> nums = {2, 7, 11, 15};\n    auto res = twoSum(nums, 9);\n    cout << res[0] << " " << res[1] << endl;\n    return 0;\n}`,
  Java: `import java.util.*;\n\npublic class Main {\n    static int[] twoSum(int[] nums, int target) {\n        Map<Integer,Integer> seen = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            int need = target - nums[i];\n            if (seen.containsKey(need)) return new int[]{seen.get(need), i};\n            seen.put(nums[i], i);\n        }\n        return new int[]{};\n    }\n\n    public static void main(String[] args) {\n        int[] nums = {2, 7, 11, 15};\n        int[] res = twoSum(nums, 9);\n        System.out.println(res[0] + " " + res[1]);\n    }\n}`,
};

/**
 * Coding Playground — sends code to the backend's `/api/execute` endpoint.
 * JavaScript runs in an isolated local sandbox; Python, C++ and Java run on the
 * backend's built-in mock execution engine, so no external execution service is
 * needed. Mock results are labelled "Mock Execution" in the output panel.
 */
export default function Playground() {
  const [language, setLanguage] = useState('JavaScript');
  const [code, setCode] = useState(starter.JavaScript);
  const [stdin, setStdin] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const changeLanguage = (lang) => {
    setLanguage(lang);
    setCode(starter[lang]);
    setResult(null);
    setError('');
  };

  const run = async () => {
    if (!code.trim()) {
      setResult(null);
      setError('Write some code first, then press Run.');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const data = await runCode({ language, code, stdin });
      setResult(data);
    } catch (err) {
      setError(
        err.response
          ? err.response.data?.message || 'Failed to run your code. Please try again.'
          : 'Could not reach the server. Check your connection and try again — your code is still here.'
      );
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setCode(starter[language]);
    setStdin('');
    setResult(null);
    setError('');
  };

  const clearOutput = () => setResult(null);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Coding Playground</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Write, run, and debug code — JavaScript runs in a sandbox; other languages use built-in mock execution</p>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select value={language} onChange={(e) => changeLanguage(e.target.value)} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none">
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <Button onClick={run} disabled={running} className="w-auto px-5">{running ? 'Running…' : '▶ Run'}</Button>
        <Button onClick={reset} variant="ghost" className="w-auto px-5">Reset</Button>
        {result && <Button onClick={clearOutput} variant="ghost" className="w-auto px-5">Clear output</Button>}
      </div>

      <ErrorBanner message={error} onRetry={run} />

      <Card className="p-0 overflow-hidden mb-3">
        <textarea
          className="w-full min-h-[320px] bg-[#0a0f1c] text-gray-100 font-mono text-[13px] p-4 outline-none resize-y leading-relaxed"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Card>

      <Card className="p-4 mb-4">
        <div className="text-[11px] text-gray-500 mb-1.5 font-bold uppercase">Stdin (optional input for your program)</div>
        <textarea
          className="w-full min-h-[60px] bg-white/[0.03] border border-white/10 rounded-lg text-gray-100 font-mono text-[12.5px] p-2.5 outline-none resize-y"
          spellCheck={false}
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
        />
      </Card>

      {running && (
        <Card className="p-4 bg-black/40 mb-4">
          <p className="text-[12.5px] text-gray-400">Compiling and running…</p>
        </Card>
      )}

      {result && (
        <Card className="p-4 bg-black/40 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-gray-500 font-bold uppercase">Output</div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-gray-500">Execution Mode: {result.mock ? 'Mock Execution' : 'Live Execution'}</span>
              {result.version && <span className="text-gray-500">{language} {result.version}</span>}
              <span className={`px-2 py-0.5 rounded-full font-semibold ${result.exitCode === 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                {result.timedOut ? 'Timed out' : result.exitCode === 0 ? 'Success' : result.compileError ? 'Compile error' : 'Runtime error'}
              </span>
            </div>
          </div>
          {result.stdout && <pre className="text-[12.5px] text-green-400 font-mono whitespace-pre-wrap mb-2">{result.stdout}</pre>}
          {result.stderr && <pre className="text-[12.5px] text-red-400 font-mono whitespace-pre-wrap">{result.stderr}</pre>}
          {!result.stdout && !result.stderr && <p className="text-[12.5px] text-gray-500">(no output)</p>}
          {result.mock && result.note && <p className="text-[11.5px] text-gray-500 mt-3 pt-2 border-t border-white/10">{result.note}</p>}
        </Card>
      )}
    </div>
  );
}
