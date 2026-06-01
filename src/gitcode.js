const https = require('https');

/**
 * Parse a GitCode MR reference.
 * Supported formats:
 *   - owner/repo!42
 *   - https://gitcode.com/owner/repo/merge_requests/42
 *   - 42 (requires --repo with git remote)
 */
function parseMrRef(ref) {
  const shorthand = ref.match(/^([\w.-]+)\/([\w.-]+)!(\d+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2], mr: parseInt(shorthand[3], 10) };
  }

  const fullUrl = ref.match(/gitcode\.com\/([\w.-]+)\/([\w.-]+)\/merge_requests\/(\d+)/);
  if (fullUrl) {
    return { owner: fullUrl[1], repo: fullUrl[2], mr: parseInt(fullUrl[3], 10) };
  }

  const justNumber = ref.match(/^(\d+)$/);
  if (justNumber) {
    return { owner: null, repo: null, mr: parseInt(justNumber[1], 10) };
  }

  throw new Error(
    `Invalid GitCode MR reference: "${ref}". Use:\n` +
    `  coderev review --gc owner/repo!42\n` +
    `  coderev review --gc https://gitcode.com/owner/repo/merge_requests/42`
  );
}

function resolveMrRef(ref, repoPath) {
  const parsed = parseMrRef(ref);
  if (parsed.owner && parsed.repo) return parsed;

  try {
    const { execSync } = require('child_process');
    const remote = execSync('git config --get remote.origin.url', {
      cwd: repoPath || process.cwd(), encoding: 'utf-8', timeout: 5000,
    }).trim();
    const match = remote.match(/gitcode\.com[\/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (match) return { owner: match[1], repo: match[2], mr: parsed.mr };
  } catch {}
  throw new Error(`Could not detect GitCode repo. Use full format like owner/repo!${parsed.mr}.`);
}

/**
 * Fetch a merge request diff from GitCode.
 * GitCode API: GET /api/v1/repos/{owner}/{repo}/merge_requests/{number}.diff
 */
function fetchMrDiff(ref, token) {
  const { owner, repo, mr } = ref;
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'coderev-agent' };
    let path = `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/merge_requests/${mr}.diff`;
    if (token) {
      path += '?access_token=' + token;
    }

    https.get({ hostname: 'gitcode.com', path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body);
        else if (res.statusCode === 404) reject(new Error(`MR not found: ${owner}/${repo}!${mr}`));
        else reject(new Error(`GitCode API error (${res.statusCode}): ${body.slice(0, 200)}`));
      });
    }).on('error', reject);
  });
}

/**
 * Post comment on GitCode MR.
 * GitCode API: POST /api/v1/repos/{owner}/{repo}/merge_requests/{number}/comments
 */
function postMrComment(ref, body, token) {
  const { owner, repo, mr } = ref;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body, access_token: token });
    const options = {
      hostname: 'gitcode.com',
      path: `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/merge_requests/${mr}/comments`,
      method: 'POST',
      headers: { 'User-Agent': 'coderev-agent', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };

    const req = https.request(options, (res) => {
      let rb = ''; res.on('data', (c) => (rb += c));
      res.on('end', () => {
        if (res.statusCode === 201) { try { resolve(JSON.parse(rb)); } catch { resolve(rb); } }
        else reject(new Error(`Failed to post comment (${res.statusCode}): ${rb.slice(0, 200)}`));
      });
    });
    req.on('error', reject); req.write(postData); req.end();
  });
}

module.exports = { parseMrRef, resolveMrRef, fetchMrDiff, postMrComment };
