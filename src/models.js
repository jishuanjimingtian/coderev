/**
 * Model Templates — built-in hot model presets for coderev.
 *
 * Usage:
 *   coderev config --model deepseek          # switch to DeepSeek template
 *   coderev config --model openai --fallback qwen  # primary + fallback
 *   coderev config --agent-security deepseek --agent-quality qwen
 *   coderev models                           # list all templates
 *
 * Each template provides provider + baseURL + default model,
 * user only needs to set the corresponding API key env var.
 */

const BUILTIN_TEMPLATES = {
  deepseek: {
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    desc: 'DeepSeek V3 — 国产高性价比，¥1/百万token',
    tier: 'recommended',
  },
  'deepseek-r1': {
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-reasoner',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    desc: 'DeepSeek R1 — 推理增强，适合复杂漏洞分析',
    tier: 'reasoning',
  },
  openai: {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    desc: 'GPT-4o — OpenAI 多模态旗舰',
    tier: 'standard',
  },
  'openai-o3': {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'o3-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    desc: 'OpenAI o3-mini — 推理型，速度快',
    tier: 'reasoning',
  },
  qwen: {
    provider: 'openai',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    desc: '通义千问 Qwen-Plus — 中文能力强，¥0.8/百万token',
    tier: 'standard',
  },
  'qwen-coder': {
    provider: 'openai',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-coder-plus',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    desc: '通义千问 Coder — 代码专精，¥2/百万token',
    tier: 'recommended',
  },
  claude: {
    provider: 'openai',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    desc: 'Claude Sonnet 4 — 代码理解深度最强',
    tier: 'standard',
  },
  gemini: {
    provider: 'openai',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-pro',
    apiKeyEnv: 'GEMINI_API_KEY',
    desc: 'Gemini 2.5 Pro — Google，100万token上下文',
    tier: 'standard',
  },
  zhipu: {
    provider: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    apiKeyEnv: 'ZHIPU_API_KEY',
    desc: '智谱 GLM-4-Plus — 国产强推理',
    tier: 'standard',
  },
  moonshot: {
    provider: 'openai',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    desc: '月之暗面 Kimi — 长文本处理强',
    tier: 'standard',
  },
  codestral: {
    provider: 'openai',
    baseURL: 'https://api.mistral.ai/v1',
    model: 'codestral-latest',
    apiKeyEnv: 'MISTRAL_API_KEY',
    desc: 'Mistral Codestral — 专注代码生成与审查',
    tier: 'standard',
  },
};

/**
 * Resolve a model template by name, with optional user overrides.
 * Returns a full ai config block ready for use.
 *
 * @param {string} templateName - Template name (e.g. 'deepseek', 'qwen')
 * @param {object} [overrides] - User overrides (model, baseURL, provider, etc.)
 * @returns {object} Resolved ai config
 */
function resolveTemplate(templateName, overrides = {}) {
  const template = BUILTIN_TEMPLATES[templateName];
  if (!template) {
    throw new Error(
      `Unknown model template "${templateName}". ` +
      `Available: ${Object.keys(BUILTIN_TEMPLATES).join(', ')}`
    );
  }

  return {
    provider: overrides.provider || template.provider,
    baseURL: overrides.baseURL || template.baseURL,
    model: overrides.model || template.model,
    apiKeyEnv: overrides.apiKeyEnv || template.apiKeyEnv,
    temperature: overrides.temperature ?? 0.3,
    maxTokens: overrides.maxTokens || 4096,
    _template: templateName,
  };
}

/**
 * List all built-in templates with key info.
 * @returns {Array<{name: string, provider: string, model: string, apiKeyEnv: string, desc: string, tier: string}>}
 */
function listTemplates() {
  return Object.entries(BUILTIN_TEMPLATES).map(([name, t]) => ({
    name,
    provider: t.provider,
    model: t.model,
    apiKeyEnv: t.apiKeyEnv,
    desc: t.desc,
    tier: t.tier,
  }));
}

/**
 * Get a single template by name. Returns null if not found.
 */
function getTemplate(name) {
  return BUILTIN_TEMPLATES[name] || null;
}

module.exports = {
  BUILTIN_TEMPLATES,
  resolveTemplate,
  listTemplates,
  getTemplate,
};
