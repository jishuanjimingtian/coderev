/**
 * Git blame context analysis for coderev.
 *
 * Runs `git blame` on modified files to distinguish:
 * - **New issues**: introduced in the current diff/commit
 * - **Pre-existing issues**: already present before this change
 *
 * This helps reviewers focus on what's actually new vs. inherited debt.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Parse a unified diff into per-file line additions.
 * @param {string} diff - The git diff text
 * @returns {Array<{file: string, addedLines: number[]}>}
 */
function parseDiffAddedLines(diff) {
  if (!diff || typeof diff !== 'string') return [];

  const result = [];
  const lines = diff.split('\n');
  let currentFile = null;
  let currentAdded = [];
  let oldStart = 0, newStart = 0, oldCount = 0, newCount = 0;
  let newLineOffset = 0;

  for (const line of lines) {
    // Detect file header
    const fileMatch = line.match(/^\+\+\+ b\/(.*)/);
    if (fileMatch) {
      if (currentFile && currentAdded.length > 0) {
        result.push({ file: currentFile, addedLines: [...new Set(currentAdded)].sort((a, b) => a - b) });
      }
      currentFile = fileMatch[1];
      currentAdded = [];
      continue;
    }

    // Chunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const chunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (chunkMatch) {
      oldStart = parseInt(chunkMatch[1], 10);
      oldCount = chunkMatch[2] ? parseInt(chunkMatch[2], 10) : 1;
      newStart = parseInt(chunkMatch[3], 10);
      newCount = chunkMatch[4] ? parseInt(chunkMatch[4], 10) : 1;
      newLineOffset = newStart - 1;
      continue;
    }

    // Track added lines (context or removed = old)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      newLineOffset++;
      currentAdded.push(newLineOffset);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed lines don't advance new position
      continue;
    } else {
      // Context line: advances both old and new
      newLineOffset++;
    }
  }

  // Push last file
  if (currentFile && currentAdded.length > 0) {
    result.push({ file: currentFile, addedLines: [...new Set(currentAdded)].sort((a, b) => a - b) });
  }

  return result;
}

/**
 * Run `git blame` on a file for specific line numbers.
 * @param {string} filePath - Path relative to git repo root
 * @param {number[]} lineNumbers - Array of line numbers to blame
 * @param {string} [repoPath] - Path to git repo (default: cwd)
 * @returns {Promise<object>} Map of lineNumber -> { author, commit, date, isNew }
 */
function blameLines(filePath, lineNumbers, repoPath) {
  return new Promise((resolve) => {
    if (!lineNumbers || lineNumbers.length === 0) {
      resolve({});
      return;
    }

    const cwd = repoPath || process.cwd();
    const absPath = path.resolve(cwd, filePath);

    if (!fs.existsSync(absPath)) {
      resolve({});
      return;
    }

    try {
      // Run git blame for specific lines, porcelain format
      const lineArgs = lineNumbers.map(n => `-L ${n},${n}`).join(' ');
      const cmd = `git blame --porcelain ${lineArgs} -- "${filePath}"`;

      const stdout = execSync(cmd, {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = {};

      // Parse porcelain format
      const porcelainLines = stdout.split('\n');
      let i = 0;

      while (i < porcelainLines.length) {
        const line = porcelainLines[i];
        if (!line.trim()) { i++; continue; }

        // Header line: commit-hash author-line file-line (or not)
        const headerMatch = line.match(/^([a-f0-9]+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
        if (!headerMatch) { i++; continue; }

        const commitHash = headerMatch[1];
        const origLine = parseInt(headerMatch[2], 10);
        const finalLine = parseInt(headerMatch[3], 10);
        const numLines = parseInt(headerMatch[4], 10);

        // Skip boundary (not committed yet)
        if (commitHash === '0000000000000000000000000000000000000000') {
          result[finalLine] = { commit: commitHash, author: '(uncommitted)', date: new Date(), isNew: true };
          // Skip ahead the content lines
          i += numLines + 1;
          while (i < porcelainLines.length && porcelainLines[i].startsWith('\t')) { i++; }
          continue;
        }

        // Read header fields until content
        let author = '(unknown)';
        let date = new Date(0);
        let isNew = false;

        i++;
        while (i < porcelainLines.length && !porcelainLines[i].startsWith('\t')) {
          const hdr = porcelainLines[i];
          if (hdr.startsWith('author ')) {
            author = hdr.slice(7);
          } else if (hdr.startsWith('author-time ')) {
            date = new Date(parseInt(hdr.slice(12), 10) * 1000);
          } else if (hdr.startsWith('boundary')) {
            // Boundary commit = root of history
          }
          i++;
        }

        // Line content (starts with \t)
        if (i < porcelainLines.length && porcelainLines[i].startsWith('\t')) {
          // Content line - skip
        }

        result[finalLine] = { commit: commitHash, author, date, isNew };

        // Jump to next header (skip content lines)
        while (i < porcelainLines.length && porcelainLines[i].startsWith('\t')) { i++; }
      }

      resolve(result);
    } catch (err) {
      // git blame failed (file not tracked, etc.)
      resolve({});
    }
  });
}

/**
 * Analyze a diff with git blame to classify issues.
 * @param {string} diff - The git diff
 * @param {object} [options] - Options
 * @param {string} [options.repoPath] - Git repo path
 * @returns {Promise<{fileContexts: Array}>}
 */
async function analyzeDiffContext(diff, options = {}) {
  const files = parseDiffAddedLines(diff);
  const fileContexts = [];

  for (const fileEntry of files) {
    const { file, addedLines } = fileEntry;
    if (addedLines.length === 0) continue;

    const blameMap = await blameLines(file, addedLines, options.repoPath);
    const newLines = [];
    const existingLines = [];

    for (const lineNum of addedLines) {
      if (blameMap[lineNum] && blameMap[lineNum].isNew) {
        newLines.push(lineNum);
      } else {
        existingLines.push(lineNum);
      }
    }

    fileContexts.push({
      file,
      totalNewLines: addedLines.length,
      newLines,
      existingLines,
      existingCount: existingLines.length,
      newCount: newLines.length,
    });
  }

  return fileContexts;
}

/**
 * Tag issues with blame context (new vs pre-existing).
 * @param {Array} issues - List of review issues
 * @param {Array} fileContexts - Output from analyzeDiffContext
 * @returns {Array} Tagged issues with `isNew` field
 */
function tagIssuesWithBlame(issues, fileContexts) {
  if (!issues || !fileContexts) return issues || [];

  const lineMap = {};
  for (const ctx of fileContexts) {
    for (const ln of ctx.newLines) {
      lineMap[`${ctx.file}:${ln}`] = true;
    }
  }

  return issues.map(issue => {
    if (!issue.file || !issue.line) {
      return { ...issue, isNew: null }; // Can't determine
    }
    const key = `${issue.file}:${issue.line}`;
    return {
      ...issue,
      isNew: lineMap[key] || false,
    };
  });
}

module.exports = {
  parseDiffAddedLines,
  blameLines,
  analyzeDiffContext,
  tagIssuesWithBlame,
};
