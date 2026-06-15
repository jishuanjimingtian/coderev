/**
 * Agentic Fixer — Multi-turn fix loop: find → fix → verify → retry
 *
 * Inspired by Qodo Gen 1.5 Agentic Mode: plan-first → run tools → evaluate → retry.
 * coderev's --agentic flag upgrades from "find problems" to "solve problems".
 */

const { execSync } = require('child_process');
const { existsSync, writeFileSync, readFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { callAI } = require('./reviewer');

/**
 * @typedef {object} AgenticFixResult
 * @property {Array<object>} attempts - Each fix attempt record
 * @property {number} totalIssues - Number of issues attempted
 * @property {number} fixedCount - Issues successfully fixed (verified)
 * @property {number} failedCount - Issues that could not be fixed
 * @property {number} tokensUsed - Approximate token usage across calls
 * @property {string} summary - Human-readable summary
 * @property {string} [allPatches] - Concatenated patches (for output)
 */

/**
 * Run the agentic fix loop: for each high-confidence issue, generate a fix,
 * apply it, verify it passes lint/build/test, retry up to maxRounds if needed.
 *
 * @param {string} diff - Original git diff
 * @param {object} reviewResult - Result from reviewDiff (must have `issues`)
 * @param {string} apiKey - API key for AI calls
 * @param {object} config - coderev config
 * @param {object} [options]
 * @param {number} [options.maxRounds=3] - Max fix-and-verify rounds per issue
 * @param {string} [options.repoRoot] - Git repo root for running verify commands
 * @param {boolean} [options.autoApply=false] - Auto-apply successful patches to working dir
 * @param {Function} [options.onProgress] - Progress callback (phase, issue, details)
 * @returns {Promise<AgenticFixResult>}
 */
async function runAgenticFix(diff, reviewResult, apiKey, config, options = {}) {
  const { maxRounds = 3, repoRoot = process.cwd(), autoApply = false, onProgress } = options;

  const issues = (reviewResult.issues || []).filter(i => i.confidence >= 60);
  if (issues.length === 0) {
    return {
      attempts: [],
      totalIssues: 0,
      fixedCount: 0,
      failedCount: 0,
      tokensUsed: 0,
      summary: 'No issues to fix — all clear! ✅',
    };
  }

  const attempts = [];
  let fixedCount = 0;
  let failedCount = 0;
  let tokensUsed = 0;

  for (let idx = 0; idx < issues.length; idx++) {
    const issue = issues[idx];
    if (onProgress) onProgress('fixing', idx + 1, { issue, total: issues.length });

    const attempt = await fixSingleIssue(diff, issue, apiKey, config, {
      maxRounds,
      repoRoot,
      autoApply,
      onProgress: (phase, round, details) => {
        if (onProgress) onProgress(phase, idx + 1, { issue, round, details, total: issues.length });
      },
    });

    attempts.push(attempt);
    tokensUsed += attempt.tokensUsed || 0;

    if (attempt.success) {
      fixedCount++;
      // Merge successful patch into diff for subsequent fixes (so they see the updated context)
      if (attempt.finalPatch) {
        diff = mergePatchIntoDiff(diff, attempt.finalPatch);
      }
    } else {
      failedCount++;
    }
  }

  const allPatches = attempts
    .filter(a => a.success && a.finalPatch)
    .map(a => `# Fix for: ${a.issue.message.slice(0, 80)}\n${a.finalPatch}`)
    .join('\n\n');

  const summary = buildSummary(attempts, fixedCount, failedCount, issues.length);

  return {
    attempts,
    totalIssues: issues.length,
    fixedCount,
    failedCount,
    tokensUsed,
    summary,
    allPatches: allPatches || null,
  };
}

/**
 * Fix a single issue with up to maxRounds of generate → apply → verify.
 */
async function fixSingleIssue(diff, issue, apiKey, config, options = {}) {
  const { maxRounds = 3, repoRoot, autoApply = false, onProgress } = options;

  let currentPatch = null;
  let currentDiff = diff;
  let verificationResult = null;
  let rounds = 0;

  for (rounds = 1; rounds <= maxRounds; rounds++) {
    if (onProgress) onProgress('generate', rounds);

    // 1. Generate fix
    const fix = await generateAgenticFix(currentDiff, issue, currentPatch, verificationResult, apiKey, config);
    if (!fix.patch || fix.patch.trim() === '') {
      // AI couldn't generate a fix
      if (fix.skipReason) {
        return {
          issue,
          success: false,
          rounds,
          finalPatch: null,
          reason: fix.skipReason,
          verificationResult: null,
          tokensUsed: fix.tokensUsed || 0,
        };
      }
      continue;
    }

    currentPatch = fix.patch;
    if (onProgress) onProgress('apply', rounds);

    // 2. Apply patch to a temp working copy
    const applyResult = applyPatchToTemp(currentDiff, currentPatch, issue.file);
    if (!applyResult.success) {
      verificationResult = { passed: false, error: `Patch apply failed: ${applyResult.error}` };
      continue;
    }

    currentDiff = applyResult.newDiff;

    // 3. Verify: run lint / build / test on the temp files
    if (onProgress) onProgress('verify', rounds);
    verificationResult = await runVerification(applyResult.tempDir, issue.file, repoRoot);

    if (verificationResult.passed) {
      // Success!
      return {
        issue,
        success: true,
        rounds,
        finalPatch: currentPatch,
        verificationResult,
        tokensUsed: fix.tokensUsed || 0,
      };
    }

    // Verification failed — loop again with feedback
    if (onProgress) onProgress('retry', rounds, { error: verificationResult.error });
  }

  // Exhausted all rounds
  return {
    issue,
    success: false,
    rounds,
    finalPatch: currentPatch,
    reason: `Verification failed after ${maxRounds} rounds: ${verificationResult?.error || 'unknown'}`,
    verificationResult,
    tokensUsed: 0,
  };
}

/**
 * Generate a fix patch for a specific issue using AI.
 * Includes verification feedback from previous round if available.
 */
async function generateAgenticFix(diff, issue, previousPatch, verificationResult, apiKey, config) {
  const systemMsg = `You are an expert programmer and code reviewer. Your task is to fix a specific issue found during code review.

Given a git diff, an issue description, and (optionally) a previous failed fix attempt with its verification error, generate a CORRECT unified patch that fixes the issue.

## Rules:
1. Generate a proper unified diff format patch (git diff format with --- and +++ headers)
2. Fix ONLY the specific issue described — do NOT introduce other changes
3. The patch must apply cleanly to the current diff context
4. If there was a previous failed attempt, read the verification error and fix the root cause
5. If you truly cannot generate a fix (e.g., the issue requires human architectural judgment), return {"skip": true, "reason": "..."}

## Output format (return ONLY valid JSON):
\`\`\`json
{
  "patch": "the unified diff patch content, or null if cannot fix",
  "explanation": "one-line explanation of what was changed",
  "skip": false,
  "reason": "only set if skip is true"
}
\`\`\``;

  let userContent = `## Diff to fix:
\`\`\`diff
${diff.slice(0, 6000)}
\`\`\`

## Issue to fix:
- Type: ${issue.type}
- Severity: ${issue.severity}
- File: ${issue.file || 'N/A'}
- Line: ${issue.line || 'N/A'}
- Message: ${issue.message}
- Suggestion: ${issue.suggestion || 'N/A'}
- Confidence: ${issue.confidence || 'N/A'}
- Detected by: ${issue.detectedBy || 'N/A'}`;

  // Include previous round feedback
  if (previousPatch) {
    userContent += `\n\n## Previous attempt (FAILED):
Patch:
\`\`\`diff
${previousPatch.slice(0, 3000)}
\`\`\`

Verification error: ${verificationResult?.error || 'unknown'}
${verificationResult?.output ? `\nOutput:\n${verificationResult.output.slice(0, 1000)}` : ''}

**Generate a CORRECTED patch that addresses the verification failure.**`;
  }

  const prompt = [
    { role: 'system', content: systemMsg },
    { role: 'user', content: userContent },
  ];

  try {
    const text = await callAI(apiKey, prompt, config);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Try extracting patch from diff block
        const patchMatch = text.match(/```diff\n([\s\S]*?)\n```/);
        parsed = {
          patch: patchMatch ? patchMatch[1] : null,
          explanation: 'Extracted from AI response',
        };
      }
    }

    // Estimate tokens
    const tokensUsed = text.length + JSON.stringify(prompt).length;
    return { ...parsed, tokensUsed };
  } catch (err) {
    return { patch: null, skip: true, reason: `AI call failed: ${err.message}`, tokensUsed: 0 };
  }
}

/**
 * Apply a patch to the current diff in a temp directory.
 * Returns the new diff and temp directory path.
 */
function applyPatchToTemp(diff, patch, targetFile) {
  const dir = join(tmpdir(), `coderev-agentic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  try {
    execSync(`mkdir "${dir}"`, { stdio: 'pipe', shell: true });
  } catch {
    try { execSync(`mkdir -p "${dir}"`, { stdio: 'pipe' }); } catch {}
  }

  // Write diff as a file, and patch as another
  const diffFile = join(dir, 'input.diff');
  const patchFile = join(dir, 'fix.patch');

  try {
    writeFileSync(diffFile, diff, 'utf-8');
    writeFileSync(patchFile, patch, 'utf-8');

    // Try to apply the patch on top of the diff using combinediff or manual merge
    // Strategy: parse both diffs and produce a merged diff
    const newDiff = mergeDiffPatches(diff, patch);
    return { success: true, newDiff, tempDir: dir };
  } catch (err) {
    return { success: false, error: err.message, tempDir: dir };
  }
}

/**
 * Merge two patches: apply fix.patch on top of original diff.
 * Simple line-based approach: for each file in the diff, apply hunk-level changes.
 */
function mergeDiffPatches(originalDiff, fixPatch) {
  if (!fixPatch || fixPatch.trim() === '') return originalDiff;

  // Parse fix patch to find file->hunks mapping
  const fixFiles = parsePatchFiles(fixPatch);

  if (fixFiles.size === 0) {
    // If we can't parse the fix patch, just append it
    return originalDiff + '\n\n# Agentic fix patch:\n' + fixPatch;
  }

  // For each file in the original diff, check if fixPatch modifies it
  let result = originalDiff;

  for (const [fileName, fixHunks] of fixFiles) {
    // Check if this file is in the original diff
    const origHunks = extractFileHunks(originalDiff, fileName);

    if (origHunks.length > 0) {
      // Merge fix hunks into original diff hunks for this file
      result = mergeFileHunks(result, fileName, origHunks, fixHunks);
    } else {
      // File not in original diff — append a new file section
      result += generateNewFileSection(fileName, fixHunks);
    }
  }

  return result;
}

/**
 * Parse a unified diff patch into per-file hunk lists.
 */
function parsePatchFiles(patch) {
  const files = new Map();
  if (!patch || typeof patch !== 'string') return files;
  const lines = patch.split('\n');
  let currentFile = null;
  let currentHunkHeader = null;
  let currentHunkLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header: --- a/path or +++ b/path
    const fromMatch = line.match(/^--- (?:a\/)?(.+)$/);
    const toMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);

    if (toMatch && (lines[i - 1] || '').startsWith('---')) {
      // Flush previous hunk
      if (currentFile && currentHunkHeader && currentHunkLines.length > 0) {
        const hunks = files.get(currentFile) || [];
        hunks.push({ header: currentHunkHeader, lines: [...currentHunkLines] });
        files.set(currentFile, hunks);
      }
      currentFile = toMatch[1].replace(/^b\//, '');
      currentHunkHeader = null;
      currentHunkLines = [];
      continue;
    }

    if (!currentFile) continue;

    // Detect hunk header: @@ -x,y +a,b @@
    if (line.startsWith('@@')) {
      // Flush previous hunk
      if (currentHunkHeader && currentHunkLines.length > 0) {
        const hunks = files.get(currentFile) || [];
        hunks.push({ header: currentHunkHeader, lines: [...currentHunkLines] });
        files.set(currentFile, hunks);
      }
      currentHunkHeader = line;
      currentHunkLines = [];
      continue;
    }

    if (currentHunkHeader) {
      currentHunkLines.push(line);
    }
  }

  // Flush last hunk
  if (currentFile && currentHunkHeader && currentHunkLines.length > 0) {
    const hunks = files.get(currentFile) || [];
    hunks.push({ header: currentHunkHeader, lines: [...currentHunkLines] });
    files.set(currentFile, hunks);
  }

  return files;
}

/**
 * Extract hunks for a given file from a diff.
 */
function extractFileHunks(diff, fileName) {
  const hunks = [];
  const lines = diff.split('\n');
  let inFile = false;
  let currentHunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('+++ b/') && line.includes(fileName)) {
      inFile = true;
      continue;
    }
    if (line.startsWith('diff --git') && inFile) {
      inFile = false;
      if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
      continue;
    }
    if (!inFile) continue;

    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = { header: line, lines: [] };
      continue;
    }
    if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

/**
 * Merge fix hunks into original diff for a specific file.
 */
function mergeFileHunks(diff, fileName, origHunks, fixHunks) {
  // Simple approach: append fix hunks to the file's last hunk in the diff
  const fixSection = fixHunks.map(h =>
    `@@ fix-hunk @@\n${h.lines.join('\n')}`
  ).join('\n');

  // Find the file section in diff and append after the last hunk
  const diffLines = diff.split('\n');
  const result = [];
  let inTargetFile = false;
  let fileHeaderDone = false;
  let lastHunkEnd = -1;
  let fileStartIdx = -1;
  let fileEndIdx = -1;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    if (line.startsWith('+++ b/') && line.includes(fileName)) {
      inTargetFile = true;
      fileStartIdx = i - 1; // includes the --- line
      continue;
    }
    if (inTargetFile && line.startsWith('diff --git')) {
      lastHunkEnd = i;
      fileEndIdx = i;
      inTargetFile = false;
      break;
    }
  }

  if (fileStartIdx >= 0) {
    // Append fix hunks right before the next file section, or at end
    const insertAt = fileEndIdx > 0 ? fileEndIdx : diffLines.length;

    return [
      ...diffLines.slice(0, insertAt),
      '',
      ...fixSection.split('\n'),
      ...diffLines.slice(insertAt),
    ].join('\n');
  }

  return diff;
}

/**
 * Generate a new file section in diff format.
 */
function generateNewFileSection(fileName, hunks) {
  const sections = [`--- a/${fileName}`, `+++ b/${fileName}`];
  for (const hunk of hunks) {
    sections.push('@@ -0,0 +1,' + hunk.lines.filter(l => l.startsWith('+')).length + ' @@');
    sections.push(...hunk.lines);
  }
  return sections.join('\n');
}

/**
 * Run verification: lint the changed files and run tests if available.
 */
async function runVerification(tempDir, targetFile, repoRoot) {
  const errors = [];
  const outputs = [];

  // 1. Basic syntax check: write patched content to temp file and try to parse it
  try {
    const patchedContent = reconstructFileContent(tempDir, targetFile);
    if (patchedContent !== null && targetFile) {
      const ext = (targetFile || '').split('.').pop();
      checkSyntax(patchedContent, ext, errors, outputs);
    }
  } catch (err) {
    errors.push(`Syntax check error: ${err.message}`);
  }

  // 2. Try to run lint on repo if available
  try {
    const lintResult = runRepoCommand(repoRoot, targetFile, 'lint');
    if (lintResult) {
      outputs.push(`Lint: ${lintResult}`);
      if (lintResult.includes('error') || lintResult.includes('Error')) {
        errors.push(`Lint failure: ${lintResult.slice(0, 200)}`);
      }
    }
  } catch {}

  // 3. Try to run build/test if available
  try {
    const testResult = runRepoCommand(repoRoot, targetFile, 'test');
    if (testResult) {
      outputs.push(`Test: ${testResult}`);
      if (testResult.includes('FAIL') || testResult.includes('fail')) {
        errors.push(`Test failure: ${testResult.slice(0, 200)}`);
      }
    }
  } catch {}

  return {
    passed: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : null,
    output: outputs.join('\n') || null,
  };
}

/**
 * Basic syntax check based on file extension.
 */
function checkSyntax(content, ext, errors, outputs) {
  try {
    if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
      // Use Node's built-in parser for syntax check
      const { execSync } = require('child_process');
      const tmpFile = join(tmpdir(), `coderev-syntax-${Date.now()}.js`);
      writeFileSync(tmpFile, content, 'utf-8');
      try {
        execSync(`node --check "${tmpFile}"`, { stdio: 'pipe', timeout: 5000 });
        outputs.push('Syntax: OK (JavaScript)');
      } catch (e) {
        errors.push(`Syntax (JS): ${e.stderr?.toString().slice(0, 200) || e.message}`);
      } finally {
        try { unlinkSync(tmpFile); } catch {}
      }
    } else if (['ts', 'tsx'].includes(ext)) {
      outputs.push('Syntax: TypeScript check skipped (no tsc in temp)');
    } else if (['py', 'pyi'].includes(ext)) {
      outputs.push('Syntax: Python check skipped (no python in temp)');
    } else if (['go'].includes(ext)) {
      outputs.push('Syntax: Go check skipped (no go in temp)');
    }
  } catch (err) {
    errors.push(`Syntax check error: ${err.message}`);
  }
}

/**
 * Try to run a repo-level command (lint/test) for the target file.
 */
function runRepoCommand(repoRoot, targetFile, commandType) {
  const packageJsonPath = join(repoRoot, 'package.json');
  if (!existsSync(packageJsonPath) || !targetFile) return null;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const scripts = pkg.scripts || {};

    let cmd = null;
    if (commandType === 'lint') {
      cmd = scripts.lint || scripts.eslint || null;
    } else if (commandType === 'test') {
      // Run only tests related to the changed file
      cmd = scripts.test || null;
      if (cmd && targetFile) {
        // Try to narrow test scope
        const testName = targetFile
          .replace(/^src\//, '')
          .replace(/\.(js|ts|jsx|tsx)$/, '.test.$1');
        const testPath = join(repoRoot, testName);
        if (existsSync(testPath) && scripts['test:file']) {
          cmd = scripts['test:file'];
        }
      }
    }

    if (!cmd) return null;

    // Only run if command looks safe (no complex pipes)
    if (cmd.includes('&&') || cmd.includes('|') || cmd.includes(';')) return null;

    const result = execSync(cmd, {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 15000,
      env: { ...process.env, CI: 'true' },
    });
    return result.stdout?.toString().slice(0, 500) || 'OK';
  } catch (err) {
    return err.stdout?.toString().slice(0, 500) || err.stderr?.toString().slice(0, 500) || err.message;
  }
}

/**
 * Reconstruct a file's content after patching (best-effort).
 * Returns null if not possible.
 */
function reconstructFileContent(tempDir, targetFile) {
  try {
    // Read the patched diff and extract the new file content
    const diffFile = join(tempDir, 'input.diff');
    const fixFile = join(tempDir, 'fix.patch');

    if (!existsSync(diffFile)) return null;

    const diff = readFileSync(diffFile, 'utf-8');
    const fixPatch = existsSync(fixFile) ? readFileSync(fixFile, 'utf-8') : '';

    // Simple: return diff + fix as a single string for syntax checking
    let content = diff;
    if (fixPatch) {
      // Extract added lines from fix patch
      const addedLines = fixPatch.split('\n')
        .filter(l => l.startsWith('+') && !l.startsWith('+++'))
        .map(l => l.slice(1));
      if (addedLines.length > 0) {
        content = addedLines.join('\n');
      }
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Build human-readable summary.
 */
function buildSummary(attempts, fixedCount, failedCount, totalIssues) {
  const parts = [];
  parts.push(`\n📊 Agentic Fix Summary:`);
  parts.push(`   Total issues: ${totalIssues}`);
  parts.push(`   ✅ Fixed: ${fixedCount}`);
  parts.push(`   ❌ Failed: ${failedCount}`);

  for (const a of attempts) {
    const icon = a.success ? '✅' : '❌';
    const rounds = a.rounds ? ` (${a.rounds} round${a.rounds > 1 ? 's' : ''})` : '';
    parts.push(`   ${icon} [${a.issue.type}] ${a.issue.message.slice(0, 70)}${rounds}`);
    if (!a.success && a.reason) {
      parts.push(`      Reason: ${a.reason.slice(0, 100)}`);
    }
  }

  if (fixedCount === totalIssues) {
    parts.push(`\n   🎉 All issues fixed!`);
  } else if (fixedCount > 0) {
    parts.push(`\n   💡 ${fixedCount}/${totalIssues} fixed. Review remaining issues manually.`);
  }

  return parts.join('\n');
}

module.exports = {
  runAgenticFix,
  fixSingleIssue,
  generateAgenticFix,
  applyPatchToTemp,
  mergeDiffPatches,
  parsePatchFiles,
  extractFileHunks,
  runVerification,
  buildSummary,
};
