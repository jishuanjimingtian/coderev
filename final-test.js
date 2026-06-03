const { spawnSync, execSync } = require('child_process');
const projectDir = 'C:\\Users\\十号\\.openclaw\\workspace\\projects\\coderev';
const env = { ...process.env, DEEPSEEK_API_KEY: '***', OPENAI_API_KEY: '***' };
const diff = execSync('git diff HEAD~1..HEAD', { cwd: projectDir, encoding: 'utf8' });

const r = spawnSync('node', ['src/cli.js', 'review', '--output', 'markdown'], {
  cwd: projectDir, env, input: diff, timeout: 180000, maxBuffer: 10*1024*1024, encoding: 'utf8'
});

console.log('EXIT:', r.status);
if (r.stderr) console.log('STDERR:', r.stderr.substring(0, 300));
if (r.stdout) console.log('OUTPUT includes Score:', r.stdout.includes('Score'));
if (r.status === 0) { console.log('✅ PASS'); process.exit(0); }
else { console.log('❌ FAIL'); process.exit(1); }
