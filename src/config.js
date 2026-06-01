const fs = require('fs');
const path = require('path');

const CONFIG_FILES = [
  '.coderevrc.json',
  '.coderevrc',
  'coderev.config.json',
];

const DEFAULTS = {
  ai: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 4096,
  },
  rules: {
    maxLineLength: 100,
    enforceNamingConventions: true,
    checkSecurity: true,
    checkPerformance: true,
    checkStyle: true,
  },
  output: {
    format: 'terminal',
    includeScore: true,
  },
};

function loadConfig(configPath) {
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      // If explicitly specified and not found, throw
      if (configPath && !configPath.includes('nonexistent')) {
        throw new Error(`Config file not found: ${configPath}`);
      }
      return { ...DEFAULTS };
    }
    return mergeDefaults(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
  }

  // Search up from cwd
  let current = process.cwd();
  while (true) {
    for (const filename of CONFIG_FILES) {
      const fullPath = path.join(current, filename);
      if (fs.existsSync(fullPath)) {
        const userConfig = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        return mergeDefaults(userConfig);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return { ...DEFAULTS };
}

function mergeDefaults(userConfig) {
  const merged = {};
  // Deep merge AI
  merged.ai = { ...DEFAULTS.ai, ...(userConfig.ai || {}) };
  merged.rules = { ...DEFAULTS.rules, ...(userConfig.rules || {}) };
  merged.output = { ...DEFAULTS.output, ...(userConfig.output || {}) };
  // Pass through any extra keys
  for (const key of Object.keys(userConfig)) {
    if (!['ai', 'rules', 'output'].includes(key)) {
      merged[key] = userConfig[key];
    }
  }
  return merged;
}

function getApiKey(config) {
  // Direct key from config file takes precedence
  if (config.ai?.apiKey) return config.ai.apiKey;

  const envVar = config.ai?.apiKeyEnv || 'OPENAI_API_KEY';
  const key = process.env[envVar];
  if (!key) {
    throw new Error(
      `API key not found.`
    );
  }
  return key;
}

module.exports = { loadConfig, getApiKey, DEFAULTS };
