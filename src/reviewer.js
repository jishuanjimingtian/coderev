const { loadConfig, getApiKey } = require('./config');
const { cacheKey, getCached, setCached } = require('./cache');
const { getRuleDescriptions } = require('./rules');

/**
 * Review a git diff string using AI.
 * @param {string} diff - The git diff text
 * @param {object} config - Configuration object (optional, loaded if omitted)
 * @param {object} [options] - Additional options
 * @param {boolean} [options.noCache] - Skip cache
 * @returns {Promise<object>} Review result with issues, suggestions, score, etc.
 */
async function reviewDiff(diff, config, options = {}) {
  if (!config) config = loadConfig();

  // Check cache
  if (!options.noCache) {
    const ckey = cacheKey(diff);
    const cached = getCached(ckey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  }

  const apiKey = getApiKey(config);
  const prompt = buildReviewPrompt(diff, config);
  const aiResponse = await callAI(apiKey, prompt, config);
  const result = parseReviewResponse(aiResponse);

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
function buildReviewPrompt(diff, config) {
  const rulesConfig = config.rules || {};
  const ruleLines = getRuleDescriptions(rulesConfig);
  if (ruleLines.length === 0) ruleLines.push('- General code quality best practices');

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
- Return ONLY valid JSON, no markdown wrapping, no explanations outside the JSON.`,
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

  if (provider === 'openai') {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey,
      baseURL: aiConfig.baseURL || undefined,
    });

    const response = await client.chat.completions.create({
      model: aiConfig.model || 'gpt-4o',
      temperature: aiConfig.temperature ?? 0.3,
      max_tokens: aiConfig.maxTokens || 4096,
      messages,
    });

    return response.choices[0]?.message?.content || '';
  }

  if (provider === 'deepseek') {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey,
      baseURL: aiConfig.baseURL || 'https://api.deepseek.com',
    });

    const response = await client.chat.completions.create({
      model: aiConfig.model || 'deepseek-chat',
      temperature: aiConfig.temperature ?? 0.3,
      max_tokens: aiConfig.maxTokens || 4096,
      messages,
    });

    return response.choices[0]?.message?.content || '';
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
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

module.exports = { reviewDiff, parseReviewResponse };
