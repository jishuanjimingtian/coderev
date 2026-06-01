const { loadConfig, getApiKey } = require('./config');
const { cacheKey, getCached, setCached } = require('./cache');
const { recordReview } = require('./stats');
const { getRuleDescriptions } = require('./rules');

// ── 多智能体并行审查 ──

/**
 * Agent roles for parallel review
 */
const AGENT_ROLES = [
  {
    name: 'security',
    label: '🔒 Security Auditor',
    focus: `Focus on security vulnerabilities:
- SQL injection, command injection
- XSS, CSRF, SSRF
- Hardcoded secrets, weak auth
- Insecure deserialization
- Path traversal, IDOR
- Rate limiting, missing access control
- Insecure cryptography
- Supply chain risks (unpinned deps)`,
    weight: 1.0,
  },
  {
    name: 'bugs',
    label: '🐛 Bug Detector',
    focus: `Focus on bugs and correctness:
- Null pointer / undefined access
- Race conditions, async issues
- Off-by-one errors
- Type mismatches
- Memory leaks
- Uncaught exceptions
- Logic errors
- Infinite loops, recursion
- Incorrect API usage`,
    weight: 1.0,
  },
  {
    name: 'quality',
    label: '📐 Code Quality',
    focus: `Focus on code quality and conventions:
- Project conventions and style
- DRY violations
- Over-engineering / complexity
- Naming conventions
- Error handling patterns
- Test coverage gaps
- Documentation quality
- Performance anti-patterns
- Dead code / unused imports`,
    weight: 1.0,
  },
];

/**
 * Merge results from multiple agents with confidence scoring.
 * Each issue gets a confidence score 0-100 as the agent's confidence
 * that this is a real, actionable issue.
 */
function mergeAgentResults(agents, diff, projectHint) {
  const allIssues = [];
  const seenMessages = new Set();

  for (const agentResult of agents) {
    if (!agentResult.success || !agentResult.issues) continue;

    for (const issue of agentResult.issues) {
      // Deduplicate by message signature
      const sig = `${issue.file || ''}:${issue.line || 0}:${issue.message.slice(0, 60)}`;
      if (seenMessages.has(sig)) continue;
      seenMessages.add(sig);

      // Assign confidence based on agent's confidence in this issue
      // If agent didn't provide a score, calculate based on issue type
      const confidence = issue.confidence ?? calculateConfidence(issue, agentResult.name);

      allIssues.push({
        ...issue,
        confidence,
        detectedBy: agentResult.name,
      });
    }
  }

  // Sort by confidence (highest first)
  allIssues.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Filter: only keep confidence >= 60 (below threshold = false positive)
  const filtered = allIssues.filter(i => i.confidence >= 60);
  const filteredCount = allIssues.length - filtered.length;

  return { issues: filtered, filteredCount };
}

/**
 * Calculate confidence score based on issue characteristics.
 */
function calculateConfidence(issue, agentName) {
  let base = 70;

  // Error types are higher confidence
  if (issue.type === 'error') base += 15;
  else if (issue.type === 'warning') base += 5;

  // Issues with file + line are more actionable
  if (issue.file) base += 5;
  if (issue.line) base += 5;
  if (issue.suggestion) base += 5;

  // Cap at 99
  return Math.min(99, base);
}

/**
 * Build parallel agent prompts for multi-perspective review.
 */
function buildAgentPrompts(diff, config, options = {}) {
  const rulesConfig = config.rules || {};
  const ruleLines = getRuleDescriptions(rulesConfig, diff);
  const auditBlock = options.audit ? '\n- **SECURITY AUDIT MODE ACTIVE**' : '';

  return AGENT_ROLES.map(role => {
    return {
      role,
      messages: [
        {
          role: 'system',
          content: `You are ${role.label}, an expert code reviewer.

Your task: Review the provided git diff and ${role.focus}

${options.projectHint ? `Project context:
${options.projectHint}

` : ''}
Return a JSON object:
\`\`\`json
{
  "issues": [
    {
      "type": "error|warning|info",
      "severity": "high|medium|low",
      "confidence": <number 0-100, how confident you are this is a real issue>,
      "file": "filename (optional)",
      "line": <line_number> (optional),
      "message": "Description",
      "suggestion": "How to fix (optional)"
    }
  ],
  "summary": "Brief summary of findings from this perspective"
}
\`\`\`

Confidence scoring guide:
- 80-100: Absolutely certain, definitely a real issue that should be fixed
- 60-79: Highly likely, strong evidence but not 100%
- 40-59: Possible, some evidence but could be false positive
- 20-39: Weak signal, low confidence
- 0-19: Not confident, noise

Important: Return ONLY valid JSON. No markdown wrapping.${auditBlock}`,
        },
        {
          role: 'user',
          content: `Git diff to review:

\`\`\`diff
${diff.slice(0, 8000)}
\`\`\``,
        },
      ],
    };
  });
}

/**
 * Run parallel agents and collect results.
 */
async function runParallelAgents(apiKey, config, prompts) {
  const results = [];
  const errors = [];

  const tasks = prompts.map(async (p) => {
    try {
      const text = await callAI(apiKey, p.messages, config);
      const parsed = parseReviewResponse(text);
      return { name: p.role.name, success: true, ...parsed };
    } catch (err) {
      return { name: p.role.name, success: false, error: err.message, issues: [] };
    }
  });

  // Run all agents in parallel
  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      errors.push(s.reason);
    }
  }

  return { results, errors };
}

/**
 * Review a git diff string using multi-agent parallel review.
 * @param {string} diff - The git diff text
 * @param {object} config - Configuration object (optional, loaded if omitted)
 * @param {object} [options] - Additional options
 * @param {boolean} [options.noCache] - Skip cache
 * @param {boolean} [options.single] - Use single agent (legacy mode, no parallel)
 * @param {boolean} [options.audit] - Security audit mode
 * @param {string} [options.context] - Previous review context (for incremental reviews)
 * @param {string} [options.ignorePattern] - File patterns to ignore
 * @param {number} [options.minConfidence] - Minimum confidence threshold (default: 60)
 * @returns {Promise<object>} Review result with issues, suggestions, score, etc.
 */
async function reviewDiff(diff, config, options = {}) {
  if (!config) config = loadConfig();

  // Apply ignore patterns: strip ignored files from diff
  if (options.ignorePattern) {
    diff = filterDiffByPattern(diff, options.ignorePattern);
  }

  // Check cache
  if (!options.noCache && !options.single && !options.audit) {
    const ckey = cacheKey(diff);
    const cached = getCached(ckey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  }

  const apiKey = getApiKey(config);
  const projectHint = loadProjectHint();
  const minConfidence = options.minConfidence ?? 60;

  let result;

  if (options.single) {
    // Legacy single-agent mode
    const prompt = buildReviewPrompt(diff, config, { ...options, projectHint });
    const aiResponse = await callAI(apiKey, prompt, config);
    result = parseReviewResponse(aiResponse);
    // Add default confidence to legacy results
    if (result.issues) {
      result.issues = result.issues.map(i => ({
        ...i,
        confidence: calculateConfidence(i, 'legacy'),
      })).filter(i => i.confidence >= minConfidence);
    }
  } else {
    // Multi-agent parallel review
    const prompts = buildAgentPrompts(diff, config, { ...options, projectHint });
    const { results: agentResults, errors } = await runParallelAgents(apiKey, config, prompts);

    // Merge and score issues
    const { issues, filteredCount } = mergeAgentResults(agentResults, diff, projectHint);

    // Build final summary
    const totalAgentIssues = agentResults.reduce((s, a) => s + (a.issues?.length || 0), 0);
    const agentSummaries = agentResults.map(a => `  ${a.name}: ${a.issues?.length || 0} issues`).join('\n');

    result = {
      summary: agentResults.map(a => a.summary).filter(Boolean).join(' | '),
      score: calculateOverallScore(issues, agentResults),
      issues,
      suggestions: [],
      praise: [],
      _agents: {
        total: agentResults.length,
        summary: agentSummaries,
        totalIssuesFound: totalAgentIssues,
        filteredLowConfidence: filteredCount,
        minConfidence,
        errors: errors.length,
      },
    };

    // Generate overall suggestions from top issues
    if (issues.length > 0) {
      result.suggestions = issues.slice(0, 3).map(i => i.suggestion).filter(Boolean);
    }
  }

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
 * Calculate overall quality score from merged multi-agent results.
 */
function calculateOverallScore(issues, agentResults) {
  if (issues.length === 0) return 100;

  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;
  const infoCount = issues.filter(i => i.type === 'info').length;

  const highConfidence = issues.filter(i => i.confidence >= 85).length;
  const mediumConfidence = issues.filter(i => i.confidence >= 70 && i.confidence < 85).length;

  // Base deductions
  let score = 100;
  score -= errorCount * 15;
  score -= warningCount * 8;
  score -= infoCount * 3;
  score -= highConfidence * 5;  // Extra deduction for high-confidence issues
  score -= mediumConfidence * 2;

  return Math.max(0, Math.min(100, score));
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
