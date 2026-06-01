/**
 * Custom rule configuration for coderev.
 * 
 * Config file (.coderevrc.json) can include a "rules" array:
 * 
 * ```json
 * {
 *   "rules": {
 *     "maxLineLength": 100,
 *     "predefined": ["security", "performance", "style", "typescript"],
 *     "custom": [
 *       {
 *         "name": "no-console-log",
 *         "pattern": "console\\.log\\(",
 *         "severity": "warning",
 *         "message": "Avoid console.log in production code",
 *         "filePattern": "src\/**\/*.js"
 *       }
 *     ]
 *   }
 * }
 * ```
 */

const DEFAULT_PREDEFINED = ['security', 'performance', 'style'];

// Map file extensions to detected languages
const EXTENSION_LANG_MAP = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.cs': 'csharp',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
};

// Language-specific rule descriptions
const LANG_SPECIFIC_RULES = {
  javascript: [
    '- Check async/await usage: avoid mixing .then() and await in the same chain',
    '- Check for common JS pitfalls: == vs ===, var vs let/const',
    '- Verify proper error handling in async functions (try/catch or .catch())',
    '- Check for memory leaks: event listeners not removed, closures holding references',
    '- Validate import/export usage and circular dependencies',
  ],
  typescript: [
    '- Enforce strict TypeScript: avoid `any`, prefer `unknown`, use proper generics',
    '- Check interface vs type usage consistency',
    '- Verify proper use of strictNullChecks (no implicit undefined)',
    '- Check for unsafe type assertions (as) and type casts',
    '- Validate generic constraints are properly defined',
  ],
  python: [
    '- Check for PEP 8 style violations (naming, imports, whitespace)',
    '- Verify proper exception handling: avoid bare except, specify exception types',
    '- Check for common Python anti-patterns: mutable default args, import *',
    '- Verify async/await usage in asyncio code',
    '- Check for proper context manager usage (with statements)',
  ],
  rust: [
    '- Check for unsafe code blocks and verify they are justified',
    '- Verify proper error handling: prefer Result/Option over unwrap()/expect()',
    '- Check lifetime annotations for correctness',
    '- Verify proper use of ownership and borrowing (no unnecessary clones)',
    '- Check for correct use of async/await with tokio or async-std',
  ],
  go: [
    '- Verify proper error handling: always check returned errors',
    '- Check for common Go pitfalls: shadowed variables, incorrect use of goroutines',
    '- Verify proper context propagation through function calls',
    '- Check for data races: proper use of mutexes or channels',
    '- Validate interface compliance and naming conventions',
  ],
  java: [
    '- Check for proper null handling: Optional vs null checks',
    '- Verify proper exception handling: checked vs unchecked exceptions',
    '- Check for common Java pitfalls: == vs .equals(), raw types',
    '- Verify proper use of streams and lambdas',
    '- Check for thread safety issues in concurrent code',
  ],
  sql: [
    '- Check for SQL injection vulnerabilities: parameterized queries vs string concatenation',
    '- Verify proper indexing: avoid full table scans in WHERE clauses',
    '- Check for N+1 query problems in JOIN-heavy queries',
    '- Verify proper use of transactions for multi-step operations',
    '- Check for large IN-clauses that may cause performance issues',
  ],
};

/**
 * Get the list of active review rules for prompt generation.
 * @param {object} rulesConfig - The rules section from config
 * @param {string} [diff] - Optional diff content for language detection
 * @returns {string[]} Array of rule description strings
 */
function getRuleDescriptions(rulesConfig, diff) {
  if (!rulesConfig) rulesConfig = {};
  if (!rulesConfig.predefined) rulesConfig.predefined = DEFAULT_PREDEFINED;

  const descriptions = [];

  // Built-in toggles
  if (rulesConfig.maxLineLength) {
    descriptions.push(`- Maximum line length: ${rulesConfig.maxLineLength} characters`);
  }

  // Predefined rule sets
  descriptions.push(...getPredefinedDescriptions(rulesConfig.predefined));

  // Auto-detect language from diff and add language-specific rules
  if (diff && rulesConfig.autoLanguage !== false) {
    const langs = detectLanguages(diff);
    for (const lang of langs) {
      const langRules = LANG_SPECIFIC_RULES[lang];
      if (langRules) {
        descriptions.push(`\n# ${lang.toUpperCase()}-specific checks:`);
        descriptions.push(...langRules);
      }
    }
  }

  // Custom rules
  if (Array.isArray(rulesConfig.custom)) {
    for (const rule of rulesConfig.custom) {
      if (rule.enabled === false) continue;
      const sev = rule.severity ? ` [${rule.severity}]` : '';
      descriptions.push(`- ${rule.message || rule.name}${sev}`);
      if (rule.filePattern) {
        descriptions.push(`  Applies to: ${rule.filePattern}`);
      }
    }
  }

  return descriptions;
}

function getPredefinedDescriptions(selected) {
  const all = {
    security: '- Check for security vulnerabilities (injection, XSS, auth issues, secrets exposure)',
    performance: '- Check for performance issues (unnecessary loops, memory leaks, N+1 queries)',
    style: '- Check code style and consistency (spacing, imports, unused variables)',
    typescript: '- Enforce TypeScript best practices (strict types, avoid `any`, use proper generics)',
    react: '- Check React best practices (hooks rules, key props, component naming)',
    node: '- Check Node.js best practices (error handling, async patterns, file system safety)',
    naming: '- Enforce naming conventions (camelCase, PascalCase, CONSTANT_CASE as appropriate)',
    testing: '- Check test quality (assertions, edge cases, test isolation)',
  };

  return selected
    .filter((key) => all[key])
    .map((key) => all[key]);
}

/**
 * Detect programming languages from a git diff.
 * Scans file extensions in diff headers (+++ b/...).
 * @param {string} diff - Git diff text
 * @returns {string[]} Array of language identifiers
 */
function detectLanguages(diff) {
  if (!diff) return [];

  // Extract file extensions from diff headers
  const extSet = new Set();
  const lines = diff.split('\n');
  for (const line of lines) {
    const match = line.match(/^\+\+\+ b\/(.+)/);
    if (match) {
      const filename = match[1];
      const ext = '.' + filename.split('.').pop();
      const lang = EXTENSION_LANG_MAP[ext];
      if (lang) extSet.add(lang);
    }
  }
  return Array.from(extSet);
}

module.exports = { getRuleDescriptions, DEFAULT_PREDEFINED, detectLanguages, LANG_SPECIFIC_RULES };
