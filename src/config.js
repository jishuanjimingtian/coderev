const fs = require('fs');
const path = require('path');

const CONFIG_FILES = [
  '.coderevrc.json',
  '.coderevrc',
  'coderev.config.json',
];

const DEFAULTS = {
  ai: {
    provider: 'deepseek',
    model: 'deepseek-chat',
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
  inheritance: {
    enabled: true,
    strategy: 'deep-merge',   // 'deep-merge' | 'replace'
  },
};

/**
 * Load configuration with multi-project inheritance support.
 *
 * Inheritance logic:
 * 1. If configPath is explicitly specified, load that one file only (no inheritance)
 * 2. If no configPath, search upward from cwd collecting ALL config files
 * 3. Apply them in order: parent config first, then layered closer to cwd
 * 4. Deep-merge: child values override parent values at the field level
 *
 * This allows teams to have a base .coderevrc.json at repo root
 * and project-specific overrides in subdirectory projects.
 *
 * @param {string|null} configPath - Explicit path to config file
 * @returns {object} Merged configuration
 */
function loadConfig(configPath) {
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      // If explicitly specified and not found, return defaults (don't throw for backward compat)
      return { ...DEFAULTS };
    }
    return mergeDefaults(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
  }

  // Multi-project inheritance: collect all config files from cwd up to root
  const configStack = [];
  let current = process.cwd();

  while (true) {
    for (const filename of CONFIG_FILES) {
      const fullPath = path.join(current, filename);
      if (fs.existsSync(fullPath)) {
        const userConfig = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        configStack.push({ path: fullPath, config: userConfig });
        break; // Only the first matching file per directory
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Reverse: apply from farthest parent first, then child overrides
  // configStack[0] = closest to cwd (highest priority)
  // configStack[n] = farthest from cwd (lowest priority)
  configStack.reverse();

  if (configStack.length === 0) {
    return { ...DEFAULTS, _inheritanceStack: [] };
  }

  // Check if inheritance is disabled by any config in the stack
  const inheritanceDisabled = configStack.some(
    entry => entry.config.inheritance && entry.config.inheritance.enabled === false
  );

  if (inheritanceDisabled || configStack.length === 1) {
    // Only use the first (closest) config
    return mergeDefaults(configStack[configStack.length - 1].config);
  }

  // Deep-merge from parent to child
  let merged = {};
  for (const entry of configStack) {
    merged = deepMerge(merged, entry.config);
  }

  merged._inheritanceStack = configStack.map(e => e.path);
  return mergeDefaults(merged);
}

/**
 * Deep-merge two objects. Source values override target values.
 * Arrays are replaced, not concatenated.
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Check if a value is a plain object (not array, null, etc.)
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaults(userConfig) {
  const merged = {};
  // Deep merge AI
  merged.ai = { ...DEFAULTS.ai, ...(userConfig.ai || {}) };
  merged.rules = { ...DEFAULTS.rules, ...(userConfig.rules || {}) };
  merged.output = { ...DEFAULTS.output, ...(userConfig.output || {}) };
  merged.inheritance = { ...DEFAULTS.inheritance, ...(userConfig.inheritance || {}) };
  // Pass through any extra keys
  for (const key of Object.keys(userConfig)) {
    if (!['ai', 'rules', 'output', 'inheritance'].includes(key)) {
      merged[key] = userConfig[key];
    }
  }
  // Preserve _inheritanceStack if present
  if (userConfig._inheritanceStack) {
    merged._inheritanceStack = userConfig._inheritanceStack;
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
