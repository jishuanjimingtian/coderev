/**
 * Interactive fix and incremental diff utilities for coderev.
 */

/**
 * Generate a fix patch for a specific issue in the diff.
 * @param {string} diff - Original diff text
 * @param {object} issue - The issue to fix
 * @param {string} apiKey - API key
 * @param {object} config - Config object
 * @returns {Promise<{patch: string|null, explanation: string}>}
 */
async function generateFix(diff, issue, apiKey, config) {
  const { callAI } = require('./reviewer');

  const systemMsg = 'You are an expert programmer. Given a diff and an issue found during code review, generate a unified patch that fixes the issue.\n\nReturn ONLY a valid JSON object:\n```json\n{\n  "patch": "the unified diff patch content",\n  "explanation": "one-line explanation of what was changed"\n}\n```\n\nRules:\n- Generate a proper unified diff format patch (git diff format)\n- Fix ONLY the specific issue described\n- Do NOT introduce any other changes\n- If you cannot generate a fix (e.g., the issue requires human judgment), return { "patch": null, "explanation": "Cannot auto-fix: reason" }';

  const userContent = 'Diff that needs fixing:\n```diff\n' + diff.slice(0, 4000) + '\n```\n\nIssue to fix:\n- Type: ' + issue.type + '\n- Severity: ' + issue.severity + '\n- File: ' + (issue.file || 'N/A') + '\n- Line: ' + (issue.line || 'N/A') + '\n- Message: ' + issue.message + '\n- Suggestion: ' + (issue.suggestion || 'N/A') + '\n\nGenerate the fix patch:';

  const prompt = [
    { role: 'system', content: systemMsg },
    { role: 'user', content: userContent },
  ];

  try {
    const text = await callAI(apiKey, prompt, config);
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    return { patch: null, explanation: 'Failed to parse AI fix response' };
  }
}

/**
 * Parse a diff to extract only the added/changed lines (incremental review).
 * @param {string} diff - Full git diff
 * @returns {string} Filtered diff with only new/changed content
 */
function parseIncrementalDiff(diff) {
  if (!diff) return diff;
  const lines = diff.split('\n');
  const result = [];
  let inHunk = false;
  let addedLines = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (addedLines.length > 0) {
        result.push(...addedLines);
        addedLines = [];
      }
      result.push(line);
      inHunk = false;
    } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push(line);
    } else if (line.startsWith('@@ ')) {
      if (addedLines.length > 0) {
        result.push(...addedLines);
        addedLines = [];
      }
      result.push(line);
      inHunk = true;
      addedLines = [];
    } else if (inHunk) {
      if (line.startsWith('+')) {
        addedLines.push(line);
      } else if (line.startsWith('-')) {
        // Skip removed lines
      } else {
        addedLines.push(line);
      }
    }
  }
  if (addedLines.length > 0) {
    result.push(...addedLines);
  }
  return result.join('\n');
}

module.exports = { generateFix, parseIncrementalDiff };
