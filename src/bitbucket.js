const https = require('https');

/**
 * Parse a Bitbucket PR reference.
 * Supported formats:
 *   - owner/repo#42
 *   - https://bitbucket.org/owner/repo/pull-requests/42
 *   - 42 (requires --repo with git remote)
 */
function parsePrRef(ref) {
  const shorthand = ref.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2], pr: parseInt(shorthand[3], 10), workspace: shorthand[1] };
  }

  const fullUrl = ref.match(/bitbucket\.org\/([\w.-]+)\/([\w.-]+)\/pull-requests\/(\d+)/);
  if (fullUrl) {
    return { workspace: fullUrl[1], owner: fullUrl[1], repo: fullUrl[2], pr: parseInt(fullUrl[3], 10) };
  }

  const justNumber = ref.match(/^(\d+)$/);
  if (justNumber) return { owner: null, repo: null, pr: parseInt(justNumber[1], 10) };

  throw new Error(
    `Invalid Bitbucket PR reference: "${ref}". Use:\n` +
    `  coderev review --bb owner/repo#42\n` +
    `  coderev review --bb https://bitbucket.org/owner/repo/pull-requests/42`
  );
}

function resolvePrRef(ref, repoPath) {
  const parsed = parsePrRef(ref);
  if (parsed.owner && parsed.repo) return parsed;

  try {
    const { execSync } = require('child_process');
    const remote = execSync('git config --get remote.origin.url', {
      cwd: repoPath || process.cwd(), encoding: 'utf-8', timeout: 5000,
    }).trim();
    const match = remote.match(/bitbucket\.org[\/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (match) return { workspace: match[1], owner: match[1], repo: match[2], pr: parsed.pr };
  } catch {}
  throw new Error(`Could not detect Bitbucket repo. Use full format like owner/repo#${parsed.pr}.`);
}

/**
 * Fetch a pull request diff from Bitbucket Cloud.
 * Bitbucket API 2.0: GET /2.0/repositories/{workspace}/{repo}/pullrequests/{number}
 */
function fetchPrDiff(ref, token) {
  const { workspace, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const username = process.env.BITBUCKET_USERNAME || '';
    const headers = { 'User-Agent': 'coderev-agent', 'Accept': 'application/json' };

    let auth = '';
    if (token && username) {
      const encoded = Buffer.from(username + ':' + token).toString('base64');
      headers['Authorization'] = 'Basic ' + encoded;
    }

    https.get({
      hostname: 'api.bitbucket.org',
      path: `/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pullrequests/${pr}`,
      headers,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const prData = JSON.parse(body);
            // Bitbucket doesn't give diff directly, get it from links
            const diffUrl = prData.links?.diff?.href;
            if (diffUrl) {
              https.get(diffUrl, { headers }, (res2) => {
                let d = ''; res2.on('data', (c) => (d += c));
                res2.on('end', () => resolve(d));
              }).on('error', reject);
            } else {
              reject(new Error('Could not find diff URL in Bitbucket response'));
            }
          } catch { reject(new Error('Failed to parse Bitbucket response')); }
        } else if (res.statusCode === 404) {
          reject(new Error(`PR not found: ${workspace}/${repo}#${pr}`));
        } else {
          reject(new Error(`Bitbucket API error (${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Post a comment on a Bitbucket PR.
 * API: POST /2.0/repositories/{workspace}/{repo}/pullrequests/{number}/comments
 */
function postPrComment(ref, body, token) {
  const { workspace, repo, pr } = ref;
  return new Promise((resolve, reject) => {
    const username = process.env.BITBUCKET_USERNAME || '';
    const postData = JSON.stringify({ content: { raw: body } });
    const headers = {
      'User-Agent': 'coderev-agent',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };
    if (token && username) {
      headers['Authorization'] = 'Basic ' + Buffer.from(username + ':' + token).toString('base64');
    }

    const options = {
      hostname: 'api.bitbucket.org',
      path: `/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pullrequests/${pr}/comments`,
      method: 'POST',
      headers,
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

module.exports = { parsePrRef, resolvePrRef, fetchPrDiff, postPrComment };
