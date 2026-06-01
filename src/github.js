const https = require('https');

/**
 * Resolve the GitHub token with fallback priority:
 * 1. Explicit --github-token argument
 * 2. GITHUB_TOKEN env var
 * 3. config.github.token from .coderevrc.json
 */
function resolveToken(cliToken, config) {
  if (cliToken) return cliToken;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  // Check config.github.token (from .coderevrc.json)
  try {
    if (config && config.github && config.github.token) return config.github.token;
  } catch {}
  return null;
}

/**
 * Parse a GitHub PR URL or owner/repo#pr shorthand into parts.
 * Supported formats:
 *   - owner/repo#42
 *   - https://github.com/owner/repo/pull/42
 *   - https://api.github.com/repos/owner/repo/pulls/42
 *   - 42 (local repo, requires --repo or gh detection)
 */
function parsePrRef(ref) {
  // owner/repo#42
  const shorthand = ref.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2], pr: parseInt(shorthand[3], 10) };
  }

  // Full GitHub URL
  const fullUrl = ref.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (fullUrl) {
    return { owner: fullUrl[1], repo: fullUrl[2], pr: parseInt(fullUrl[3], 10) };
  }

  // API URL
  const apiUrl = ref.match(/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)\/pulls\/(\d+)/);
  if (apiUrl) {
    return { owner: apiUrl[1], repo: apiUrl[2], pr: parseInt(apiUrl[3], 10) };
  }

  // Just a number: assume local repo context
  const justNumber = ref.match(/^(\d+)$/);
  if (justNumber) {
    return { owner: null, repo: null, pr: parseInt(justNumber[1], 10) };
  }

  throw new Error(
    `Invalid PR reference: "${ref}". Use formats like:\n` +
    `  coderev review --pr owner/repo#42\n` +
    `  coderev review --pr https://github.com/owner/repo/pull/42\n` +
    `  coderev review --pr 42              (current repo via gh)`
  );
}

/**
 * Fetch a pull request diff from GitHub.
 * @param {object} ref - { owner, repo, pr }
 * @param {string} token - GitHub personal access token (optional, for private repos)
 * @returns {Promise<string>} The diff text
 */
function fetchPrDiff(ref, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls/${pr}`,
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/vnd.github.v3.diff',
      },
    };

    if (token) {
      options.headers['Authorization'] = `token ${token}`;
    }

    https.get(options, (res) => {
      // Handle redirects (GitHub may redirect to a different endpoint)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { headers: options.headers }, (res2) => {
          let body = '';
          res2.on('data', (chunk) => (body += chunk));
          res2.on('end', () => {
            if (res2.statusCode === 200) resolve(body);
            else reject(new Error(`GitHub API returned status ${res2.statusCode}: ${body.slice(0, 200)}`));
          });
        }).on('error', reject);
        return;
      }

      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else if (res.statusCode === 404) {
          reject(new Error(`PR not found: ${owner}/${repo}#${pr}. Is the repo private? Use --github-token.`));
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`GitHub API access denied (${res.statusCode}). Try setting GITHUB_TOKEN.`));
        } else {
          reject(new Error(`GitHub API returned status ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Post a review comment on a PR (single top-level comment).
 * @param {object} ref - { owner, repo, pr }
 * @param {string} body - Comment body (Markdown)
 * @param {string} token - GitHub personal access token
 * @returns {Promise<object>} GitHub API response
 */
function postPrComment(ref, body, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues/${pr}/comments`,
      method: 'POST',
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Failed to post comment (${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Detect current GitHub repo info using `gh` CLI.
 * @returns {{ owner: string, repo: string } | null}
 */
function detectRepoFromGh() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('gh repo view --json owner,name 2>nul', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const parsed = JSON.parse(output);
    if (parsed.owner && parsed.name) {
      return {
        owner: typeof parsed.owner === 'object' ? parsed.owner.login : parsed.owner,
        repo: parsed.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get local GitHub remote origin info from git.
 * @param {string} [repoPath] - Path to git repo (defaults to cwd)
 * @returns {{ owner: string, repo: string } | null}
 */
function detectRepoFromGit(repoPath) {
  try {
    const { execSync } = require('child_process');
    const remote = execSync('git config --get remote.origin.url', {
      cwd: repoPath || process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    // Supports: git@github.com:owner/repo.git, https://github.com/owner/repo, etc.
    const match = remote.match(/(?:(?:git@|https:\/\/)github\.com[\/:])([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a partial PR ref into a full { owner, repo, pr }.
 * If owner/repo is missing, tries gh CLI then git remote.
 */
function resolvePrRef(ref, repoPath) {
  const parsed = parsePrRef(ref);

  if (parsed.owner && parsed.repo) {
    return parsed; // Already fully qualified
  }

  // Try gh CLI first, then git remote
  let repoInfo = detectRepoFromGh();
  if (!repoInfo) repoInfo = detectRepoFromGit(repoPath);

  if (!repoInfo) {
    throw new Error(
      `Could not detect current repo. Use full format like owner/repo#${parsed.pr}, ` +
      `or install GitHub CLI (gh) and authenticate.`
    );
  }

  return { owner: repoInfo.owner, repo: repoInfo.repo, pr: parsed.pr };
}

/**
 * Fetch PR file list with patch info (for line-level comments).
 * @param {object} ref - { owner, repo, pr }
 * @param {string} token - GitHub token
 * @returns {Promise<Array>} Array of { filename, patch, sha }
 */
function fetchPrFiles(ref, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls/${pr}/files`,
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    if (token) options.headers['Authorization'] = `token ${token}`;

    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Failed to parse PR files response')); }
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Post inline review comments on a PR via the Pull Request Review API.
 * @param {object} ref - { owner, repo, pr }
 * @param {string} commitId - SHA of the head commit
 * @param {Array} comments - Array of { path, line, body, side: 'LEFT'|'RIGHT' }
 * @param {string} token - GitHub token
 * @returns {Promise<object>} GitHub API response
 */
function postInlineComments(ref, commitId, comments, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const body = {
      commit_id: commitId,
      event: 'COMMENT',
      body: '## coderev review\n\n' + `Found ${comments.length} issue(s):`,
      comments: comments.map(c => ({
        path: c.path,
        line: c.line,
        side: c.side || 'RIGHT',
        body: `**${c.type.toUpperCase()}**${c.severity ? ' [' + c.severity + ']' : ''}: ${c.message}${c.suggestion ? '\n\n> Suggestion: ' + c.suggestion : ''}`,
      })),
    };

    const postData = JSON.stringify(body);
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls/${pr}/reviews`,
      method: 'POST',
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let rb = '';
      res.on('data', (c) => (rb += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(rb)); }
          catch { resolve(rb); }
        } else {
          reject(new Error(`Failed to post review (${res.statusCode}): ${rb.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * List all open pull requests for a repository.
 * @param {object} ref - { owner, repo }
 * @param {string} token - GitHub token
 * @param {object} [options] - { state: 'open'|'closed'|'all', limit: number }
 * @returns {Promise<Array>} Array of { number, title, head, base, url }
 */
function listPullRequests(ref, token, options = {}) {
  const { owner, repo } = ref;
  const state = options.state || 'open';
  const limit = options.limit || 50;
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}&sort=updated&direction=desc`,
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    if (token) opts.headers['Authorization'] = `token ${token}`;

    https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const prs = JSON.parse(body);
            resolve(prs.map(p => ({
              number: p.number,
              title: p.title,
              head: p.head.ref,
              base: p.base.ref,
              url: p.html_url,
              draft: p.draft || false,
              updatedAt: p.updated_at,
            })));
          } catch { reject(new Error('Failed to parse PR list')); }
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

module.exports = { parsePrRef, fetchPrDiff, postPrComment, resolvePrRef, detectRepoFromGh, detectRepoFromGit, resolveToken, fetchPrFiles, postInlineComments, listPullRequests };
