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
 *       },
 *       {
 *         "name": "todo-check",
 *         "enabled": true,
 *         "message": "Remove TODO comments before merging",
 *         "action": "comment"
 *       }
 *     ]
 *   }
 * }
 * ```
 */

const DEFAULT_PREDEFINED = ['security', 'performance', 'style'];

/**
 * Get the list of active review rules for prompt generation.
 * @param {object} rulesConfig - The rules section from config
 * @returns {string[]} Array of rule description strings
 */
function getRuleDescriptions(rulesConfig) {
  if (!rulesConfig) return getPredefinedDescriptions(DEFAULT_PREDEFINED);

  const descriptions = [];

  // Built-in toggles
  if (rulesConfig.maxLineLength) {
    descriptions.push(`- Maximum line length: ${rulesConfig.maxLineLength} characters`);
  }

  // Predefined rule sets
  const predefined = rulesConfig.predefined || DEFAULT_PREDEFINED;
  descriptions.push(...getPredefinedDescriptions(predefined));

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

module.exports = { getRuleDescriptions, DEFAULT_PREDEFINED };
