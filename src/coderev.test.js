const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('config.js', () => {
  const { loadConfig, getApiKey, DEFAULTS } = require('./config');

  it('should return defaults when config file not found', () => {
    const config = loadConfig('/nonexistent-config-path.json');
    assert.ok(config.ai);
    assert.equal(config.ai.provider, 'openai');
    assert.equal(config.rules.maxLineLength, 100);
  });

  it('should merge user config with defaults', () => {
    const merged = loadConfig.__proto__; // placeholder: we test mergeDefaults via loadConfig
    // Actually call the module's internal behavior
    const fs = require('fs');
    const path = require('path');
    const tmpFile = path.join(require('os').tmpdir(), '.coderevrc-test.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ ai: { model: 'gpt-4o-mini' } }));
    const config = loadConfig(tmpFile);
    assert.equal(config.ai.model, 'gpt-4o-mini');
    assert.equal(config.ai.provider, 'openai'); // from defaults
    assert.equal(config.rules.maxLineLength, 100); // from defaults
    fs.unlinkSync(tmpFile);
  });

  it('should throw on missing API key', () => {
    const config = { ai: { provider: 'openai' } };
    assert.throws(() => getApiKey(config), /API key not found/);
  });

  it('should return API key from config', () => {
    const config = { ai: { apiKey: 'sk-test-key' } };
    assert.equal(getApiKey(config), 'sk-test-key');
  });

  it('should return API key from env var', () => {
    process.env.TEST_API_KEY = 'sk-env-key';
    const config = { ai: { apiKeyEnv: 'TEST_API_KEY' } };
    assert.equal(getApiKey(config), 'sk-env-key');
    delete process.env.TEST_API_KEY;
  });
});

describe('github.js', () => {
  const { parsePrRef, resolvePrRef } = require('./github');

  it('should parse owner/repo#42', () => {
    const ref = parsePrRef('facebook/react#42');
    assert.deepEqual(ref, { owner: 'facebook', repo: 'react', pr: 42 });
  });

  it('should parse full GitHub URL', () => {
    const ref = parsePrRef('https://github.com/vercel/next.js/pull/78020');
    assert.deepEqual(ref, { owner: 'vercel', repo: 'next.js', pr: 78020 });
  });

  it('should parse bare number', () => {
    const ref = parsePrRef('42');
    assert.deepEqual(ref, { owner: null, repo: null, pr: 42 });
  });

  it('should throw on invalid ref', () => {
    assert.throws(() => parsePrRef('not-valid'), /Invalid PR reference/);
  });
});

describe('rules.js', () => {
  const { getRuleDescriptions } = require('./rules');

  it('should return default rules when config is null', () => {
    const descs = getRuleDescriptions(null);
    assert.ok(descs.length > 0);
    assert.ok(descs.some(d => d.includes('security')));
  });

  it('should include custom rules', () => {
    const config = {
      custom: [
        { name: 'no-console', message: 'Avoid console.log', severity: 'warning' },
      ],
    };
    const descs = getRuleDescriptions(config);
    assert.ok(descs.some(d => d.includes('Avoid console.log')));
    assert.ok(descs.some(d => d.includes('[warning]')));
  });

  it('should skip disabled custom rules', () => {
    const config = {
      custom: [
        { name: 'disabled-rule', enabled: false, message: 'Should not appear' },
        { name: 'enabled-rule', message: 'Should appear' },
      ],
    };
    const descs = getRuleDescriptions(config);
    assert.ok(!descs.some(d => d.includes('Should not appear')));
    assert.ok(descs.some(d => d.includes('Should appear')));
  });

  it('should support predefined rule sets', () => {
    const config = {
      predefined: ['typescript', 'react'],
    };
    const descs = getRuleDescriptions(config);
    assert.ok(descs.some(d => d.includes('TypeScript')));
    assert.ok(descs.some(d => d.includes('React')));
  });
});

describe('cache.js', () => {
  const { cacheKey, getCached, setCached, cleanCache } = require('./cache');

  it('should generate consistent cache keys', () => {
    const a = cacheKey('hello world');
    const b = cacheKey('hello world');
    const c = cacheKey('different');
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('should store and retrieve cached values', () => {
    const key = cacheKey('test-diff-' + Date.now());
    const data = { summary: 'test', score: 75 };
    setCached(key, data);
    const retrieved = getCached(key);
    assert.deepEqual(retrieved, data);
  });

  it('should return null for non-existent keys', () => {
    const result = getCached('nonexistent-key-' + Date.now());
    assert.equal(result, null);
  });

  it('should clean expired cache', () => {
    const cleared = cleanCache(0); // 0 TTL = all expired
    assert.ok(typeof cleared === 'number');
  });
});

describe('reviewer.js', () => {
  const { parseReviewResponse } = require('./reviewer');

  it('should parse inline JSON', () => {
    const text = JSON.stringify({ summary: 'test', score: 80, issues: [] });
    const result = parseReviewResponse(text);
    assert.equal(result.summary, 'test');
    assert.equal(result.score, 80);
  });

  it('should parse JSON in markdown code blocks', () => {
    const text = 'Here is the review:\n```json\n{"summary": "parse from md", "score": 90, "issues": []}\n```';
    const result = parseReviewResponse(text);
    assert.equal(result.summary, 'parse from md');
    assert.equal(result.score, 90);
  });

  it('should handle malformed response gracefully', () => {
    const result = parseReviewResponse('This is not JSON at all');
    assert.equal(result.score, 0);
    assert.ok(result.issues.length > 0);
    assert.equal(result.issues[0].type, 'error');
  });
});
