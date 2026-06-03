const { spawnSync } = require('child_process');
const fs = require('fs');

// 模拟 GitHub Actions 环境
const env = { ...process.env, DEEPSEEK_API_KEY: '***', OPENAI_API_KEY: '***' };
const diff = fs.readFileSync('C:\\Users\\十号\\AppData\\Local\\Temp\\test.diff', 'utf8');
console.log('=== DIFF SIZE ===', diff.length, 'bytes\n');

// 测试1：单 agent 模式（workflow 用的）
const r1 = spawnSync('node', ['src/cli.js', 'review', '--output', 'markdown', '--single'], {
  cwd: 'C:\\Users\\十号\\.openclaw\\workspace\\projects\\coderev',
  env, input: diff, timeout: 120000, maxBuffer: 10*1024*1024, encoding: 'utf8'
});
console.log('=== TEST 1: single agent ===');
console.log('EXIT:', r1.status);
if (r1.stderr && r1.stderr.includes('not found')) console.log('FAIL: API key not found');
else if (r1.stdout && r1.stdout.includes('Code Review Report')) console.log('PASS');
else console.log('STDERR:', r1.stderr?.substring(0, 200));

// 测试2：并行 agent 模式
const r2 = spawnSync('node', ['src/cli.js', 'review', '--output', 'markdown'], {
  cwd: 'C:\\Users\\十号\\.openclaw\\workspace\\projects\\coderev',
  env, input: diff, timeout: 120000, maxBuffer: 10*1024*1024, encoding: 'utf8'
});
console.log('\n=== TEST 2: parallel agents ===');
console.log('EXIT:', r2.status);
if (r2.stderr && r2.stderr.includes('not found')) console.log('FAIL: API key not found');
else if (r2.stdout && r2.stdout.includes('Code Review Report')) console.log('PASS');
else console.log('STDERR:', r2.stderr?.substring(0, 200));
