/**
 * Rules Market — SaaS cloud rule repository for coderev.
 *
 * Commands:
 *   coderev rules search <query>   Search the rule marketplace
 *   coderev rules install <name>   Install a rule pack from the marketplace
 *   coderev rules publish          Publish local rules to the marketplace
 *   coderev rules list             List installed rule packs
 *
 * API Base: configurable via .coderevrc.json → marketplace.apiUrl
 * Default: https://rules.coderev.dev/api
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DEFAULT_API_URL = 'https://rules.coderev.dev/api';
const MARKETPLACE_DIR = '.coderev-marketplace';
const INSTALLED_MANIFEST = 'installed.json';

// ── API Client ───────────────────────────────────────────

/**
 * Make an HTTP request to the marketplace API.
 */
function apiRequest(apiUrl, endpoint, method = 'GET', body = null) {
  const url = new URL(`${apiUrl}${endpoint}`);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'coderev-cli',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      timeout: 15000,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `API error: ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Invalid API response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });
    req.on('error', (err) => reject(new Error(`API connection failed: ${err.message}`)));

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Marketplace Directory ────────────────────────────────

function getMarketplaceDir() {
  return path.join(process.cwd(), MARKETPLACE_DIR);
}

function getInstalledManifest() {
  const dir = getMarketplaceDir();
  const manifestPath = path.join(dir, INSTALLED_MANIFEST);
  if (!fs.existsSync(manifestPath)) return { packs: [] };
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function saveInstalledManifest(manifest) {
  const dir = getMarketplaceDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, INSTALLED_MANIFEST), JSON.stringify(manifest, null, 2));
}

// ── Search ───────────────────────────────────────────────

async function searchRules(query, apiUrl) {
  const endpoint = query
    ? `/rules?q=${encodeURIComponent(query)}`
    : '/rules';
  const result = await apiRequest(apiUrl, endpoint);
  return result.rules || result;
}

// ── Install ──────────────────────────────────────────────

async function installRule(packName, apiUrl) {
  // Fetch rule pack from marketplace
  const pack = await apiRequest(apiUrl, `/rules/${encodeURIComponent(packName)}`);

  if (!pack || !pack.rules) {
    throw new Error(`Rule pack "${packName}" not found or empty`);
  }

  // Merge into local .coderevrc.json
  const configPath = path.join(process.cwd(), '.coderevrc.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Ensure custom rules array exists
  if (!config.rules) config.rules = {};
  if (!config.rules.custom) config.rules.custom = [];

  // Add pack rules (skip duplicates by name)
  let added = 0;
  for (const rule of pack.rules) {
    const exists = config.rules.custom.some(r => r.name === rule.name);
    if (!exists) {
      config.rules.custom.push({
        ...rule,
        _source: packName,
        _version: pack.version,
      });
      added++;
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Record installation
  const manifest = getInstalledManifest();
  const existing = manifest.packs.findIndex(p => p.name === packName);
  if (existing >= 0) {
    manifest.packs[existing] = {
      name: packName,
      version: pack.version,
      rules: pack.rules.length,
      installedAt: new Date().toISOString(),
    };
  } else {
    manifest.packs.push({
      name: packName,
      version: pack.version,
      rules: pack.rules.length,
      installedAt: new Date().toISOString(),
    });
  }
  saveInstalledManifest(manifest);

  return { name: packName, version: pack.version, added, total: pack.rules.length };
}

// ── Publish ───────────────────────────────────────────────

async function publishRules(apiUrl, options = {}) {
  const configPath = path.join(process.cwd(), '.coderevrc.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('No .coderevrc.json found. Run `coderev init` first.');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const rules = config.rules?.custom || [];

  if (rules.length === 0) {
    throw new Error('No custom rules found in .coderevrc.json');
  }

  const packName = options.name || path.basename(process.cwd());
  const payload = {
    name: packName,
    version: options.version || '1.0.0',
    description: options.description || `Rules from ${packName}`,
    rules: rules.map(r => ({
      name: r.name,
      pattern: r.pattern,
      severity: r.severity || 'warning',
      message: r.message,
      filePattern: r.filePattern,
      category: r.category || 'style',
    })),
  };

  const result = await apiRequest(apiUrl, '/rules', 'POST', payload);

  return { name: packName, version: payload.version, rules: rules.length, published: true };
}

// ── List Installed ───────────────────────────────────────

function listInstalled() {
  const manifest = getInstalledManifest();

  if (manifest.packs.length === 0) {
    return { packs: [], message: 'No rule packs installed. Use `coderev rules search` to find rules.' };
  }

  return { packs: manifest.packs };
}

// ── Uninstall ─────────────────────────────────────────────

function uninstallRule(packName) {
  const manifest = getInstalledManifest();
  const idx = manifest.packs.findIndex(p => p.name === packName);
  if (idx < 0) {
    throw new Error(`Rule pack "${packName}" is not installed.`);
  }

  manifest.packs.splice(idx, 1);
  saveInstalledManifest(manifest);

  // Also remove from .coderevrc.json
  const configPath = path.join(process.cwd(), '.coderevrc.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.rules?.custom) {
      config.rules.custom = config.rules.custom.filter(r => r._source !== packName);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  }

  return { name: packName, removed: true };
}

// ── Search Local ──────────────────────────────────────────

function searchLocalRules(query) {
  const manifest = getInstalledManifest();
  if (!query) return manifest.packs;

  const q = query.toLowerCase();
  return manifest.packs.filter(
    p => p.name.toLowerCase().includes(q)
  );
}

module.exports = {
  searchRules,
  installRule,
  publishRules,
  listInstalled,
  uninstallRule,
  searchLocalRules,
  DEFAULT_API_URL,
  getMarketplaceDir,
};
