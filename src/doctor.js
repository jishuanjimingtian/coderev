/**
 * coderev doctor — 环境诊断命令
 *
 * 诊断项目环境中的常见配置问题:
 *   1. Node.js 版本检查
 *   2. git 可用性检查
 *   3. 配置文件有效性检查
 *   4. API Key 配置检查
 *   5. AI Provider 网络连通性检查
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const chalk = require('chalk');

// ── 检查项类型 ────────────────────────────────────────────────
const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

/**
 * 执行完整的诊断流程并返回结果
 *
 * @param {object} options - 选项
 * @param {string} [options.config] - 显式指定配置文件路径
 * @returns {Promise<{checks: Array, allPassed: boolean}>}
 */
async function runDoctor(options = {}) {
  const checks = [];
  const config = loadUserConfig(options.config);

  // 1. Node.js 版本
  checks.push(checkNodeVersion());

  // 2. Git 可用性
  checks.push(checkGit());

  // 3. 配置文件
  checks.push(checkConfig(options.config));

  // 4. API Key
  checks.push(checkApiKey(config));

  // 5. AI Provider 连通性
  checks.push(await checkProviderConnectivity(config));

  // 判断是否全部通过
  const allPassed = checks.every(c => c.status !== FAIL);

  return { checks, allPassed };
}

// ── 各检查项 ─────────────────────────────────────────────────

/**
 * 检查 Node.js 版本 >= 18
 */
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major >= 20) {
    return {
      name: 'Node.js Version',
      status: PASS,
      message: `${version} (>= 18 required)`,
      detail: `Node.js version is current and fully supported.`,
    };
  } else if (major >= 18) {
    return {
      name: 'Node.js Version',
      status: PASS,
      message: `${version} (minimum met)`,
      detail: `Node.js >= 18 required. Your version meets the minimum.`,
    };
  } else {
    return {
      name: 'Node.js Version',
      status: FAIL,
      message: `${version} is too old — Node.js >= 18 required`,
      detail: `Upgrade to Node.js 18+ to use coderev. Download: https://nodejs.org`,
    };
  }
}

/**
 * 检查 git 是否可用
 */
function checkGit() {
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // Verify we're in a git repo (optional, warn if not)
    let isRepo = true;
    try {
      execSync('git rev-parse --git-dir', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      isRepo = false;
    }

    if (isRepo) {
      return {
        name: 'Git',
        status: PASS,
        message: `${gitVersion} — inside a git repository`,
        detail: `Git is available and current directory is a git repo.`,
      };
    } else {
      return {
        name: 'Git',
        status: PASS,
        message: `${gitVersion} — not in a git repository`,
        detail: `Git is available but current directory is not a git repo. This is fine for reviewing diff files directly.`,
      };
    }
  } catch {
    return {
      name: 'Git',
      status: FAIL,
      message: 'git not found in PATH',
      detail: `Git is required for most coderev operations. Install: https://git-scm.com`,
    };
  }
}

/**
 * 检查配置文件是否存在且格式有效
 */
function checkConfig(explicitPath) {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      return {
        name: 'Config File',
        status: WARN,
        message: `Specified config not found: ${explicitPath}`,
        detail: `The config file specified via --config does not exist. coderev will use defaults.`,
      };
    }
    try {
      JSON.parse(fs.readFileSync(explicitPath, 'utf-8'));
      return {
        name: 'Config File',
        status: PASS,
        message: `Valid: ${explicitPath}`,
        detail: `Config file exists and contains valid JSON.`,
      };
    } catch (err) {
      return {
        name: 'Config File',
        status: FAIL,
        message: `Invalid JSON: ${err.message}`,
        detail: `Fix the JSON syntax in your config file.`,
      };
    }
  }

  // Search for config in cwd and parents
  const configFiles = ['.coderevrc.json', '.coderevrc', 'coderev.config.json'];
  let found = null;
  let current = process.cwd();

  while (true) {
    for (const name of configFiles) {
      const full = path.join(current, name);
      if (fs.existsSync(full)) {
        found = full;
        break;
      }
    }
    if (found) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (found) {
    try {
      const content = JSON.parse(fs.readFileSync(found, 'utf-8'));
      // Check basic structure
      const warnings = [];
      if (!content.ai) warnings.push('Missing "ai" section');
      else {
        if (!content.ai.provider && !content.ai.model && !content.ai.apiKey) {
          warnings.push('"ai" section has no provider, model, or apiKey — review may not work');
        }
      }

      if (warnings.length > 0) {
        return {
          name: 'Config File',
          status: WARN,
          message: `Found at ${found} but with issues`,
          detail: warnings.join('; '),
          warnings,
        };
      }

      return {
        name: 'Config File',
        status: PASS,
        message: `Valid: ${found}`,
        detail: `Config file found and contains valid JSON with required sections.`,
      };
    } catch (err) {
      return {
        name: 'Config File',
        status: FAIL,
        message: `Invalid JSON in ${found}: ${err.message}`,
        detail: `Fix the JSON syntax in your config file.`,
      };
    }
  }

  return {
    name: 'Config File',
    status: WARN,
    message: 'No config file found',
    detail: `No .coderevrc.json found in current or parent directories. Run "coderev init" to create one.`,
  };
}

/**
 * 检查 API Key 是否已配置
 */
function checkApiKey(config) {
  // Direct key
  if (config.ai?.apiKey) {
    const key = config.ai.apiKey;
    const masked = key.slice(0, 8) + '...' + key.slice(-4);
    return {
      name: 'API Key',
      status: PASS,
      message: `Configured in config file: ${masked}`,
      detail: `API key is set directly in the config file.`,
    };
  }

  // Via environment variable
  const envVar = config.ai?.apiKeyEnv || 'OPENAI_API_KEY';
  const key = process.env[envVar];
  if (key) {
    const masked = key.slice(0, 8) + '...' + key.slice(-4);
    return {
      name: 'API Key',
      status: PASS,
      message: `Found from env $${envVar}: ${masked}`,
      detail: `API key loaded from environment variable ${envVar}.`,
    };
  }

  // Try common env vars
  const commonVars = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DASHSCOPE_API_KEY', 'GEMINI_API_KEY', 'ZHIPU_API_KEY', 'MOONSHOT_API_KEY', 'MISTRAL_API_KEY'];
  for (const v of commonVars) {
    if (process.env[v]) {
      return {
        name: 'API Key',
        status: PASS,
        message: `Found from env $${v} (not configured in config, but available)`,
        detail: `API key found in environment variable ${v}. Consider adding "apiKeyEnv" to your config.`,
      };
    }
  }

  return {
    name: 'API Key',
    status: FAIL,
    message: `No API key found`,
    detail: `Set your API key via environment variable (e.g. DEEPSEEK_API_KEY) or in .coderevrc.json. Run "coderev init" and "coderev setup --model deepseek" to get started.`,
  };
}

/**
 * 检查 AI Provider 网络连通性
 */
async function checkProviderConnectivity(config) {
  const provider = config.ai?.provider || 'deepseek';
  const baseURL = config.ai?.baseURL || getDefaultBaseURL(provider);

  // Check general internet connectivity first
  const internetOk = await checkInternet();
  if (!internetOk) {
    // If we have no API key at all, this might be expected
    const key = config.ai?.apiKey || process.env[config.ai?.apiKeyEnv || 'DEEPSEEK_API_KEY'];
    if (!key) {
      return {
        name: 'AI Provider Connectivity',
        status: WARN,
        message: 'Cannot check connectivity — no API key configured',
        detail: `Set up your API key first, then re-run "coderev doctor" to verify connectivity.`,
      };
    }
    return {
      name: 'AI Provider Connectivity',
      status: FAIL,
      message: 'No internet connectivity detected',
      detail: `Cannot reach external servers. Check your network connection and proxy settings.`,
    };
  }

  if (!baseURL || baseURL === 'unknown') {
    return {
      name: 'AI Provider Connectivity',
      status: WARN,
      message: `Unknown base URL for provider "${provider}"`,
      detail: `Cannot determine the API endpoint for this provider. Check your config's "baseURL" setting.`,
    };
  }

  try {
    const url = new URL(baseURL);
    const reachable = await httpHead(url.origin);

    if (reachable) {
      // Try API models endpoint to verify auth works
      const apiKey = config.ai?.apiKey || process.env[config.ai?.apiKeyEnv || 'DEEPSEEK_API_KEY'];
      if (apiKey) {
        const apiOk = await checkApiEndpoint(url.origin, '/models', apiKey);
        if (apiOk) {
          return {
            name: 'AI Provider Connectivity',
            status: PASS,
            message: `Connected to ${provider} (${url.origin}) — API accessible`,
            detail: `Successfully connected to the AI provider's API endpoint with valid authentication.`,
          };
        } else {
          return {
            name: 'AI Provider Connectivity',
            status: WARN,
            message: `${provider} (${url.origin}) is reachable but API returned an error`,
            detail: `The server is reachable but the /models endpoint returned an error. Your API key may be invalid or the endpoint URL may be incorrect.`,
          };
        }
      }

      return {
        name: 'AI Provider Connectivity',
        status: PASS,
        message: `Connected to ${provider} (${url.origin}) — server reachable`,
        detail: `The AI provider's server is reachable. Full API auth check skipped (no API key to verify).`,
      };
    }

    return {
      name: 'AI Provider Connectivity',
      status: FAIL,
      message: `Cannot reach ${provider} at ${url.origin}`,
      detail: `The AI provider's server is not responding. Check your network, firewall, or proxy settings. Some providers may be blocked in certain regions.`,
    };
  } catch (err) {
    return {
      name: 'AI Provider Connectivity',
      status: FAIL,
      message: `Invalid base URL: ${baseURL} (${err.message})`,
      detail: `The configured baseURL is not a valid URL. Fix the "baseURL" setting in your config.`,
    };
  }
}

// ── Helper Functions ──────────────────────────────────────────

/**
 * Load user config (simple, without inheritance)
 */
function loadUserConfig(explicitPath) {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) {
      try {
        return JSON.parse(fs.readFileSync(explicitPath, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  // Search for config
  const configFiles = ['.coderevrc.json', '.coderevrc', 'coderev.config.json'];
  let current = process.cwd();

  while (true) {
    for (const name of configFiles) {
      const full = path.join(current, name);
      if (fs.existsSync(full)) {
        try {
          return JSON.parse(fs.readFileSync(full, 'utf-8'));
        } catch {
          return {};
        }
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return {};
}

/**
 * Get default base URL for known providers
 */
function getDefaultBaseURL(provider) {
  const urls = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    anthropic: 'https://api.anthropic.com',
    dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    mistral: 'https://api.mistral.ai/v1',
  };
  return urls[provider.toLowerCase()] || 'unknown';
}

/**
 * Check basic internet connectivity
 */
function checkInternet() {
  return new Promise((resolve) => {
    const req = https.get('https://www.google.com', { timeout: 5000 }, () => {
      resolve(true);
    });
    req.on('error', () => {
      // Try another host
      const req2 = https.get('https://api.github.com', { timeout: 5000 }, () => {
        resolve(true);
      });
      req2.on('error', () => resolve(false));
    });
  });
}

/**
 * Simple HTTP HEAD check
 */
function httpHead(origin) {
  return new Promise((resolve) => {
    const url = new URL(origin);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/',
      method: 'HEAD',
      timeout: 8000,
      rejectUnauthorized: false,
    };
    const mod = url.protocol === 'https:' ? https : require('http');
    const req = mod.request(options, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Check if an API endpoint is accessible with auth
 */
function checkApiEndpoint(origin, path, apiKey) {
  return new Promise((resolve) => {
    const url = new URL(origin + path);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': `coderev-doctor/${require('../package.json').version}`,
      },
      rejectUnauthorized: false,
    };
    const mod = url.protocol === 'https:' ? https : require('http');
    const req = mod.request(options, (res) => {
      // 2xx or 4xx (even 401 means the endpoint is accessible, just auth issue)
      resolve(res.statusCode < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ── 格式化输出 ────────────────────────────────────────────────

/**
 * Format the diagnostic result as a colored terminal report
 */
function formatDoctorReport(checks) {
  const lines = [];

  lines.push('');
  lines.push(chalk.bold('🩺  coderev Doctor — Environment Diagnostic'));
  lines.push(chalk.gray('━'.repeat(58)));

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    const icon = check.status === PASS ? chalk.green('✔') :
                 check.status === WARN ? chalk.yellow('⚠') :
                 chalk.red('✖');

    lines.push('');
    lines.push(`  ${icon} ${chalk.bold(check.name)}`);
    lines.push(`    ${colorStatus(check.status, check.message)}`);

    if (check.detail) {
      const detailColor = check.status === PASS ? chalk.gray :
                          check.status === WARN ? chalk.yellow :
                          chalk.red;
      lines.push(`    ${detailColor(check.detail)}`);
    }

    if (check.warnings && check.warnings.length > 0) {
      for (const w of check.warnings) {
        lines.push(`    ${chalk.yellow('  → ' + w)}`);
      }
    }

    if (check.status === PASS) passCount++;
    else if (check.status === WARN) warnCount++;
    else failCount++;
  }

  // Summary
  lines.push('');
  lines.push(chalk.gray('━'.repeat(58)));
  const summaryParts = [];
  if (passCount > 0) summaryParts.push(chalk.green(`${passCount} passed`));
  if (warnCount > 0) summaryParts.push(chalk.yellow(`${warnCount} warnings`));
  if (failCount > 0) summaryParts.push(chalk.red(`${failCount} failed`));
  lines.push(`  ${summaryParts.join('  ')}`);

  if (failCount > 0) {
    lines.push('');
    lines.push(chalk.red('  ✖ Some checks failed. Fix the issues above before using coderev.'));
  } else if (warnCount > 0) {
    lines.push('');
    lines.push(chalk.yellow('  ⚠ Some checks have warnings. coderev will work, but may be suboptimal.'));
  } else {
    lines.push('');
    lines.push(chalk.green('  ✔ All checks passed! Your environment is ready for coderev. 🚀'));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Color a status message
 */
function colorStatus(status, message) {
  if (status === PASS) return chalk.green(message);
  if (status === WARN) return chalk.yellow(message);
  return chalk.red(message);
}

module.exports = { runDoctor, formatDoctorReport, PASS, WARN, FAIL };
