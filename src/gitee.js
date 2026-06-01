const https = require('https');

/**
 * Parse a Gitee PR reference.
 * Supported formats:
 *   - owner/repo!42
 *   - https://gitee.com/owner/repo/pulls/42
 *   - 42 (requires --repo with git remote)
 */
function parsePrRef(ref) {
  // owner/repo!42
  const shorthand = ref.match(/^([\w.-]+)\/([\w.-]+)!(\d+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2], pr: parseInt(shorthand[3], 10) };
  }

  // Full Gitee URL
  const fullUrl = ref.match(/gitee\.com\/([\w.-]+)\/([\w.-]+)\/pulls\/(\d+)/);
  if (fullUrl) {
    return { owner: fullUrl[1], repo: fullUrl[2], pr: parseInt(fullUrl[3], 10) };
  }

  // Just a number
  const justNumber = ref.match(/^(\d+)$/);
  if (justNumber) {
    return { owner: null, repo: null, pr: parseInt(justNumber[1], 10) };
  }

  throw new Error(
    `Invalid Gitee PR reference: "${ref}". Use formats like:\n` +
    `  coderev review --gee owner/repo!42\n` +
    `  coderev review --gee https://gitee.com/owner/repo/pulls/42`
  );
}

/**
 * Resolve PR ref, detecting owner/repo from git remote if needed.
 */
function resolvePrRef(ref, repoPath) {
  const parsed = parsePrRef(ref);

  if (parsed.owner && parsed.repo) {
    return parsed;
  }

  // Try git remote
  try {
    const { execSync } = require('child_process');
    const remote = execSync('git config --get remote.origin.url', {
      cwd: repoPath || process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const giteeMatch = remote.match(/gitee\.com[\/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (giteeMatch) {
      return { owner: giteeMatch[1], repo: giteeMatch[2], pr: parsed.pr };
    }
  } catch {}

  throw new Error(
    `Could not detect Gitee repo. Use full format like owner/repo!${parsed.pr}.`
  );
}

/**
 * Fetch a pull request diff from Gitee.
 * Gitee API v5: https://gitee.com/api/v5/repos/{owner}/{repo}/pulls/{number}
 * Use ?access_token= for auth.
 */
function fetchPrDiff(ref, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    let path = `/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pr}.diff`;
    if (token) path += '?access_token=' + token;

    const options = {
      hostname: 'gitee.com',
      path: path,
      headers: {
        'User-Agent': 'coderev-agent',
      },
    };

    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else if (res.statusCode === 404) {
          reject(new Error(`PR not found: ${owner}/${repo}!${pr}. Use --gee-token for private repos.`));
        } else {
          reject(new Error(`Gitee API error (${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Post a comment on a Gitee PR.
 * Gitee API: POST /api/v5/repos/{owner}/{repo}/pulls/{number}/comments
 */
function postPrComment(ref, body, token) {
  const { owner, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body, access_token: token });

    const options = {
      hostname: 'gitee.com',
      path: `/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pr}/comments`,
      method: 'POST',
      headers: {
        'User-Agent': 'coderev-agent',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let rb = '';
      res.on('data', (c) => (rb += c));
      res.on('end', () => {
        if (res.statusCode === 201) {
          try { resolve(JSON.parse(rb)); }
          catch { resolve(rb); }
        } else {
          reject(new Error(`Failed to post comment (${res.statusCode}): ${rb.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = { parsePrRef, resolvePrRef, fetchPrDiff, postPrComment };
