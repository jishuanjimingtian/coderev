const test = require('node:test');
const assert = require('node:assert');
const { formatIncrementalPRMarkdown, findOpenPRsForBranch, fetchCommitDiff } = require('./github-app');

test('formatIncrementalPRMarkdown should generate valid markdown', () => {
  const result = {
    score: 85,
    issues: [
      { type: 'warning', severity: 'medium', message: 'Missing semicolon', file: 'src/test.js', line: 42, suggestion: 'Add a semicolon at the end' },
      { type: 'error', severity: 'high', message: 'Null check missing', file: 'src/app.js', line: 15 }
    ],
    summary: 'Good code overall, minor issues found',
    praise: ['Good use of async patterns']
  };

  const ref = { owner: 'test', repo: 'repo', pr: 123 };
  const commitSha = 'abc123def456';
  const branchName = 'feature/test';

  const md = formatIncrementalPRMarkdown(result, ref, commitSha, branchName);

  assert.ok(md.includes('coderev Incremental Review'));
  assert.ok(md.includes('85/100'));
  assert.ok(md.includes('**Issues found:** 2'));
  assert.ok(md.includes('Missing semicolon'));
  assert.ok(md.includes('Null check missing'));
  assert.ok(md.includes('`src/test.js`'));
  assert.ok(md.includes('Add a semicolon'));
  assert.ok(md.includes('Incremental Score'));
});

test('formatIncrementalPRMarkdown should handle empty issues', () => {
  const result = {
    score: 100,
    issues: [],
    summary: 'Perfect code!'
  };

  const ref = { owner: 'test', repo: 'repo', pr: 123 };
  const commitSha = 'abc123def456';
  const branchName = 'feature/test';

  const md = formatIncrementalPRMarkdown(result, ref, commitSha, branchName);

  assert.ok(md.includes('**Issues found:** 0'));
  assert.ok(md.includes('100/100'));
});

test('formatIncrementalPRMarkdown should truncate more than 10 issues', () => {
  const issues = [];
  for (let i = 0; i < 15; i++) {
    issues.push({ type: 'warning', severity: 'low', message: `Issue ${i}`, file: `file${i}.js`, line: i });
  }

  const result = { score: 50, issues };
  const ref = { owner: 'test', repo: 'repo', pr: 123 };
  const commitSha = 'abc123def456';
  const branchName = 'feature/test';

  const md = formatIncrementalPRMarkdown(result, ref, commitSha, branchName);

  assert.ok(md.includes('**Issues found:** 15'));
  assert.ok(md.includes('and 5 more issues'));
});

// Mock tests for API functions (would require actual GitHub token for integration tests)
test('fetchCommitDiff function exists', () => {
  assert.strictEqual(typeof fetchCommitDiff, 'function');
});

test('findOpenPRsForBranch function exists', () => {
  assert.strictEqual(typeof findOpenPRsForBranch, 'function');
});

// Test handlePushEvent edge cases (mocked)
test('handlePushEvent should skip new branch creation', async () => {
  const { handlePushEvent } = require('./github-app');
  
  const payload = {
    repository: { owner: { login: 'test' }, name: 'repo' },
    before: '0000000000000000000000000000000000000000',
    after: 'abc123',
    ref: 'refs/heads/main',
    installation: { id: 123 },
    forced: false
  };

  const appConfig = {
    appId: '123',
    privateKey: 'dummy',
    webhookSecret: 'secret'
  };

  const result = await handlePushEvent('push', payload, appConfig);
  assert.strictEqual(result.handled, false);
  assert.ok(result.reason.includes('new branch creation'));
});

test('handlePushEvent should skip force pushes', async () => {
  const { handlePushEvent } = require('./github-app');
  
  const payload = {
    repository: { owner: { login: 'test' }, name: 'repo' },
    before: 'abc123',
    after: 'def456',
    ref: 'refs/heads/main',
    installation: { id: 123 },
    forced: true
  };

  const appConfig = {
    appId: '123',
    privateKey: 'dummy',
    webhookSecret: 'secret'
  };

  const result = await handlePushEvent('push', payload, appConfig);
  assert.strictEqual(result.handled, false);
  assert.ok(result.reason.includes('force push skipped'));
});

test('handlePushEvent should skip non-branch refs', async () => {
  const { handlePushEvent } = require('./github-app');
  
  const payload = {
    repository: { owner: { login: 'test' }, name: 'repo' },
    before: 'abc123',
    after: 'def456',
    ref: 'refs/tags/v1.0.0',
    installation: { id: 123 },
    forced: false
  };

  const appConfig = {
    appId: '123',
    privateKey: 'dummy',
    webhookSecret: 'secret'
  };

  const result = await handlePushEvent('push', payload, appConfig);
  assert.strictEqual(result.handled, false);
  assert.ok(result.reason.includes('not a branch push'));
});
