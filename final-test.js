const { spawnSync, execSync } = require('child_process');

const projectDir = 'C:\\Users\\十号\\.openclaw\\workspace\\projects\\coderev';
const env = { ...process.env, DEEPSEEK_API_KEY: '***', OPENAI_API_KEY: '***' };

const diff = execSync('git diff HEAD~1..HEAD', { cwd: projectDir, encoding: 'utf8' });
console.log('=== DIFF SIZE ===', diff.length, 'bytes');

const result = spawnSync('node', ['src/cli.js', 'review', '--output', 'markdown', '--single'], {
  cwd: projectDir, env, input: diff,
  timeout: 120000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8'
});

console.log('=== EXIT CODE ===', result.status);
if (result.stderr) {
  const s = result.stderr.trim();
  if (s) console.log('=== STDERR ===\n' + s.substring(0, 300));
}
if (result.stdout) {
  const s = result.stdout.trim();
  if (s) console.log('=== STDOUT (first 1000 chars) ===\n' + s.substring(0, 1000));
}

if (result.status === 0) { console.log('\n=== ✅ ALL TESTS PASSED ==='); process.exit(0); }
else { console.log('\n=== ❌ FAILED ==='); process.exit(1); }
