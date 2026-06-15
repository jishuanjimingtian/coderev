/**
 * PR Summary & Walkthrough Generator
 *
 * Automatically generates:
 * 1. PR Summary — concise overview of what this PR does
 * 2. Walkthrough — file-by-file breakdown of changes
 * 3. Sequence Diagram — optional mermaid diagram of the data flow
 *
 * Used by: coderev serve (GitHub App auto-review)
 */

const { callAI } = require('./reviewer');

/**
 * @typedef {object} PrSummary
 * @property {string} title - Suggested PR title (if auto-generated)
 * @property {string} summary - Concise PR description (2-4 sentences)
 * @property {Array<{file: string, summary: string, type: string}>} walkthrough - Per-file breakdown
 * @property {string} [sequenceDiagram] - Optional mermaid diagram
 * @property {string} [riskAssessment] - Risk level and key concerns
 * @property {string} [reviewChecklist] - Suggested review checklist
 */

/**
 * Generate a PR Summary + Walkthrough from a diff.
 *
 * @param {string} diff - Git diff text
 * @param {string} apiKey - API key
 * @param {object} config - coderev config
 * @param {object} [options]
 * @param {string} [options.prTitle] - Existing PR title (if available)
 * @param {string} [options.prBody] - Existing PR body (if available)
 * @param {boolean} [options.includeDiagram=false] - Include mermaid diagram
 * @param {boolean} [options.includeRisk=true] - Include risk assessment
 * @returns {Promise<PrSummary>}
 */
async function generatePrSummary(diff, apiKey, config, options = {}) {
  const systemMsg = `You are an expert code reviewer who generates clear, concise PR summaries and walkthroughs.

Given a git diff, generate a structured analysis of the changes.

IMPORTANT: Return ONLY valid JSON, no markdown wrapping. Use this exact structure:

\`\`\`json
{
  "title": "Suggested PR title if one isn't provided (short, imperative mood)",
  "summary": "2-4 sentence high-level summary of what the PR does and why",
  "type": "feat|fix|refactor|docs|chore|perf|test|ci",
  "walkthrough": [
    {
      "file": "relative/file/path.js",
      "summary": "1-sentence description of what changed in this file",
      "type": "added|modified|deleted|renamed",
      "keyChanges": ["specific change 1", "specific change 2"]
    }
  ],
  "riskAssessment": {
    "level": "low|medium|high",
    "concerns": ["potential risk 1", "potential risk 2"],
    "mitigations": ["suggested mitigation 1"]
  },
  "reviewChecklist": ["Checklist item 1", "Checklist item 2"]
}
\`\`\`

Rules:
- Be specific, not generic. Reference actual file names and changes.
- Walkthrough: cover each file that has meaningful changes (skip config bumps, lockfile changes).
- Risk: consider security, breaking changes, performance, and data integrity.
- Checklist: actionable items for the human reviewer.
${options.prTitle ? `\nExisting PR title: "${options.prTitle}"` : ''}
${options.prBody ? `\nExisting PR body: ${options.prBody.slice(0, 500)}` : ''}`;

  const userContent = `Git diff to analyze:\n\n\`\`\`diff\n${diff.slice(0, 10000)}\n\`\`\``;

  const prompt = [
    { role: 'system', content: systemMsg },
    { role: 'user', content: userContent },
  ];

  try {
    const text = await callAI(apiKey, prompt, config);
    const parsed = parseJsonResponse(text);
    return normalizeSummary(parsed);
  } catch (err) {
    return {
      title: null,
      summary: 'Failed to generate PR summary: ' + err.message,
      type: 'unknown',
      walkthrough: [],
      riskAssessment: { level: 'unknown', concerns: [], mitigations: [] },
      reviewChecklist: [],
    };
  }
}

/**
 * Format PR Summary as a Markdown comment for posting to PR.
 *
 * @param {PrSummary} summary
 * @param {object} [options]
 * @param {boolean} [options.collapsible=true] - Use collapsible sections
 * @returns {string} Markdown formatted summary
 */
function formatPrSummaryMarkdown(summary, options = {}) {
  const { collapsible = true } = options;
  const parts = [];

  parts.push('## 🤖 AI Code Review Summary\n');

  // Title suggestion
  if (summary.title) {
    parts.push(`> 💡 **Suggested title:** \`${summary.title}\`\n`);
  }

  // Summary
  if (summary.summary) {
    parts.push('### 📝 Summary\n');
    parts.push(summary.summary + '\n');
  }

  // Type badge
  const typeLabels = {
    feat: '🚀 Feature', fix: '🐛 Bug Fix', refactor: '♻️ Refactor',
    docs: '📝 Docs', chore: '🔧 Chore', perf: '⚡ Performance',
    test: '✅ Test', ci: '🔄 CI/CD',
  };
  if (summary.type && typeLabels[summary.type]) {
    parts.push(`**Type:** ${typeLabels[summary.type]}\n`);
  }

  // Walkthrough
  if (summary.walkthrough && summary.walkthrough.length > 0) {
    parts.push('### 🗂️ File Walkthrough\n');
    parts.push('| File | Change | Summary |');
    parts.push('|------|--------|---------|');
    for (const f of summary.walkthrough) {
      const icon = f.type === 'added' ? '🆕' : f.type === 'deleted' ? '🗑️' : '✏️';
      parts.push(`| \`${f.file}\` | ${icon} ${f.type} | ${f.summary} |`);
    }
    parts.push('');
  }

  // Risk assessment
  if (summary.riskAssessment && summary.riskAssessment.level !== 'unknown') {
    const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
    const riskIcon = riskEmoji[summary.riskAssessment.level] || '⚪';
    parts.push(`### ${collapsible ? '<details><summary>' : ''}🔍 Risk Assessment${collapsible ? '</summary>' : ''}\n`);
    parts.push(`**Level:** ${riskIcon} ${summary.riskAssessment.level.toUpperCase()}\n`);
    if (summary.riskAssessment.concerns && summary.riskAssessment.concerns.length > 0) {
      parts.push('\n**Concerns:**');
      for (const c of summary.riskAssessment.concerns) {
        parts.push(`- ⚠️ ${c}`);
      }
    }
    if (summary.riskAssessment.mitigations && summary.riskAssessment.mitigations.length > 0) {
      parts.push('\n**Mitigations:**');
      for (const m of summary.riskAssessment.mitigations) {
        parts.push(`- ✅ ${m}`);
      }
    }
    if (collapsible) parts.push('\n</details>');
    parts.push('');
  }

  // Review checklist
  if (summary.reviewChecklist && summary.reviewChecklist.length > 0) {
    parts.push(`### ${collapsible ? '<details><summary>' : ''}✅ Review Checklist${collapsible ? '</summary>' : ''}\n`);
    for (const item of summary.reviewChecklist) {
      parts.push(`- [ ] ${item}`);
    }
    if (collapsible) parts.push('\n</details>');
    parts.push('');
  }

  parts.push('---');
  parts.push('*🤖 Generated by [coderev](https://github.com/jishuanjimingtian/coderev)*');

  return parts.join('\n');
}

/**
 * Format PR Summary as a short terminal output.
 */
function formatPrSummaryTerminal(summary) {
  const chalk = require('chalk');
  const lines = [];

  lines.push(chalk.bold('\n📋 PR Summary / PR 摘要'));
  lines.push('━'.repeat(50));

  if (summary.title) {
    lines.push(chalk.cyan(`Suggested title: ${summary.title}`));
  }

  if (summary.summary) {
    lines.push(`\n${summary.summary}`);
  }

  if (summary.walkthrough && summary.walkthrough.length > 0) {
    lines.push(chalk.bold('\n📁 Walkthrough:'));
    for (const f of summary.walkthrough) {
      const icon = f.type === 'added' ? '+' : f.type === 'deleted' ? '-' : '~';
      lines.push(`  ${chalk.gray(icon)} ${f.file}: ${f.summary}`);
    }
  }

  if (summary.riskAssessment) {
    const riskColor = summary.riskAssessment.level === 'high' ? chalk.red : summary.riskAssessment.level === 'medium' ? chalk.yellow : chalk.green;
    lines.push(chalk.bold(`\n🔍 Risk: ${riskColor(summary.riskAssessment.level.toUpperCase())}`));
  }

  return lines.join('\n');
}

// ── Helpers ──

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    throw new Error('Failed to parse AI response');
  }
}

function normalizeSummary(parsed) {
  return {
    title: parsed.title || null,
    summary: parsed.summary || 'No summary generated',
    type: parsed.type || 'unknown',
    walkthrough: (parsed.walkthrough || []).map(f => ({
      file: f.file || '',
      summary: f.summary || f.file || '',
      type: f.type || 'modified',
      keyChanges: f.keyChanges || [],
    })),
    riskAssessment: parsed.riskAssessment || { level: 'unknown', concerns: [], mitigations: [] },
    reviewChecklist: parsed.reviewChecklist || [],
  };
}

module.exports = {
  generatePrSummary,
  formatPrSummaryMarkdown,
  formatPrSummaryTerminal,
};
