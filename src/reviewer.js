const { loadConfig, getApiKey } = require('./config');
const { cacheKey, getCached, setCached } = require('./cache');
const { recordReview } = require('./stats');
const { getRuleDescriptions } = require('./rules');

/**
 * Review a git diff string using AI.
 * @param {string} diff - The git diff text
 * @param {object} config - Configuration object (optional, loaded if omitted)
 * @param {object} [options] - Additional options
 * @param {boolean} [options.noCache] - Skip cache
 * @param {string} [options.context] - Previous review context (for incremental reviews)
 * @param {string} [options.ignorePattern] - File patterns to ignore
 * @returns {Promise<object>} Review result with issues, suggestions, score, etc.
 */
async function reviewDiff(diff, config, options = {}) {
  if (!config) config = loadConfig();

  // Apply ignore patterns: strip ignored files from diff
  if (options.ignorePattern) {
    diff = filterDiffByPattern(diff, options.ignorePattern);
  }

  // Check cache
  if (!options.noCache) {
    const ckey = cacheKey(diff);
    const cached = getCached(ckey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  }

  const apiKey = getApiKey(config);

  // Load .coderevhint for project context
  const projectHint = loadProjectHint();
  const prompt = buildReviewPrompt(diff, config, { ...options, projectHint });
  const aiResponse = await callAI(apiKey, prompt, config);
  const result = parseReviewResponse(aiResponse);

  // Record to stats
  try { recordReview(result); } catch {}

  // Cache result
  if (!options.noCache) {
    const ckey = cacheKey(diff);
    setCached(ckey, result);
  }

  return result;
}

/**
 * Build the system prompt for code review.
 */
function buildReviewPrompt(diff, config, options = {}) {
  const rulesConfig = config.rules || {};
  const ruleLines = getRuleDescriptions(rulesConfig, diff);
  if (ruleLines.length === 0) ruleLines.push('- General code quality best practices');

  let contextBlock = '';
  if (options.context) {
    contextBlock = `\n\nPrevious review context (address these if still relevant, and don\'t repeat issues that were already fixed):\n${options.context}`;
  }

  let hintBlock = '';
  if (options.projectHint) {
    hintBlock = `

Project context (use this to guide your review):
${options.projectHint}`;
  }
  let auditBlock = '';
  if (options.audit) {
    auditBlock = `\n\n## SECURITY AUDIT MODE
You are now in security audit mode. Focus on the following:

### CRITICAL (must check):
- SQL injection: parameterized queries vs string concatenation
- Command injection: shell command construction with user input
- Hardcoded secrets: API keys, passwords, tokens, certificates
- Authentication/authorization: missing access control, privilege escalation
- Cross-site scripting (XSS): unescaped user input in HTML/output
- Insecure direct object references (IDOR): accessing data by user-supplied IDs

### HIGH (should check):
- Path traversal: user-supplied file paths without validation
- Insecure deserialization: parsing untrusted data without validation
- Server-side request forgery (SSRF): making requests to user-supplied URLs
- Insecure cryptography: weak algorithms, hardcoded keys, improper IV usage
- Rate limiting: endpoints without throttling

### MEDIUM (good to check):
- Information disclosure: stack traces, debug endpoints, verbose error messages
- Missing security headers: CSP, X-Frame-Options, HSTS
- Insecure direct file access
- Session management: cookie flags, token expiry, CSRF protection
- Input validation: insufficient validation on user-supplied data

For each issue found, assign a CVSS-like score (1-10) and output it as "cvss" field.
Be aggressive - it's better to flag a false positive than miss a real vulnerability.
`;
  }


  return [
    {
      role: 'system',
      content: `You are an expert code reviewer. Analyze the provided git diff and return a JSON object with the following structure:

\`\`\`json
{
  "summary": "Brief one-line summary of the change",
  "score": <number 0-100>,
  "issues": [
    {
      "type": "error|warning|info",
      "severity": "high|medium|low",
      "file": "filename (optional)",
      "line": <line_number> (optional),
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "suggestions": ["improvement suggestion 1", "suggestion 2"],
  "praise": ["good thing 1", "good thing 2"]
}
\`\`\`

Rules to enforce:
${ruleLines.join('\n')}

Important:
- Score should reflect overall quality. 90+ = excellent, 70-89 = good, 50-69 = needs improvement, <50 = major issues.
- Be constructive. Include praise for good practices.
- Return ONLY valid JSON, no markdown wrapping, no explanations outside the JSON.${contextBlock}${hintBlock}${auditBlock}`,
    },
    {
      role: 'user',
      content: `Here is the git diff to review:\n\n\`\`\`diff\n${diff}\n\`\`\``,
    },
  ];
}

/**
 * Call the AI provider.
 */
async function callAI(apiKey, messages, config) {
  const aiConfig = config.ai || {};
  const provider = aiConfig.provider || 'openai';

  const OpenAI = require('openai');

  // Determine base URL from provider or config
  let baseURL = aiConfig.baseURL;
  if (!baseURL) {
    if (provider === 'deepseek') baseURL = 'https://api.deepseek.com';
    // openai and all others default to undefined (official endpoint)
  }

  const defaultModels = {
    openai: 'gpt-4o',
    deepseek: 'deepseek-chat',
  };

  const client = new OpenAI({ apiKey, baseURL: baseURL || undefined });

  const response = await client.chat.completions.create({
    model: aiConfig.model || defaultModels[provider] || provider,
    temperature: aiConfig.temperature ?? 0.3,
    max_tokens: aiConfig.maxTokens || 4096,
    messages,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Parse AI response into structured review result.
 */
function parseReviewResponse(text) {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // fall through
      }
    }

    // Try finding any JSON object
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // fall through
      }
    }

    // Last resort: return raw text as structured error
    return {
      summary: 'Could not parse review response',
      score: 0,
      issues: [{ type: 'error', severity: 'high', message: 'AI returned unparseable response', suggestion: text.slice(0, 500) }],
      suggestions: [],
      praise: [],
    };
  }
}

/**
 * Filter diff to exclude files matching ignore patterns.
 * Support simple glob patterns: *.md, test/**
 */
function filterDiffByPattern(diff, ignorePattern) {
  if (!ignorePattern) return diff;

  const patterns = ignorePattern.split(',').map(p => {
    const glob = p.trim();
    // Convert simple glob to regex
    const regex = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\*\*/g, '.*');
    return new RegExp(regex);
  });

  const lines = diff.split('\n');
  const filtered = [];
  let skipBlock = false;

  for (const line of lines) {
    const fileMatch = line.match(/^\+\+\+ b\/(.*)/) || line.match(/^diff --git a\/(.*) b\//);
    if (fileMatch) {
      const filePath = fileMatch[1];
      skipBlock = patterns.some(p => p.test(filePath));
    }
    if (!skipBlock) {
      filtered.push(line);
    }
  }

  return filtered.join('\n');
}


/**
 * Load .coderevhint file from current or parent directories.
 */
function loadProjectHint() {
  const fs = require('fs');
  const path = require('path');
  let current = process.cwd();
  while (true) {
    const hintPath = path.join(current, '.coderevhint');
    if (fs.existsSync(hintPath)) {
      return fs.readFileSync(hintPath, 'utf-8').trim();
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

module.exports = { reviewDiff, parseReviewResponse };
