#!/usr/bin/env node

/**
 * coderev GitHub App Server
 *
 * 一个独立的 webhook 服务器，接收 GitHub App 的 pull_request 事件，
 * 自动运行 coderev 审查并将结果作为 PR review 发布。
 *
 * 运行方式:
 *   coderev serve --port 3000 --webhook-secret your-secret --app-id 123456 --private-key ./key.pem
 *   或
 *   GITHUB_APP_ID=123456 GITHUB_APP_PRIVATE_KEY="$(cat key.pem)" coderev serve
 *
 * 部署建议:
 *   - Railway / Render / Fly.io / 自建 VPS
 *   - 配合 PM2 持久化运行
 *   - 设置 GitHub App Webhook URL → https://your-domain.com/webhook
 */

const http = require('http');
const crypto = require('crypto');
const { loadConfig, getApiKey } = require('./config');
const { reviewDiff } = require('./reviewer');
const chalk = require('chalk');

// ── 配置 ─────────────────────────────────────────────────────

/**
 * Load GitHub App config from env vars (or .coderevrc.json later).
 */
function loadAppConfig() {
  const config = loadConfig();
  const appConfig = config.githubApp || {};

  return {
    // Required
    appId: process.env.GITHUB_APP_ID || appConfig.appId,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_FILE ? require('fs').readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_FILE, 'utf8') : appConfig.privateKey,
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET || appConfig.webhookSecret || '',

    // Optional
    port: parseInt(process.env.PORT || appConfig.port || 3000, 10),
    host: process.env.HOST || appConfig.host || '0.0.0.0',
    autoApprove: process.env.AUTO_APPROVE === 'true' || appConfig.autoApprove === true,
    minConfidence: parseInt(process.env.MIN_CONFIDENCE || appConfig.minConfidence || 60, 10),
    reviewMode: process.env.REVIEW_MODE || appConfig.reviewMode || 'comment',
    // 'comment' — single PR comment summary
    // 'inline' — inline review comments (needs file SHA mapping)
    // 'check' — commit status check (set pending → success/failure)
    skipDrafts: process.env.SKIP_DRAFTS !== 'false',
    skipBotPRs: process.env.SKIP_BOT_PRS !== 'false',
  };
}

// ── GitHub App JWT Token ────────────────────────────────────

/**
 * Generate a JWT for GitHub App authentication.
 * @param {string} appId - GitHub App ID
 * @param {string} privateKeyPem - RSA private key in PEM format
 * @returns {{ token: string, expiresAt: number }}
 */
function generateAppJWT(appId, privateKeyPem) {
  if (!appId || !privateKeyPem) {
    throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,            // 1 minute leeway
    exp: now + 600,            // 10 minute expiry (GitHub max)
    iss: parseInt(appId, 10),
  };

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Base64url encode
  const b64u = (obj) => Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const headerEnc = b64u(header);
  const payloadEnc = b64u(payload);

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(headerEnc + '.' + payloadEnc);
  const sig = sign.sign(privateKeyPem, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    token: headerEnc + '.' + payloadEnc + '.' + sig,
    expiresAt: payload.exp,
  };
}

// ── GitHub API 调用（已认证） ──────────────────────────────

/**
 * Call GitHub API with JWT or installation token.
 */
function githubApi(path, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'coderev-github-app',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
      },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : {}); }
          catch { resolve(data); }
        } else if (res.statusCode === 204) {
          resolve({});
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Exchange JWT for an installation access token.
 * @param {string} jwt
 * @param {number} installationId
 * @returns {Promise<{ token: string, expiresAt: string }>}
 */
async function getInstallationToken(jwt, installationId) {
  const result = await githubApi(`/app/installations/${installationId}/access_tokens`, jwt, 'POST');
  return { token: result.token, expiresAt: result.expires_at };
}

// ── Webhook 处理 ────────────────────────────────────────────

/**
 * Verify webhook signature.
 */
function verifySignature(payload, signature, secret) {
  if (!secret) return true; // No secret configured — skip verification
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Constant-time comparison
  if (sig.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(signature));
}

/**
 * Handle pull_request.opened and pull_request.synchronize events.
 */
async function handlePREvent(event, payload, appConfig) {
  const action = payload.action;
  const pr = payload.pull_request;

  // Validate event
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return { handled: false, reason: `unsupported action: ${action}` };
  }

  // Skip drafts
  if (appConfig.skipDrafts !== false && pr.draft) {
    return { handled: false, reason: 'draft PR, skipped' };
  }

  // Skip bot PRs
  if (appConfig.skipBotPRs !== false && (pr.user?.type === 'Bot' || (pr.title || '').startsWith('[bot]'))) {
    return { handled: false, reason: 'bot PR, skipped' };
  }

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = pr.number;
  const ref = { owner, repo, pr: prNumber };
  const installationId = payload.installation?.id;

  if (!installationId) {
    return { handled: false, reason: 'no installation id' };
  }

  console.error(chalk.blue(`[${owner}/${repo}#${prNumber}] Processing ${action}...`));

  // 1. Get installation token
  const jwt = generateAppJWT(appConfig.appId, appConfig.privateKey);
  let instToken;
  try {
    instToken = await getInstallationToken(jwt.token, installationId);
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}#${prNumber}] Failed to get installation token: ${err.message}`));
    return { handled: false, error: err.message };
  }

  const token = instToken.token;

  // 2. Fetch PR diff
  const { fetchPrDiff } = require('./github');
  let diff;
  try {
    diff = await fetchPrDiff(ref, token);
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}#${prNumber}] Failed to fetch diff: ${err.message}`));
    await setCommitStatus(token, ref, pr.head.sha, 'error', 'Failed to fetch diff');
    return { handled: false, error: err.message };
  }

  // 3. Set commit status to pending
  if (appConfig.reviewMode === 'check' || true) {
    try {
      await setCommitStatus(token, ref, pr.head.sha, 'pending', 'coderev is reviewing...');
    } catch {}
  }

  // 4. Run review
  let result;
  try {
    result = await reviewDiff(diff, null, {
      noCache: true,
      minConfidence: appConfig.minConfidence,
    });
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}#${prNumber}] Review failed: ${err.message}`));
    await setCommitStatus(token, ref, pr.head.sha, 'error', 'Review failed: ' + err.message.slice(0, 100));
    return { handled: false, error: err.message };
  }

  const issueCount = (result.issues || []).length;

  console.error(chalk.cyan(`[${owner}/${repo}#${prNumber}] Review complete: ${result.score}/100, ${issueCount} issues`));

  // 5. Generate PR Summary + Walkthrough (if diff is non-trivial)
  let prSummary = null;
  if (diff && diff.length > 200) {
    try {
      const { generatePrSummary, formatPrSummaryMarkdown } = require('./pr-summary');
      const apiKey = getApiKey(loadConfig());
      if (apiKey) {
        prSummary = await generatePrSummary(diff, apiKey, loadConfig(), {
          prTitle: pr.title || '',
          prBody: pr.body || '',
          includeRisk: true,
        });
      }
    } catch (err) {
      console.error(chalk.yellow(`[${owner}/${repo}#${prNumber}] PR summary generation failed: ${err.message}`));
    }
  }

  // 6. Post review
  try {
    if (appConfig.reviewMode === 'inline') {
      // Inline mode — post review comments at file level
      await postInlineReview(token, ref, pr, result);
    } else {
      // Default: post a PR comment summary
      let md = formatAppMarkdown(result, ref);

      // Prepend PR Summary if generated
      if (prSummary && prSummary.walkthrough && prSummary.walkthrough.length > 0) {
        const summaryMd = formatPrSummaryMarkdown(prSummary);
        md = summaryMd + '\n---\n\n' + md;
      }

      await postPrComment(ref, md, token);
    }
  } catch (err) {
    console.error(chalk.yellow(`[${owner}/${repo}#${prNumber}] Failed to post comment: ${err.message}`));
  }

  // 7. Set final commit status (check mode or always)
  try {
    const state = issueCount === 0 ? 'success' : (result.score >= 60 ? 'neutral' : 'failure');
    const description = issueCount === 0
      ? '✅ coderev: no issues found'
      : `⚠ coderev: ${issueCount} issues (score: ${result.score}/100)`;
    await setCommitStatus(token, ref, pr.head.sha, state, description);
  } catch {}

  // 8. Auto-approve if configured and no issues
  if (appConfig.autoApprove && issueCount === 0) {
    try {
      await approvePR(token, ref, pr.head.sha);
      console.error(chalk.green(`[${owner}/${repo}#${prNumber}] Auto-approved`));
    } catch (err) {
      console.error(chalk.yellow(`[${owner}/${repo}#${prNumber}] Auto-approve failed: ${err.message}`));
    }
  }

  return { handled: true, score: result.score, issues: issueCount };
}

/**
 * Handle push events — incremental review for new commits.
 */
async function handlePushEvent(event, payload, appConfig) {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const before = payload.before;
  const after = payload.after;
  const ref = payload.ref;
  const installationId = payload.installation?.id;

  // Skip if not a branch push, or before is all zeros (new branch)
  if (!ref?.startsWith('refs/heads/') || !before || before === '0000000000000000000000000000000000000000') {
    return { handled: false, reason: 'not a branch push or new branch creation' };
  }

  // Skip force pushes
  if (payload.forced) {
    return { handled: false, reason: 'force push skipped' };
  }

  if (!installationId) {
    return { handled: false, reason: 'no installation id' };
  }

  console.error(chalk.blue(`[${owner}/${repo}@${after.slice(0, 8)}] Processing push (${before.slice(0, 8)} → ${after.slice(0, 8)})...`));

  // 1. Get installation token
  const jwt = generateAppJWT(appConfig.appId, appConfig.privateKey);
  let instToken;
  try {
    instToken = await getInstallationToken(jwt.token, installationId);
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}@${after.slice(0, 8)}] Failed to get installation token: ${err.message}`));
    return { handled: false, error: err.message };
  }

  const token = instToken.token;

  // 2. Fetch commit diff (before → after)
  let diff;
  try {
    diff = await fetchCommitDiff({ owner, repo, base: before, head: after }, token);
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}@${after.slice(0, 8)}] Failed to fetch commit diff: ${err.message}`));
    await setCommitStatus(token, { owner, repo }, after, 'error', 'Failed to fetch commit diff');
    return { handled: false, error: err.message };
  }

  // Skip if no diff
  if (!diff || diff.length < 10) {
    console.error(chalk.gray(`[${owner}/${repo}@${after.slice(0, 8)}] No meaningful diff, skipping`));
    return { handled: false, reason: 'empty diff' };
  }

  // 3. Parse incremental diff (only added/changed lines)
  const { parseIncrementalDiff } = require('./fixer');
  const incrementalDiff = parseIncrementalDiff(diff);

  // Skip if no incremental changes
  if (!incrementalDiff || incrementalDiff.length < 10) {
    console.error(chalk.gray(`[${owner}/${repo}@${after.slice(0, 8)}] No incremental changes, skipping`));
    return { handled: false, reason: 'no incremental changes' };
  }

  // 4. Set commit status to pending
  try {
    await setCommitStatus(token, { owner, repo }, after, 'pending', 'coderev is reviewing incrementally...');
  } catch {}

  // 5. Run incremental review
  let result;
  try {
    result = await reviewDiff(incrementalDiff, null, {
      noCache: true,
      minConfidence: appConfig.minConfidence,
      incremental: true,
    });
  } catch (err) {
    console.error(chalk.red(`[${owner}/${repo}@${after.slice(0, 8)}] Review failed: ${err.message}`));
    await setCommitStatus(token, { owner, repo }, after, 'error', 'Review failed: ' + err.message.slice(0, 100));
    return { handled: false, error: err.message };
  }

  const issueCount = (result.issues || []).length;

  console.error(chalk.cyan(`[${owner}/${repo}@${after.slice(0, 8)}] Incremental review complete: ${result.score}/100, ${issueCount} issues`));

  // 6. Set final commit status
  try {
    const state = issueCount === 0 ? 'success' : (result.score >= 60 ? 'neutral' : 'failure');
    const description = issueCount === 0
      ? '✅ coderev: no issues found (incremental)'
      : `⚠ coderev: ${issueCount} issues (score: ${result.score}/100) [incremental]`;
    await setCommitStatus(token, { owner, repo }, after, state, description);
  } catch {}

  // 7. If this push is to an open PR branch, also post a PR comment
  if (payload.commits && payload.commits.length > 0) {
    try {
      // Find PRs associated with this branch
      const branchName = ref.replace('refs/heads/', '');
      const prs = await findOpenPRsForBranch(token, { owner, repo }, branchName);

      for (const pr of prs) {
        // Post a comment to the PR with incremental review results
        if (issueCount > 0) {
          const commentMd = formatIncrementalPRMarkdown(result, { owner, repo, pr: pr.number }, after, branchName);
          await postPrComment({ owner, repo, pr: pr.number }, commentMd, token);
          console.error(chalk.green(`[${owner}/${repo}#${pr.number}] Incremental comment posted`));
        }
      }
    } catch (err) {
      console.error(chalk.yellow(`[${owner}/${repo}@${after.slice(0, 8)}] Failed to find/comment on PR: ${err.message}`));
    }
  }

  return { handled: true, score: result.score, issues: issueCount, incremental: true };
}

/**
 * Fetch a commit diff between two commits.
 */
function fetchCommitDiff(ref, token) {
  const { owner, repo, base, head } = ref;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/compare/${base}...${head}`,
      headers: {
        'User-Agent': 'coderev-github-app',
        'Accept': 'application/vnd.github.v3.diff',
        'Authorization': `Bearer ${token}`,
      },
    };

    https.get(options, (res) => {
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
        } else {
          reject(new Error(`GitHub API returned status ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Find open PRs for a given branch.
 */
function findOpenPRsForBranch(token, ref, branchName) {
  const { owner, repo } = ref;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branchName)}`,
      headers: {
        'User-Agent': 'coderev-github-app',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
      },
    };

    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const prs = JSON.parse(body);
            resolve(prs.map(p => ({ number: p.number, title: p.title, id: p.id })));
          } catch {
            reject(new Error('Failed to parse PR list'));
          }
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Format incremental PR comment markdown.
 */
function formatIncrementalPRMarkdown(result, ref, commitSha, branchName) {
  const TAG = `<!-- coderev:incremental:${ref.owner}/${ref.repo}#${ref.pr}@${commitSha} -->`;
  let md = `## 📋 coderev Incremental Review

${TAG}
`;
  md += `**Commit:** \`${commitSha.slice(0, 8)}\` (${branchName})
`;
  md += `**Score:** ${result.score}/100
`;
  md += `**Issues found:** ${(result.issues || []).length}

`;

  if (result.summary) md += `${result.summary}

`;

  if (result.issues && result.issues.length > 0) {
    md += '### Issues (Incremental)

';
    for (const issue of result.issues.slice(0, 10)) {
      const icons = { error: '🔴', warning: '🟡', info: '🔵' };
      md += `- ${icons[issue.type] || '⚪'} **${issue.type.toUpperCase()}**`;
      if (issue.severity) md += ` [${issue.severity}]`;
      md += `: ${issue.message}`;
      if (issue.file) md += ` (\`${issue.file}\``;
      if (issue.line) md += `:${issue.line}`;
      if (issue.file) md += `)`;
      md += '
';
      if (issue.suggestion) md += `  - 💡 ${issue.suggestion}
`;
    }
    if (result.issues.length > 10) {
      md += `
  ... and ${result.issues.length - 10} more issues
`;
    }
  }

  const scoreVal = result.score;
  const emoji = scoreVal >= 80 ? '🟢' : scoreVal >= 50 ? '🟡' : '🔴';
  md += `
${emoji} **Incremental Score:** ${result.score}/100
`;

  return md;
}

/**
 * Set a commit status on GitHub (ref without pr property).
 */
async function setCommitStatus(token, ref, sha, state, description) {
  const body = {
    state, // 'pending', 'success', 'failure', 'error', 'neutral'
    description: description || 'coderev review',
    context: 'coderev/review',
    target_url: ref.pr ? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.pr}` : `https://github.com/${ref.owner}/${ref.repo}`,
  };
  return githubApi(`/repos/${ref.owner}/${ref.repo}/statuses/${sha}`, token, 'POST', body);
}

/**
 * Post a PR comment on GitHub.
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
        'User-Agent': 'coderev-github-app',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let rb = '';
      res.on('data', (c) => (rb += c));
      res.on('end', () => {
        if (res.statusCode === 201) {
          try { resolve(JSON.parse(rb)); } catch { resolve(rb); }
        } else {
          reject(new Error(`Failed to post comment (${res.statusCode}): ${rb.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}


/**
 * Set a commit status on GitHub.
 */
async function setCommitStatus(token, ref, sha, state, description) {
  const body = {
    state, // 'pending', 'success', 'failure', 'error', 'neutral'
    description: description || 'coderev review',
    context: 'coderev/review',
    target_url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.pr}`,
  };
  return githubApi(`/repos/${ref.owner}/${ref.repo}/statuses/${sha}`, token, 'POST', body);
}

/**
 * Approve a pull request.
 */
async function approvePR(token, ref, sha) {
  const body = {
    commit_id: sha,
    event: 'APPROVE',
    body: '✅ coderev: no issues found. Auto-approved.',
  };
  return githubApi(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.pr}/reviews`, token, 'POST', body);
}

/**
 * Post inline review comments.
 */
async function postInlineReview(token, ref, pr, result) {
  const { fetchPrFiles } = require('./github');
  const prFiles = await fetchPrFiles(ref, token);

  const fileMap = {};
  for (const f of prFiles) fileMap[f.filename] = f;

  const comments = [];
  for (const issue of result.issues || []) {
    if (!issue.file) continue;
    if (!fileMap[issue.file]) continue;
    comments.push({
      path: issue.file,
      line: issue.line || 1,
      side: 'RIGHT',
      body: `**${issue.type.toUpperCase()}** [${issue.severity}]: ${issue.message}${issue.suggestion ? '\n\n> 💡 ' + issue.suggestion : ''}`,
    });
    if (comments.length >= 50) break; // GitHub limit
  }

  const body = {
    commit_id: pr.head.sha,
    event: 'COMMENT',
    body: `## 📋 coderev review\n\n**Score: ${result.score}/100** | ${(result.issues || []).length} issues found\n\n${result.summary || ''}`,
    comments,
  };

  return githubApi(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.pr}/reviews`, token, 'POST', body);
}

// ── Webhook Server ──────────────────────────────────────────

/**
 * Start the GitHub App webhook server.
 */
function startServer(appConfig) {
  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: require('../package.json').version, uptime: process.uptime() }));
      return;
    }

    // Only accept POST /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Read payload
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const rawBody = Buffer.concat(buffers);

    // Verify signature
    const signature = req.headers['x-hub-signature-256'] || '';
    if (!verifySignature(rawBody, signature, appConfig.webhookSecret)) {
      console.error(chalk.red('✖ Invalid webhook signature'));
      res.writeHead(401);
      res.end('Invalid signature');
      return;
    }

    const event = req.headers['x-github-event'];
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    // Ack immediately
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));

    // Handle PR events
    if (event === 'pull_request') {
      try {
        const result = await handlePREvent(event, payload, appConfig);
        console.error(chalk.green(`✔ ${payload.repository?.full_name || '?'}#${payload.pull_request?.number || '?'}: ${result.handled ? 'Reviewed' : 'Skipped (' + result.reason + ')'}`));
      } catch (err) {
        console.error(chalk.red(`✖ Webhook handler error: ${err.message}`));
      }
    } else if (event === 'push') {
      try {
        const result = await handlePushEvent(event, payload, appConfig);
        console.error(chalk.green(`✔ ${payload.repository?.full_name || '?'}@${payload.after?.slice(0, 8) || '?'}: ${result.handled ? 'Reviewed' : 'Skipped (' + result.reason + ')'}`));
      } catch (err) {
        console.error(chalk.red(`✖ Webhook handler error: ${err.message}`));
      }
    } else if (event === 'installation' || event === 'installation_repositories') {
      const action = payload.action;
      const account = payload.installation?.account?.login || payload.sender?.login || 'unknown';
      const repos = (payload.repositories || []).map(r => r.full_name).join(', ') || 'N/A';
      console.error(chalk.cyan(`📦 Installation ${action}: ${account} — ${repos}`));
    } else {
      console.error(chalk.gray(`ℹ Ignored event: ${event}`));
    }
  });

  server.listen(appConfig.port, appConfig.host, () => {
    console.error(chalk.bold.green('\n🚀 coderev GitHub App Server'));
    console.error(chalk.gray('━').repeat(50));
    console.error(chalk.cyan(`  Webhook URL: http://${appConfig.host}:${appConfig.port}/webhook`));
    console.error(chalk.cyan(`  Health:      http://${appConfig.host}:${appConfig.port}/health`));
    console.error(chalk.cyan(`  App ID:      ${appConfig.appId || '(not set)'}`));
    console.error(chalk.cyan(`  Review mode: ${appConfig.reviewMode}`));
    console.error(chalk.cyan(`  Auto-approve: ${appConfig.autoApprove ? 'yes' : 'no'}`));
    console.error(chalk.gray('━').repeat(50));
    console.error(chalk.gray('  Listening...'));
  });

  return server;
}

// ── Markdown 格式化（App 版本） ─────────────────────────────

function formatAppMarkdown(result, ref) {
  const TAG = `<!-- coderev:${ref.owner}/${ref.repo}#${ref.pr} -->`;
  let md = `## 📋 coderev review\n\n${TAG}\n`;
  md += `**Score:** ${result.score}/100\n`;
  md += `**Issues found:** ${(result.issues || []).length}\n\n`;

  if (result.summary) md += `${result.summary}\n\n`;

  if (result.issues && result.issues.length > 0) {
    md += '### Issues\n\n';
    for (const issue of result.issues) {
      const icons = { error: '🔴', warning: '🟡', info: '🔵' };
      md += `- ${icons[issue.type] || '⚪'} **${issue.type.toUpperCase()}**`;
      if (issue.severity) md += ` [${issue.severity}]`;
      md += `: ${issue.message}`;
      if (issue.file) md += ` (\`${issue.file}\``;
      if (issue.line) md += `:${issue.line}`;
      if (issue.file) md += `)`;
      md += '\n';
      if (issue.suggestion) md += `  - 💡 ${issue.suggestion}\n`;
    }
  }

  if (result.praise && result.praise.length > 0) {
    md += '\n### ✅ Good Practices\n\n';
    for (const p of result.praise) md += `- ${p}\n`;
  }

  if (result.score !== undefined) {
    const scoreVal = result.score;
    const emoji = scoreVal >= 80 ? '🟢' : scoreVal >= 50 ? '🟡' : '🔴';
    md += `\n${emoji} **Overall Score:** ${result.score}/100\n`;
  }

  return md;
}

// ── CLI 入口 ────────────────────────────────────────────────

/**
 * Parse CLI args and start the server.
 * Called from cli.js 'serve' command.
 */
async function serveCommand(options) {
  const config = loadConfig();
  const appConfig = loadAppConfig();

  // CLI overrides
  if (options.port) appConfig.port = parseInt(options.port, 10);
  if (options.webhookSecret) appConfig.webhookSecret = options.webhookSecret;
  if (options.appId) appConfig.appId = options.appId;
  if (options.privateKey) appConfig.privateKey = options.privateKey;
  if (options.reviewMode) appConfig.reviewMode = options.reviewMode;
  if (options.autoApprove !== undefined) appConfig.autoApprove = options.autoApprove;
  if (options.minConfidence) appConfig.minConfidence = parseInt(options.minConfidence, 10);

  // Validate required fields
  const missing = [];
  if (!appConfig.appId) missing.push('--app-id / GITHUB_APP_ID');
  if (!appConfig.privateKey) missing.push('--private-key / GITHUB_APP_PRIVATE_KEY');

  if (missing.length > 0) {
    console.error(chalk.red('✖ Missing required configuration:'));
    for (const m of missing) console.error(chalk.red(`   ${m}`));
    console.error('');
    console.error(chalk.yellow('To create a GitHub App:'));
    console.error(chalk.yellow('  1. Go to https://github.com/settings/apps/new'));
    console.error(chalk.yellow('  2. Set Webhook URL to your server URL + /webhook'));
    console.error(chalk.yellow('  3. Subscribe to "Pull requests" event'));
    console.error(chalk.yellow('  4. Download the private key (.pem file)'));
    console.error(chalk.yellow('  5. Run:'));
    console.error(chalk.yellow('     coderev serve --app-id <ID> --private-key "$(cat key.pem)"'));
    console.error('');
    process.exit(1);
  }

  return startServer(appConfig);
}

module.exports = { serveCommand, handlePREvent, handlePushEvent, generateAppJWT, getInstallationToken, formatAppMarkdown, formatIncrementalPRMarkdown, fetchCommitDiff, findOpenPRsForBranch };


// Required for inline require('https') in functions
const https = require('https');
