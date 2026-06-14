/**
 * Tests for issue-validator.js
 *
 * Covers:
 *   - parseIssueRef (GitHub/GitLab URLs, shorthands)
 *   - extractIssueKeywords
 *   - validateIssueAgainstDiff
 *   - findRelatedIssues
 *   - formatIssueReport
 *   - validateIssue (integration)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('issue-validator.js', () => {
  const {
    parseIssueRef,
    extractIssueKeywords,
    validateIssueAgainstDiff,
    findRelatedIssues,
    generateIssueReport,
    formatIssueReport,
    parseCommitLog,
  } = require('./issue-validator');

  describe('parseIssueRef', () => {
    it('should parse full GitHub issue URL', () => {
      const ref = parseIssueRef('https://github.com/facebook/react/issues/42');
      assert.equal(ref.platform, 'github');
      assert.equal(ref.owner, 'facebook');
      assert.equal(ref.repo, 'react');
      assert.equal(ref.issueNumber, 42);
    });

    it('should parse GitHub shorthand owner/repo#42', () => {
      const ref = parseIssueRef('facebook/react#42');
      assert.equal(ref.platform, 'github');
      assert.equal(ref.owner, 'facebook');
      assert.equal(ref.repo, 'react');
      assert.equal(ref.issueNumber, 42);
    });

    it('should parse bare issue number #42', () => {
      const ref = parseIssueRef('#42');
      assert.equal(ref.platform, 'github');
      assert.equal(ref.issueNumber, 42);
      assert.equal(ref.owner, null);
    });

    it('should parse bare number 42', () => {
      const ref = parseIssueRef('42');
      assert.equal(ref.platform, 'github');
      assert.equal(ref.issueNumber, 42);
    });

    it('should parse GitLab issue URL', () => {
      const ref = parseIssueRef('https://gitlab.com/gitlab-org/gitlab/-/issues/999');
      assert.equal(ref.platform, 'gitlab');
      assert.equal(ref.owner, 'gitlab-org');
      assert.equal(ref.repo, 'gitlab');
      assert.equal(ref.issueNumber, 999);
    });

    it('should parse GitLab shorthand owner/repo!42', () => {
      const ref = parseIssueRef('gitlab-org/gitlab!42');
      assert.equal(ref.platform, 'gitlab');
      assert.equal(ref.owner, 'gitlab-org');
      assert.equal(ref.repo, 'gitlab');
      assert.equal(ref.issueNumber, 42);
    });

    it('should return null for unparseable input', () => {
      assert.equal(parseIssueRef('not-an-issue'), null);
      assert.equal(parseIssueRef(''), null);
      assert.equal(parseIssueRef('https://example.com'), null);
    });

    it('should parse GitHub URL with .git in repo name', () => {
      const ref = parseIssueRef('https://github.com/owner/repo.git/issues/42');
      assert.equal(ref.repo, 'repo');
    });

    it('should parse GitHub shorthand with hyphen in name', () => {
      const ref = parseIssueRef('my-org/my-repo#123');
      assert.equal(ref.owner, 'my-org');
      assert.equal(ref.repo, 'my-repo');
      assert.equal(ref.issueNumber, 123);
    });

    it('should store original URL in ref', () => {
      const url = 'https://github.com/owner/repo/issues/42';
      const ref = parseIssueRef(url);
      assert.equal(ref.url, url);
    });
  });

  describe('extractIssueKeywords', () => {
    it('should extract file paths from issue body', () => {
      const issue = {
        title: 'Fix login bug',
        body: 'The `src/auth/login.js` file has a typo. Also check `src/utils/helper.ts`.',
      };
      const keywords = extractIssueKeywords(issue);
      assert.ok(keywords.includes('src/auth/login.js'));
      assert.ok(keywords.includes('src/utils/helper.ts'));
    });

    it('should extract function names', () => {
      const issue = {
        title: 'Refactor handleLogin',
        body: 'Need to fix authenticate() and validateInput() functions.',
      };
      const keywords = extractIssueKeywords(issue);
      // Function names are lowercased: authenticate, validateinput, handlelogin
      assert.ok(keywords.some(k => k.includes('authenticate')));
      assert.ok(keywords.some(k => k.includes('validateinput')));
    });

    it('should extract technical keywords', () => {
      const issue = {
        title: 'Add rate limiting to API',
        body: 'We need rate limiting on the auth endpoint to prevent abuse.',
      };
      const keywords = extractIssueKeywords(issue);
      assert.ok(keywords.includes('auth'));
      assert.ok(keywords.includes('api'));
      assert.ok(keywords.includes('endpoint'));
    });

    it('should extract keywords from title and body combined', () => {
      const issue = {
        title: 'Fix database connection pool',
        body: 'The database connections are not being released properly. Need to add cache layer.',
      };
      const keywords = extractIssueKeywords(issue);
      assert.ok(keywords.includes('database'));
      assert.ok(keywords.includes('cache'));
    });

    it('should handle empty body', () => {
      const issue = { title: 'Update README', body: '' };
      const keywords = extractIssueKeywords(issue);
      // README is not a tech term, so keywords should be minimal
      assert.ok(Array.isArray(keywords));
    });

    it('should handle emojis and special chars', () => {
      const issue = {
        title: '🐛 Fix login crash',
        body: 'The login page crashes. Need to fix the authentication flow.',
      };
      const keywords = extractIssueKeywords(issue);
      assert.ok(keywords.includes('auth'));
    });
  });

  describe('validateIssueAgainstDiff', () => {
    it('should detect fully-addressed when keywords match diff', () => {
      const issue = {
        title: 'Fix login handler',
        body: 'The `src/auth/login.js` needs to handle error cases and auth properly.',
      };
      const diff = `
diff --git a/src/auth/login.js b/src/auth/login.js
+ function login(req, res) {
+   try {
+     authenticate(req.body);
+   } catch (err) {
+     handleError(err);
+   }
+ }
+ function handleError(err) {
+   res.status(500).json({ error: err.message });
+ }
`;
      const result = validateIssueAgainstDiff(issue, diff);
      // Should be fully-addressed since all keywords are in diff
      assert.ok(result.overallRelevance >= 65);
      assert.ok(result.matchedKeywords.length > 0);
    });

    it('should detect partially-addressed when some keywords match', () => {
      const issue = {
        title: 'Add login, signup, and password reset pages',
        body: 'We need `signup.js`, `login.js`, and `reset-password.js`.',
      };
      const diff = `
diff --git a/src/auth/login.js b/src/auth/login.js
+ export function login() {}
`;
      const result = validateIssueAgainstDiff(issue, diff);
      // Only login.js matched — should be partial
      assert.ok(result.overallRelevance < 70);
      assert.ok(result.unmatchedKeywords.length > 0);
    });

    it('should detect unaddressed when no keywords match', () => {
      const issue = {
        title: 'Fix payment gateway integration',
        body: 'The Stripe payment integration is broken. Need to fix billing service.',
      };
      const diff = `
diff --git a/src/homepage.js b/src/homepage.js
+ function renderHomepage() {}
`;
      const result = validateIssueAgainstDiff(issue, diff);
      assert.equal(result.verdict, 'unaddressed');
      assert.ok(result.overallRelevance < 30);
    });

    it('should return unknown when no keywords extracted', () => {
      const issue = { title: 'Foo', body: 'Bar' };
      const diff = 'some random diff';
      const result = validateIssueAgainstDiff(issue, diff);
      assert.equal(result.verdict, 'unknown');
    });

    it('should track matched and unmatched keywords', () => {
      const issue = {
        title: 'Fix API handler',
        body: 'The API handler in api.js needs error handling and caching.',
      };
      const diff = `
diff --git a/src/api.js b/src/api.js
+ export async function handler(req, res) {
+   try {
+     const result = await getData();
+     res.json(result);
+   } catch (err) {
+     // error handling
+   }
+ }
`;
      const result = validateIssueAgainstDiff(issue, diff);
      assert.ok(result.matchedKeywords.includes('api'));
      assert.ok(result.matchedKeywords.includes('error'));
      assert.ok(result.matchedFiles.includes('api.js'));
    });

    it('should be case-insensitive for keyword matching', () => {
      const issue = {
        title: 'Fix AUTH bug',
        body: 'Need to fix Authentication.',
      };
      const diff = 'fixed auth issue';
      const result = validateIssueAgainstDiff(issue, diff);
      assert.ok(result.matchedKeywords.includes('auth'));
    });
  });

  describe('findRelatedIssues', () => {
    it('should find GitHub issue references in commit log', () => {
      const commitLog = `
        abc1234 fix: resolve login timeout issue (fixes #42)
        def5678 refactor: update build config, ref #43
        ghi9012 docs: closes #44 and resolves #45
      `;
      const related = findRelatedIssues('', commitLog);
      assert.ok(related.includes('#42'));
      assert.ok(related.includes('#43'));
      assert.ok(related.includes('#44'));
      assert.ok(related.includes('#45'));
    });

    it('should find issue references in diff', () => {
      const diff = 'Fixes #100 and relates to #101. Also related to #102.';
      const related = findRelatedIssues(diff, '');
      assert.ok(related.includes('#100'));
      assert.ok(related.includes('#101'));
      assert.ok(related.includes('#102'));
    });

    it('should find references in both commit log and diff', () => {
      const commitLog = 'fixes #1';
      const diff = 'closes #2';
      const related = findRelatedIssues(diff, commitLog);
      assert.ok(related.includes('#1'));
      assert.ok(related.includes('#2'));
    });

    it('should handle GitLab style references', () => {
      const commitLog = 'closes !123 and fixes !456';
      const related = findRelatedIssues('', commitLog);
      assert.ok(related.includes('!123'));
      assert.ok(related.includes('!456'));
    });

    it('should deduplicate references', () => {
      const text = 'fixes #42 and fixes #42 and closes #42';
      const related = findRelatedIssues(text, '');
      const count42 = related.filter(r => r === '#42').length;
      assert.equal(count42, 1);
    });

    it('should return empty array when no references found', () => {
      assert.deepEqual(findRelatedIssues('', 'No references here'), []);
    });

    it('should handle various verb forms', () => {
      const text = 'fix #1 fixed #2 fixes #3 close #4 closed #5 closes #6 resolve #7 resolved #8 resolves #9';
      const related = findRelatedIssues(text, '');
      ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8', '#9'].forEach(r => {
        assert.ok(related.includes(r), `Expected ${r} to be found`);
      });
    });

    it('should match "see #123" and "related to #456" patterns', () => {
      const text = 'see #123, related to #456, reference #789';
      const related = findRelatedIssues(text, '');
      assert.ok(related.includes('#123'));
      assert.ok(related.includes('#456'));
      assert.ok(related.includes('#789'));
    });
  });

  describe('generateIssueReport', () => {
    it('should generate a structured report', () => {
      const issue = {
        number: 42,
        title: 'Fix login bug',
        url: 'https://github.com/owner/repo/issues/42',
        state: 'open',
        labels: ['bug', 'high-priority'],
        assignees: ['alice'],
        html_url: 'https://github.com/owner/repo/issues/42',
      };
      const validation = {
        verdict: 'fully-addressed',
        overallRelevance: 85,
        details: 'PR touches 3 mentioned files',
        matchedFiles: ['login.js'],
        matchedKeywords: ['auth', 'login'],
        unmatchedKeywords: [],
      };
      const reviewResult = { score: 90, issues: [] };
      const report = generateIssueReport(issue, validation, ['#43', '#44'], reviewResult);

      assert.equal(report.issue.number, 42);
      assert.equal(report.verdict, 'fully-addressed');
      assert.equal(report.validation.overallRelevance, 85);
      assert.deepEqual(report.relatedIssues, ['#43', '#44']);
      assert.equal(report.combinedScore, 90);
    });
  });

  describe('formatIssueReport', () => {
    it('should return a non-empty string', () => {
      const issue = {
        number: 1,
        title: 'Test issue',
        url: 'https://github.com/test/test/issues/1',
        state: 'open',
        labels: [],
        assignees: [],
      };
      const validation = {
        verdict: 'fully-addressed',
        overallRelevance: 100,
        details: 'All keywords matched',
        matchedFiles: ['test.js'],
        matchedKeywords: ['test'],
        unmatchedKeywords: [],
      };
      const report = generateIssueReport(issue, validation, [], null);
      const formatted = formatIssueReport(report);
      assert.ok(typeof formatted === 'string');
      assert.ok(formatted.length > 0);
      assert.ok(formatted.includes('Issue Validation'));
      assert.ok(formatted.includes('fully-addressed'));
    });

    it('should show unmatched keywords when present', () => {
      const issue = {
        number: 2,
        title: 'Partial fix',
        url: 'https://github.com/test/test/issues/2',
        state: 'open',
        labels: [],
        assignees: [],
      };
      const validation = {
        verdict: 'partially-addressed',
        overallRelevance: 40,
        details: 'Partially addressed',
        matchedFiles: [],
        matchedKeywords: ['api'],
        unmatchedKeywords: ['database', 'cache'],
      };
      const report = generateIssueReport(issue, validation, [], null);
      const formatted = formatIssueReport(report);
      assert.ok(formatted.includes('partially-addressed'));
      assert.ok(formatted.includes('database'));
      assert.ok(formatted.includes('cache'));
    });
  });

  describe('parseCommitLog', () => {
    it('should return empty string for non-git directory', () => {
      const log = parseCommitLog('/tmp/nonexistent-repo');
      assert.equal(log, '');
    });
  });
});
