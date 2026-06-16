const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const { BUILTIN_TEMPLATES, resolveTemplate, listTemplates, getTemplate, autoDetectProvider, AUTO_DETECT_PRIORITY } = require('./models');

describe('models.js', () => {
  it('should have all 14 built-in templates', () => {
    const templates = listTemplates();
    assert.strictEqual(templates.length, 14);
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

  it('should have recommended, reasoning, and fast tiers', () => {
    const templates = listTemplates();
    const recommended = templates.filter(t => t.tier === 'recommended');
    const reasoning = templates.filter(t => t.tier === 'reasoning');
    const fast = templates.filter(t => t.tier === 'fast');
    assert.ok(recommended.length >= 4, 'should have at least 4 recommended templates');
    assert.ok(reasoning.length >= 2, 'should have at least 2 reasoning templates');
    assert.ok(fast.length >= 1, 'should have at least 1 fast template');
  });

  it('deepseek-r1 should be a reasoning model', () => {
    const t = getTemplate('deepseek-r1');
    assert.ok(t);
    assert.strictEqual(t.tier, 'reasoning');
    assert.strictEqual(t.model, 'deepseek-reasoner');
  });
});

describe('autoDetectProvider', () => {
  const savedEnv = {};

  beforeEach(() => {
    // Save and clear all known API key env vars
    const allKeys = Object.values(BUILTIN_TEMPLATES).map(t => t.apiKeyEnv);
    for (const key of [...new Set(allKeys)]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  // Restore env vars after each test
  const { afterEach } = require('node:test');
  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  it('should return null when no API keys are set', () => {
    const result = autoDetectProvider();
    assert.strictEqual(result, null);
  });

  it('should detect a single available provider', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek-key';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'deepseek');
    assert.ok(result.allDetected.includes('deepseek'));
    assert.ok(result.allDetected.includes('deepseek-r1'));
    assert.strictEqual(result.template.model, 'deepseek-chat');
  });

  it('should prioritize gpt-5 over deepseek when both API keys are available', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek';
    process.env.OPENAI_API_KEY = 'sk-openai';
    const result = autoDetectProvider();
    assert.ok(result);
    // gpt-5 is highest priority when OPENAI_API_KEY is available
    assert.strictEqual(result.chosen, 'gpt-5');
    assert.ok(result.allDetected.includes('gpt-5'));
    assert.ok(result.allDetected.includes('gpt-5-minimal'));
    assert.ok(result.allDetected.includes('openai'));
    assert.ok(result.allDetected.includes('openai-o3'));
  });

  it('should detect haiku-thinking when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const result = autoDetectProvider();
    assert.ok(result);
    // haiku-thinking is higher priority than claude in AUTO_DETECT_PRIORITY
    assert.strictEqual(result.chosen, 'haiku-thinking');
    assert.ok(result.allDetected.includes('haiku-thinking'));
    assert.ok(result.allDetected.includes('claude'));
  });

  it('should detect qwen as fallback when deepseek is not available', () => {
    process.env.DASHSCOPE_API_KEY = 'sk-qwen';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'qwen-coder');
    assert.ok(result.allDetected.includes('qwen-coder'));
    assert.ok(result.allDetected.includes('qwen'));
  });

  it('should detect gpt-5 as top openai priority when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test';
    const result = autoDetectProvider();
    assert.ok(result);
    // gpt-5 is highest in AUTO_DETECT_PRIORITY among OPENAI_API_KEY users
    assert.strictEqual(result.chosen, 'gpt-5');
    assert.ok(result.allDetected.includes('gpt-5'));
    assert.ok(result.allDetected.includes('gpt-5-minimal'));
    assert.ok(result.allDetected.includes('openai'));
    assert.ok(result.allDetected.includes('openai-o3'));
  });

  it('should detect haiku-thinking as top priority when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const result = autoDetectProvider();
    assert.ok(result);
    // haiku-thinking is highest priority for ANTHROPIC_API_KEY
    assert.strictEqual(result.chosen, 'haiku-thinking');
  });

  it('should detect gemini when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'gemini');
  });

  it('should detect zhipu when ZHIPU_API_KEY is set', () => {
    process.env.ZHIPU_API_KEY = 'test-zhipu-key';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'zhipu');
  });

  it('should detect moonshot when MOONSHOT_API_KEY is set', () => {
    process.env.MOONSHOT_API_KEY = 'test-moonshot-key';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'moonshot');
  });

  it('should detect codestral when MISTRAL_API_KEY is set', () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    const result = autoDetectProvider();
    assert.ok(result);
    assert.strictEqual(result.chosen, 'codestral');
  });

  it('should return all detected providers in allDetected', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    process.env.OPENAI_API_KEY = 'sk-oa';
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    const result = autoDetectProvider();
    assert.ok(result);
    // gpt-5 highest priority (OPENAI_API_KEY + top of AUTO_DETECT_PRIORITY)
    assert.strictEqual(result.chosen, 'gpt-5');
    assert.ok(result.allDetected.includes('gpt-5'));
    assert.ok(result.allDetected.includes('openai'));
    assert.ok(result.allDetected.includes('deepseek'));
    assert.ok(result.allDetected.includes('haiku-thinking'));
    assert.ok(result.allDetected.includes('claude'));
  });

  it('AUTO_DETECT_PRIORITY should include all standard provider names', () => {
    const allNames = Object.keys(BUILTIN_TEMPLATES);
    const standardProviders = allNames.filter(n => {
      const t = BUILTIN_TEMPLATES[n];
      // Each unique apiKeyEnv should appear at least once
      return true;
    });
    // Priority should cover at least all standard-tier templates
    const standardKeys = [...new Set(
      allNames
        .filter(n => BUILTIN_TEMPLATES[n].tier !== 'reasoning')
        .map(n => BUILTIN_TEMPLATES[n].apiKeyEnv)
    )];
    // Check that priority covers each unique key
    const priorityKeys = [...new Set(
      AUTO_DETECT_PRIORITY.map(n => BUILTIN_TEMPLATES[n]?.apiKeyEnv).filter(Boolean)
    )];
    for (const key of standardKeys) {
      assert.ok(priorityKeys.includes(key), `Priority should include provider with key: ${key}`);
    }
  });
});
