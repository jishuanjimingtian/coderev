const { describe, it } = require('node:test');
const assert = require('assert');
const { BUILTIN_TEMPLATES, resolveTemplate, listTemplates, getTemplate } = require('./models');

describe('models.js', () => {
  it('should have all 11 built-in templates', () => {
    const templates = listTemplates();
    assert.strictEqual(templates.length, 11);
  });

  it('should resolve deepseek template correctly', () => {
    const result = resolveTemplate('deepseek');
    assert.strictEqual(result.provider, 'deepseek');
    assert.strictEqual(result.model, 'deepseek-chat');
    assert.strictEqual(result.baseURL, 'https://api.deepseek.com');
    assert.strictEqual(result.apiKeyEnv, 'DEEPSEEK_API_KEY');
    assert.strictEqual(result._template, 'deepseek');
  });

  it('should resolve qwen template with openai-compatible provider', () => {
    const result = resolveTemplate('qwen');
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.model, 'qwen-plus');
    assert.ok(result.baseURL.includes('dashscope'));
    assert.strictEqual(result.apiKeyEnv, 'DASHSCOPE_API_KEY');
  });

  it('should apply user overrides on template', () => {
    const result = resolveTemplate('openai', {
      model: 'gpt-4o-mini',
      temperature: 0.1,
    });
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.model, 'gpt-4o-mini');
    assert.strictEqual(result.temperature, 0.1);
    assert.strictEqual(result._template, 'openai');
  });

  it('should throw on unknown template', () => {
    assert.throws(() => resolveTemplate('nonexistent'), {
      message: /Unknown model template/,
    });
  });

  it('getTemplate should return null for unknown', () => {
    assert.strictEqual(getTemplate('nonexistent'), null);
  });

  it('getTemplate should return object for known', () => {
    const t = getTemplate('deepseek');
    assert.ok(t);
    assert.strictEqual(t.model, 'deepseek-chat');
  });

  it('listTemplates should return array with required fields', () => {
    const templates = listTemplates();
    for (const t of templates) {
      assert.ok(t.name, `template should have name: ${JSON.stringify(t)}`);
      assert.ok(t.provider, `template should have provider: ${JSON.stringify(t)}`);
      assert.ok(t.model, `template should have model: ${JSON.stringify(t)}`);
      assert.ok(t.apiKeyEnv, `template should have apiKeyEnv: ${JSON.stringify(t)}`);
      assert.ok(t.desc, `template should have desc: ${JSON.stringify(t)}`);
    }
  });

  it('should have recommended and reasoning tiers', () => {
    const templates = listTemplates();
    const recommended = templates.filter(t => t.tier === 'recommended');
    const reasoning = templates.filter(t => t.tier === 'reasoning');
    assert.ok(recommended.length >= 2, 'should have at least 2 recommended templates');
    assert.ok(reasoning.length >= 2, 'should have at least 2 reasoning templates');
  });

  it('deepseek-r1 should be a reasoning model', () => {
    const t = getTemplate('deepseek-r1');
    assert.ok(t);
    assert.strictEqual(t.tier, 'reasoning');
    assert.strictEqual(t.model, 'deepseek-reasoner');
  });
});
