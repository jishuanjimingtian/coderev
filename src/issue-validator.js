/**
 * Issue Validator — 验证 PR 是否真正解决了关联的 issue
 *
 * 功能：
 *   - 解析 GitHub/GitLab issue URL
 *   - 获取 issue 内容（标题、描述、标签、assignees）
 *   - 对比 PR diff 与 issue 描述，检查是否相关
 *   - 检测遗漏的关联 issue（基于 commit message 引用）
 *   - 输出 issue 覆盖报告
 *
 * 用法：
 *   coderev review --issue https://github.com/owner/repo/issues/42
 *   coderev review --pr owner/repo#10 --verify-issue
 */

const https = require('https');
const http = require('http');

/**
 * Parse GitHub/GitLab issue URL into structured reference.
 */
function parseIssueRef(input) {
  // GitHub: https://github.com/owner/repo/issues/42
  // GitHub PR:  owner/repo#42
  // GitLab:  https://gitlab.com/owner/repo/-/issues/42
  // GitLab MR: owner/repo!42

  const githubUrl = input.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (githubUrl) {
    return { platform: 'github', owner: githubUrl[1], repo: githubUrl[2].replace(/\.git$/, ''), issueNumber: parseInt(githubUrl[3]), url: input };
  }

  const gitlabUrl = input.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/issues\/(\d+)/);
  if (gitlabUrl) {
    return { platform: 'gitlab', owner: gitlabUrl[1], repo: gitlabUrl[2], issueNumber: parseInt(gitlabUrl[3]), url: input };
  }

  // GitHub shorthand: owner/repo#42
  const ghShorthand = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (ghShorthand) {
    return { platform: 'github', owner: ghShorthand[1], repo: ghShorthand[2], issueNumber: parseInt(ghShorthand[3]), url: `https://github.com/${ghShorthand[1]}/${ghShorthand[2]}/issues/${ghShorthand[3]}` };
  }

  // GitLab shorthand: owner/repo!42
  const glShorthand = input.match(/^([^/]+)\/([^!]+)!(\d+)$/);
  if (glShorthand) {
    return { platform: 'gitlab', owner: glShorthand[1], repo: glShorthand[2], issueNumber: parseInt(glShorthand[3]), url: `https://gitlab.com/${glShorthand[1]}/${glShorthand[2]}/-/issues/${glShorthand[3]}` };
  }

  // GitHub issue number only
  const bareNum = input.match(/^#?(\d+)$/);
  if (bareNum) {
    return { platform: 'github', owner: null, repo: null, issueNumber: parseInt(bareNum[1]), url: null };
  }

  return null;
}

/**
 * Fetch GitHub issue details.
 */
function fetchGitHubIssue(owner, repo, issueNumber, token) {
  return new Promise((resolve, reject) => {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}`;
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'coderev',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    https.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              title: parsed.title,
              body: parsed.body || '',
              state: parsed.state,
              labels: (parsed.labels || []).map(l => l.name),
              assignees: (parsed.assignees || []).map(a => a.login),
              milestone: parsed.milestone?.title || null,
              number: parsed.number,
              html_url: parsed.html_url,
              pull_request: parsed.pull_request || null, // Issues that are actually PRs
            });
          } catch {
            reject(new Error('Failed to parse issue JSON'));
          }
        } else if (res.statusCode === 404) {
          reject(new Error(`Issue not found: ${owner}/${repo}#${issueNumber}`));
        } else if (res.statusCode === 403) {
          reject(new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN for higher limits.'));
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch issue comments for additional context.
 */
function fetchGitHubIssueComments(owner, repo, issueNumber, token) {
  return new Promise((resolve, reject) => {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=30`;
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'coderev',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    https.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.map(c => ({ user: c.user?.login, body: c.body || '', created_at: c.created_at })));
          } catch {
            resolve([]);
          }
        } else {
          resolve([]); // Comments are optional context
        }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * Fetch linked PRs for an issue (GitHub GraphQL-like via timeline).
 */
async function fetchIssueReferences(owner, repo, issueNumber, token) {
  return new Promise((resolve, reject) => {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}/timeline?per_page=50`;
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'coderev',
        'Accept': 'application/vnd.github.mockingbird.issue-timeline+json',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    https.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const events = JSON.parse(data);
            const refs = {
              linkedPRs: events.filter(e => e.event === 'cross-referenced' && e.source?.type === 'pull_request').length,
              closedBy: events.filter(e => e.event === 'closed' && e.commit_id).length,
            };
            resolve(refs);
          } catch {
            resolve({ linkedPRs: 0, closedBy: 0 });
          }
        } else {
          resolve({ linkedPRs: 0, closedBy: 0 });
        }
      });
    }).on('error', () => resolve({ linkedPRs: 0, closedBy: 0 }));
  });
}

/**
 * Extract keywords and concepts from issue body for relevance matching.
 */
function extractIssueKeywords(issue) {
  const text = `${issue.title} ${issue.body}`.toLowerCase();
  const keywords = new Set();

  // Extract file paths mentioned
  const fileMatches = text.match(/[`'"]?([\w./-]+\.[\w]{1,6})[`'"]?/g) || [];
  for (const m of fileMatches) {
    const clean = m.replace(/[`'"]/g, '');
    if (/\w+\.\w+$/.test(clean)) keywords.add(clean);
  }

  // Extract function/class names
  const funcMatches = text.match(/\b([a-z_]\w+)\s*\(/g) || [];
  for (const m of funcMatches) keywords.add(m.replace(/\s*\(/, ''));

  // Extract key nouns (simple heuristic: capitalized words or technical terms)
  const techTerms = [
    'auth', 'login', 'password', 'token', 'api', 'endpoint', 'route', 'handler',
    'database', 'query', 'migration', 'schema', 'table', 'column', 'index',
    'cache', 'redis', 'queue', 'worker', 'job', 'cron',
    'error', 'exception', 'crash', 'bug', 'fix', 'patch',
    'refactor', 'rename', 'remove', 'deprecate', 'migrate',
    'ui', 'component', 'button', 'modal', 'form', 'input', 'page',
    'permission', 'role', 'access', 'admin', 'user', 'profile',
    'config', 'env', 'environment', 'deploy', 'build', 'ci',
    'payment', 'billing', 'stripe', 'invoice',
    'email', 'sms', 'notification', 'alert', 'webhook',
    'upload', 'download', 'file', 'image', 'video',
    'search', 'filter', 'sort', 'paginate', 'export', 'import',
  ];
  for (const term of techTerms) {
    if (text.includes(term)) keywords.add(term);
  }

  return [...keywords];
}

/**
 * Check if the PR diff addresses the issue content.
 * Uses keyword matching and structured analysis.
 */
function validateIssueAgainstDiff(issue, diff, options = {}) {
  const keywords = extractIssueKeywords(issue);
  const diffLower = diff.toLowerCase();

  const findings = {
    matchedFiles: [],
    matchedKeywords: [],
    unmatchedKeywords: [],
    overallRelevance: 0,
    verdict: 'unknown', // 'fully-addressed' | 'partially-addressed' | 'unaddressed' | 'unknown'
    details: '',
  };

  // Check which files from the issue are touched in the diff
  for (const kw of keywords) {
    if (kw.includes('.')) {
      // File path
      if (diffLower.includes(kw.toLowerCase())) {
        findings.matchedFiles.push(kw);
      } else {
        findings.unmatchedKeywords.push(kw);
      }
    } else {
      // Keyword
      if (diffLower.includes(kw.toLowerCase())) {
        findings.matchedKeywords.push(kw);
      } else {
        findings.unmatchedKeywords.push(kw);
      }
    }
  }

  // Calculate relevance
  const totalKeys = findings.matchedFiles.length + findings.matchedKeywords.length +
    findings.unmatchedKeywords.length;

  if (totalKeys === 0) {
    findings.overallRelevance = 50; // No keywords found — cannot determine
    findings.verdict = 'unknown';
    findings.details = 'Cannot determine relevance: no keywords extracted from issue';
  } else {
    const matchedCount = findings.matchedFiles.length + findings.matchedKeywords.length;
    findings.overallRelevance = Math.round((matchedCount / totalKeys) * 100);

    if (findings.overallRelevance >= 70) {
      findings.verdict = 'fully-addressed';
      findings.details = `PR touches ${findings.matchedFiles.length} mentioned file(s) and ${findings.matchedKeywords.length} keyword(s)`;
    } else if (findings.overallRelevance >= 30) {
      findings.verdict = 'partially-addressed';
      findings.details = `PR only partially addresses the issue: ${findings.unmatchedKeywords.length} keyword(s) missing`;
    } else {
      findings.verdict = 'unaddressed';
      findings.details = `PR does not appear to address the issue: ${findings.unmatchedKeywords.length} keyword(s) not found in diff`;
    }
  }

  return findings;
}

/**
 * Scan commit messages for references to other issues that may be related.
 */
function findRelatedIssues(diff, commitLog) {
  if (!commitLog && !diff) return [];

  const text = (commitLog || '') + '\n' + (diff || '');
  const issueRefs = new Set();

  // GitHub style: fixes #123, closes #123, resolves #123, ref #123
  const ghPattern = /(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?|ref(?:erence)?|see|relate[sd]?(?:\s+to)?)\s+#(\d+)/gi;
  let match;
  while ((match = ghPattern.exec(text)) !== null) {
    issueRefs.add(`#${match[1]}`);
  }

  // GitLab style: closes !123, relates to !123
  const glPattern = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|ref(?:erence)?)\s+!(\d+)/gi;
  while ((match = glPattern.exec(text)) !== null) {
    issueRefs.add(`!${match[1]}`);
  }

  return [...issueRefs];
}

/**
 * Generate an issue validation report.
 */
function generateIssueReport(issue, validation, relatedIssues, reviewResult) {
  const verdictIcons = {
    'fully-addressed': '✅',
    'partially-addressed': '⚠️',
    'unaddressed': '❌',
    'unknown': '❓',
  };

  const report = {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.html_url || issue.url,
      state: issue.state,
      labels: issue.labels || [],
      assignees: issue.assignees || [],
    },
    validation,
    relatedIssues: relatedIssues || [],
    verdict: validation.verdict,
    combinedScore: reviewResult?.score || 0,
    issuesFound: (reviewResult?.issues || []).length,
  };

  return report;
}

/**
 * Format terminal output for issue validation.
 */
function formatIssueReport(report) {
  const chalk = require('chalk');
  const lines = [];

  lines.push(chalk.bold('\n🔗 Issue Validation Report / Issue 验证报告'));
  lines.push('━'.repeat(55));

  // Issue Info
  lines.push(chalk.bold(`\n📋 Issue #${report.issue.number}: ${report.issue.title}`));
  if (report.issue.url) {
    lines.push(chalk.gray(`   ${report.issue.url}`));
  }
  lines.push(chalk.gray(`   State: ${report.issue.state}`));
  if (report.issue.labels.length > 0) {
    lines.push(chalk.gray(`   Labels: ${report.issue.labels.join(', ')}`));
  }
  if (report.issue.assignees.length > 0) {
    lines.push(chalk.gray(`   Assignees: ${report.issue.assignees.join(', ')}`));
  }

  // Validation Result
  const verdc = report.validation.verdict === 'fully-addressed' ? chalk.green :
    report.validation.verdict === 'partially-addressed' ? chalk.yellow : chalk.red;
  lines.push(chalk.bold(`\n🔄 Verdict / 判定: ${verdc(report.validation.verdict)}`));
  lines.push(`   Relevance / 关联度: ${report.validation.overallRelevance}%`);
  lines.push(chalk.gray(`   ${report.validation.details}`));

  if (report.validation.matchedFiles.length > 0) {
    lines.push(chalk.green(`\n   📁 Matched Files / 匹配文件 (${report.validation.matchedFiles.length}):`));
    for (const f of report.validation.matchedFiles) {
      lines.push(chalk.green(`      ✔ ${f}`));
    }
  }

  if (report.validation.matchedKeywords.length > 0) {
    lines.push(chalk.blue(`\n   🔑 Matched Keywords / 匹配关键词 (${report.validation.matchedKeywords.length}):`));
    lines.push(chalk.blue(`      ${report.validation.matchedKeywords.join(', ')}`));
  }

  if (report.validation.unmatchedKeywords.length > 0) {
    lines.push(chalk.yellow(`\n   ⚠ Unmatched / 未匹配 (${report.validation.unmatchedKeywords.length}):`));
    lines.push(chalk.yellow(`      ${report.validation.unmatchedKeywords.join(', ')}`));
  }

  // Related issues
  if (report.relatedIssues.length > 0) {
    lines.push(chalk.bold(`\n🔗 Related Issues / 关联 Issue (${report.relatedIssues.length}):`));
    for (const ref of report.relatedIssues) {
      lines.push(chalk.cyan(`   → ${ref}`));
    }
  }

  // Code review summary
  if (report.combinedScore > 0) {
    const sc = report.combinedScore >= 80 ? chalk.green : report.combinedScore >= 50 ? chalk.yellow : chalk.red;
    lines.push(chalk.bold(`\n📊 Code Review: ${sc(report.combinedScore + '/100')} (${report.issuesFound} issues)`));
  }

  lines.push('\n' + '━'.repeat(55));
  return lines.join('\n');
}

/**
 * Parse commit log from a git repository for issue references.
 */
function parseCommitLog(repoPath, maxCommits = 20) {
  try {
    const { execSync } = require('child_process');
    const log = execSync(`git log --oneline -${maxCommits}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return log;
  } catch {
    return '';
  }
}

/**
 * Validate an issue against a PR diff.
 *
 * @param {string} issueRef - Issue URL or reference string
 * @param {string} diff - PR diff text
 * @param {object} options
 * @param {string} options.repoPath - Path to git repo (for commit log)
 * @param {string} options.token - GitHub/GitLab token
 * @param {object} options.reviewResult - Existing review result (from reviewDiff)
 * @returns {Promise<{report: object, formatted: string}>}
 */
async function validateIssue(issueRef, diff, options = {}) {
  const parsed = parseIssueRef(issueRef);
  if (!parsed) {
    throw new Error(`Cannot parse issue reference: "${issueRef}". Use format: https://github.com/owner/repo/issues/42 or owner/repo#42`);
  }

  if (!parsed.owner || !parsed.repo) {
    throw new Error(`Issue reference must include owner and repo. Use format: https://github.com/owner/repo/issues/42`);
  }

  // Fetch issue
  const token = options.token || process.env.GITHUB_TOKEN || process.env.GITLAB_TOKEN;
  let issue;

  if (parsed.platform === 'github') {
    issue = await fetchGitHubIssue(parsed.owner, parsed.repo, parsed.issueNumber, token);
    // Fetch comments for richer context
    try {
      const comments = await fetchGitHubIssueComments(parsed.owner, parsed.repo, parsed.issueNumber, token);
      if (comments.length > 0) {
        issue.comments = comments;
        issue.body = (issue.body || '') + '\n\n--- Comments ---\n' +
          comments.map(c => `@${c.user}: ${c.body.slice(0, 300)}`).join('\n');
      }
    } catch {}
  } else {
    throw new Error('GitLab issue fetching not yet implemented. Use GitHub issue URLs.');
  }

  // Validate issue against diff
  const validation = validateIssueAgainstDiff(issue, diff, options);

  // Find related issues from commit log
  let commitLog = '';
  let relatedIssues = [];
  if (options.repoPath) {
    commitLog = parseCommitLog(options.repoPath);
  }
  relatedIssues = findRelatedIssues(diff, commitLog)
    .filter(ref => ref !== `#${issue.number}`); // Exclude the primary issue

  // Check for issue references from timeline
  try {
    const refs = await fetchIssueReferences(parsed.owner, parsed.repo, parsed.issueNumber, token);
    // If no related issues from diff, note that the issue has been cross-referenced elsewhere
  } catch {}

  const report = generateIssueReport(issue, validation, relatedIssues, options.reviewResult);
  const formatted = formatIssueReport(report);

  return { report, formatted, validation, issue };
}

module.exports = {
  parseIssueRef,
  fetchGitHubIssue,
  fetchGitHubIssueComments,
  validateIssueAgainstDiff,
  extractIssueKeywords,
  findRelatedIssues,
  generateIssueReport,
  formatIssueReport,
  parseCommitLog,
  validateIssue,
};
