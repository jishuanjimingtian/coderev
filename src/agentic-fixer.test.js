/**
 * Tests for agentic-fixer.js — Agentic fix loop
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  parsePatchFiles,
  extractFileHunks,
  mergeDiffPatches,
  buildSummary,
} = require('./agentic-fixer');

// ── parsePatchFiles ──

describe('parsePatchFiles', () => {
  it('parses a simple single-file patch', () => {
    const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -5,3 +5,4 @@
 const x = 1;
+const y = 2;
 return x;
`;
    const files = parsePatchFiles(patch);
    assert.strictEqual(files.size, 1);
    assert.ok(files.has('src/app.js'));
    const hunks = files.get('src/app.js');
    assert.strictEqual(hunks.length, 1);
    assert.ok(hunks[0].header.includes('@@'));
  });

  it('parses a multi-file patch', () => {
    const patch = `--- a/src/a.js
+++ b/src/a.js
@@ -1,1 +1,2 @@
+const a = 1;
--- a/src/b.js
+++ b/src/b.js
@@ -3,2 +3,3 @@
+const b = 2;
 return b;
`;
    const files = parsePatchFiles(patch);
    assert.strictEqual(files.size, 2);
    assert.ok(files.has('src/a.js'));
    assert.ok(files.has('src/b.js'));
  });

  it('handles file paths without a/ and b/ prefix', () => {
    const patch = `--- src/app.js
+++ src/app.js
@@ -1,1 +1,2 @@
+foo
`;
    const files = parsePatchFiles(patch);
    assert.ok(files.has('src/app.js'));
  });

  it('parses multiple hunks in a single file', () => {
    const patch = `--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,4 @@
+const a = 1;
 const b = 2;
@@ -10,2 +11,3 @@
+const c = 3;
 return c;
`;
    const files = parsePatchFiles(patch);
    const hunks = files.get('src/app.js');
    assert.strictEqual(hunks.length, 2);
  });

  it('returns empty map for non-patch input', () => {
    const files = parsePatchFiles('just some text\nnot a patch');
    assert.strictEqual(files.size, 0);
  });

  it('returns empty map for empty/blank input', () => {
    assert.strictEqual(parsePatchFiles('').size, 0);
    assert.strictEqual(parsePatchFiles('   ').size, 0);
    assert.strictEqual(parsePatchFiles(null).size, 0);
  });

  it('handles patch with /dev/null (new file)', () => {
    const patch = `--- /dev/null
+++ b/src/new.js
@@ -0,0 +1,3 @@
+const hello = 'world';
+console.log(hello);
`;
    const files = parsePatchFiles(patch);
    assert.ok(files.has('src/new.js'));
  });
});

// ── extractFileHunks ──

describe('extractFileHunks', () => {
  it('extracts hunks for a target file', () => {
    const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 return x;
diff --git a/src/other.js b/src/other.js
--- a/src/other.js
+++ b/src/other.js
@@ -5,2 +5,3 @@
+const z = 3;
`;
    const hunks = extractFileHunks(diff, 'src/app.js');
    assert.strictEqual(hunks.length, 1);
    assert.ok(hunks[0].lines.some(l => l.includes('+const y')));
  });

  it('does not extract hunks from other files', () => {
    const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,1 +1,2 @@
+a
diff --git a/src/b.js b/src/b.js
--- a/src/b.js
+++ b/src/b.js
@@ -2,1 +2,2 @@
+b
`;
    const hunks = extractFileHunks(diff, 'src/a.js');
    assert.strictEqual(hunks.length, 1);
    const lines = hunks[0].lines.join('');
    assert.ok(lines.includes('+a'));
    assert.ok(!lines.includes('+b'));
  });

  it('returns empty for non-existent file', () => {
    const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,1 +1,2 @@
+a
`;
    const hunks = extractFileHunks(diff, 'src/nonexistent.js');
    assert.strictEqual(hunks.length, 0);
  });

  it('returns empty for empty diff', () => {
    assert.strictEqual(extractFileHunks('', 'a.js').length, 0);
  });
});

// ── mergeDiffPatches ──

describe('mergeDiffPatches', () => {
  it('returns original diff when fix patch is empty', () => {
    const original = '--- a/a.js\n+++ b/a.js\n@@ -1,1 +1,2 @@\n foo';
    assert.strictEqual(mergeDiffPatches(original, ''), original);
    assert.strictEqual(mergeDiffPatches(original, null), original);
    assert.strictEqual(mergeDiffPatches(original, '   '), original);
  });

  it('appends fix patch when files cannot be matched', () => {
    const original = 'just some text';
    const fix = '--- a/a.js\n+++ b/a.js\n@@ -1,1 +1,2 @@\n+fix';
    const result = mergeDiffPatches(original, fix);
    assert.ok(result.includes('just some text'));
    assert.ok(result.includes('fix'));
  });

  it('merges fix hunks into existing diff', () => {
    const original = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 return x;
`;
    const fix = `--- a/src/app.js
+++ b/src/app.js
@@ -2,1 +2,2 @@
+const z = 3;
 return x;
`;
    const result = mergeDiffPatches(original, fix);
    assert.ok(result.includes('const y = 2'));
    assert.ok(result.includes('const z = 3'));
  });
});

// ── buildSummary ──

describe('buildSummary', () => {
  it('shows all fixed count when all succeeded', () => {
    const attempts = [
      { success: true, issue: { type: 'error', message: 'SQL injection' }, rounds: 2 },
      { success: true, issue: { type: 'warning', message: 'Unused var' }, rounds: 1 },
    ];
    const summary = buildSummary(attempts, 2, 0, 2);
    assert.ok(summary.includes('✅ Fixed: 2'));
    assert.ok(summary.includes('All issues fixed'));
  });

  it('shows failed count when some failed', () => {
    const attempts = [
      { success: true, issue: { type: 'error', message: 'Fixable issue' }, rounds: 2 },
      { success: false, issue: { type: 'error', message: 'Complex issue needing human' }, reason: 'Cannot auto-fix', rounds: 3 },
    ];
    const summary = buildSummary(attempts, 1, 1, 2);
    assert.ok(summary.includes('✅ Fixed: 1'));
    assert.ok(summary.includes('❌ Failed: 1'));
    assert.ok(summary.includes('1/2 fixed'));
  });

  it('handles zero issues', () => {
    const summary = buildSummary([], 0, 0, 0);
    assert.ok(summary.includes('Total issues: 0'));
  });

  it('shows rounds info', () => {
    const attempts = [
      { success: true, issue: { type: 'error', message: 'Bug' }, rounds: 3 },
    ];
    const summary = buildSummary(attempts, 1, 0, 1);
    assert.ok(summary.includes('3 rounds'));
  });
});
