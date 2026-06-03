const { spawnSync } = require('child_process');
const fs = require('fs');
const env = { ...process.env, DEEPSEEK_API_KEY: '***' };
const diff = fs.readFileSync('C:\\Users\\十号\\AppData\\Local\\Temp\\test.diff', 'utf8');
const r = spawnSync('node', ['src/cli.js', 'review', '--output', 'markdown', '--single'], {
  cwd: 'C:\\Users\\十号\\.openclaw\\workspace\\projects\\coderev',
  env, input: diff, timeout: 120000, maxBuffer: 10*1024*1024, encoding: 'utf8'
});
console.log('EXIT:', r.status);
if (r.stdout) console.log('STDOUT:', r.stdout.substring(0, 2000));
if (r.stderr) console.log('STDERR:', r.stderr.substring(0, 500));
