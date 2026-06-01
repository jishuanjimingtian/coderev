const https = require('https');
const URL = require('url');

/**
 * Parse a GitLab MR reference.
 * Supported formats:
 *   - owner/repo!42
 *   - https://gitlab.com/owner/repo/-/merge_requests/42
 *   - https://gitlab.example.com/owner/repo/-/merge_requests/42
 *   - 42 (requires --repo with git remote)
 */
function parseMrRef(ref) {
  // owner/repo!42
  const shorthand = ref.match(/^([\w.-]+)\/([\w.-]+)!(\d+)$/);
  if (shorthand) {
    return { host: 'gitlab.com', owner: shorthand[1], repo: shorthand[2], mr: parseInt(shorthand[3], 10), protocol: 'https:' };
  }

  // Full GitLab URL
  const fullUrl = ref.match(/^(https?:\/\/[\w.-]+)\/([\w.-]+)\/([\w.-]+)\/-\/merge_requests\/(\d+)/);
  if (fullUrl) {
    return { host: fullUrl[1].replace(/^https?:\/\//, ''), owner: fullUrl[2], repo: fullUrl[3], mr: parseInt(fullUrl[4], 10), protocol: fullUrl[1].startsWith('https') ? 'https:' : 'http:' };
  }

  // Just a number: try to detect from git remote
  const justNumber = ref.match(/^(\d+)$/);
  if (justNumber) {
    return { host: null, owner: null, repo: null, mr: parseInt(justNumber[1], 10) };
  }

  throw new Error(
    `Invalid MR reference: "${ref}". Use formats like:\n` +
    `  coderev review --gl owner/repo!42\n` +
    `  coderev review --gl https://gitlab.com/owner/repo/-/merge_requests/42`
  );
}

/**
 * Resolve MR ref, detecting host/owner/repo from git remote if needed.
 */
function resolveMrRef(ref, repoPath) {
  const parsed = parseMrRef(ref);

  if (parsed.host && parsed.owner && parsed.repo) {
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

    const gitlabMatch = remote.match(/git@([\w.-]+):([\w.-]+)\/([\w.-]+?)(?:\.git)?$/) ||
                        remote.match(/https?:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (gitlabMatch) {
      const protocol = remote.startsWith('https') ? 'https:' : 'http:';
      return { host: gitlabMatch[1], owner: gitlabMatch[2], repo: gitlabMatch[3], mr: parsed.mr, protocol };
    }
  } catch {}

  throw new Error(
    `Could not detect GitLab repo. Use full format like owner/repo!${parsed.mr}.`
  );
}

/**
 * Fetch a merge request diff from GitLab.
 */
function fetchMrDiff(ref, token) {
  const { host, owner, repo, mr, protocol } = ref;
  const apiHost = host === 'gitlab.com' ? 'gitlab.com' : host;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: apiHost,
      path: `/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/merge_requests/${mr}`,
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'text/plain, application/json',
      },
    };

    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    https.get({ hostname: apiHost, path: options.path + '.diff', headers: options.headers, protocol: protocol || 'https:' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else if (res.statusCode === 404) {
          reject(new Error(`MR not found: ${owner}/${repo}!${mr}. Use --gitlab-token for private repos.`));
        } else {
          reject(new Error(`GitLab API error (${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Post a comment on a GitLab MR.
 */
function postMrComment(ref, body, token) {
  const { host, owner, repo, mr, protocol } = ref;
  const apiHost = host === 'gitlab.com' ? 'gitlab.com' : host;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body });

    const options = {
      hostname: apiHost,
      path: `/api/v4/projects/${encodeURIComponent(owner + '/' + repo)}/merge_requests/${mr}/notes`,
      method: 'POST',
      headers: {
        'User-Agent': 'coderev-agent',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(Object.assign({}, options, { protocol: protocol || 'https:' }), (res) => {
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

module.exports = { parseMrRef, resolveMrRef, fetchMrDiff, postMrComment };
