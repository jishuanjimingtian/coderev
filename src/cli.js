#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const pkg = require('../package.json');
const { reviewDiff } = require('./reviewer');
const { loadConfig } = require('./config');
const { resolvePrRef, fetchPrDiff, postPrComment, resolveToken } = require('./github');

program
  .name('coderev')
  .description('AI-powered code review agent')
  .version(pkg.version);

program
  .command('review')
  .description('Review a diff or pull request')
  .option('-f, --file <path>', 'Path to diff file (reads stdin if omitted)')
  .option('-r, --repo <path>', 'Path to git repository')
  .option('--base <branch>', 'Base branch for diff (requires --repo)')
  .option('--head <branch>', 'Head branch for diff (requires --repo)')
  .option('-c, --config <path>', 'Path to config file')
  .option('-o, --output <format>', 'Output format (markdown|json|terminal)', 'terminal')
  .option('--pr <ref>', 'GitHub PR to review, e.g. owner/repo#42 or full URL')
  .option('--github-token <token>', 'GitHub personal access token')
  .option('--post', 'Post review result as PR comment (requires --github-token)')
  .option('--no-cache', 'Skip cache and force fresh review')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);

      let diff;
      let prRef = null;

      if (options.pr) {
        prRef = resolvePrRef(options.pr, options.repo);
        const token = resolveToken(options.githubToken, config);
        console.error(chalk.blue(`↻ Fetching PR ${prRef.owner}/${prRef.repo}#${prRef.pr}...`));
        diff = await fetchPrDiff(prRef, token);
      } else if (options.file) {
        const fs = require('fs');
        diff = fs.readFileSync(options.file, 'utf-8');
      } else if (options.repo) {
        diff = await getGitDiff(options.repo, options.base, options.head);
      } else {
        // Read from stdin
        const fs = require('fs');
        const stdinBuffer = fs.readFileSync(0, 'utf-8');
        if (stdinBuffer.trim()) {
          diff = stdinBuffer;
        } else {
          console.error(chalk.red('✖ No diff input provided. Pipe a diff, use --file, use --repo, or use --pr.'));
          process.exit(1);
        }
      }

      const result = await reviewDiff(diff, config, { noCache: options.noCache === false });

      let output;
      if (options.output === 'json') {
        output = JSON.stringify(result, null, 2);
      } else if (options.output === 'markdown') {
        output = formatMarkdown(result);
      } else {
        output = formatTerminal(result);
      }

      if (options.post && prRef) {
        const token = resolveToken(options.githubToken, config);
        if (!token) {
          console.error(chalk.red('✖ --post requires --github-token or GITHUB_TOKEN env var'));
          process.exit(1);
        }
        const mdReport = formatMarkdown(result);
        console.error(chalk.blue(`↻ Posting review to PR ${prRef.owner}/${prRef.repo}#${prRef.pr}...`));
        await postPrComment(prRef, mdReport, token);
        console.error(chalk.green('✔ Review posted as PR comment!'));
      }

      console.log(output);
    } catch (err) {
      console.error(chalk.red(`✖ ${err.message}`));
      process.exit(1);
    }
  });

// ── Cache Management ──────────────────────────────────────────
program
  .command('cache')
  .description('Manage review cache')
  .argument('[action]', 'Action: clear', 'status')
  .action((action) => {
    const { cleanCache } = require('./cache');
    const fs = require('fs');
    const cacheDir = require('path').join(require('os').homedir(), '.coderev', 'cache');

    if (action === 'clear') {
      const count = cleanCache();
      console.log(chalk.green(`✔ Cache cleared (${count} entries removed)`));
    } else if (action === 'status') {
      if (!fs.existsSync(cacheDir)) {
        console.log(chalk.blue('   Cache is empty'));
        return;
      }
      const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
      const totalSize = files.reduce((sum, f) => sum + fs.statSync(path.join(cacheDir, f)).size, 0);
      console.log(chalk.bold(`\n📦 Cache: ${files.length} entries, ${(totalSize / 1024).toFixed(1)} KB`));
    }
  });

// ── Init / Setup ──────────────────────────────────────────────
program
  .command('init')
  .description('Create a default coderev config file')
  .action(() => {
    const fs = require('fs');
    const path = require('path');
    const defaultConfig = {
      ai: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 4096,
      },
      rules: {
        maxLineLength: 100,
        predefined: ['security', 'performance', 'style'],
        custom: []
      },
      output: {
        format: 'terminal',
        includeScore: true,
      },
    };
    const configPath = path.join(process.cwd(), '.coderevrc.json');
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green(`✔ Default config created at ${configPath}`));
  });

program.parse(process.argv);

// ── Helpers ───────────────────────────────────────────────────
async function getGitDiff(repoPath, base = 'main', head) {
  const { execSync } = require('child_process');
  const args = ['git', 'diff'];
  if (base) args.push(base);
  if (head) args.push(head);
  try {
    return execSync(args.join(' '), { cwd: repoPath, encoding: 'utf-8' });
  } catch (err) {
    throw new Error(`Failed to get git diff: ${err.stderr || err.message}`);
  }
}

function formatTerminal(result) {
  const lines = [];
  lines.push(chalk.bold('\n📋 Code Review Report'));
  lines.push('━'.repeat(50));

  if (result.summary) {
    lines.push(`\n${chalk.bold('Summary:')} ${result.summary}`);
  }

  if (result.score !== undefined && result.score !== null) {
    const color = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
    lines.push(`\n${chalk.bold('Score:')} ${color(`${result.score}/100`)}`);
  }

  if (result.issues && result.issues.length > 0) {
    lines.push(`\n${chalk.bold(`Issues (${result.issues.length}):`)}`);
    for (const issue of result.issues) {
      const typeLabel =
        issue.type === 'error' ? chalk.red('✖') :
        issue.type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      const severity = issue.severity ? ` [${issue.severity}]` : '';
      lines.push(`  ${typeLabel}${severity} ${issue.message}`);
      if (issue.file) lines.push(`     File: ${issue.file}`);
      if (issue.line) lines.push(`     Line: ${issue.line}`);
      if (issue.suggestion) lines.push(`     Suggestion: ${issue.suggestion}`);
    }
  }

  if (result.suggestions && result.suggestions.length > 0) {
    lines.push(`\n${chalk.bold('Suggestions:')}`);
    for (const s of result.suggestions) {
      lines.push(`  💡 ${s}`);
    }
  }

  if (result.praise && result.praise.length > 0) {
    lines.push(`\n${chalk.bold('👍 Good Practices:')}`);
    for (const p of result.praise) {
      lines.push(`  ✅ ${p}`);
    }
  }

  lines.push('\n' + '━'.repeat(50));
  return lines.join('\n');
}

function formatMarkdown(result) {
  let md = '# 📋 Code Review Report\n\n';

  if (result.summary) md += `**Summary:** ${result.summary}\n\n`;
  if (result.score !== undefined) md += `**Score:** ${result.score}/100\n\n`;

  if (result.issues?.length) {
    md += `## Issues (${result.issues.length})\n\n`;
    for (const issue of result.issues) {
      md += `- **${issue.type.toUpperCase()}**`;
      if (issue.severity) md += ` [${issue.severity}]`;
      md += `: ${issue.message}\n`;
      if (issue.file) md += `  - File: \`${issue.file}\`\n`;
      if (issue.line) md += `  - Line: ${issue.line}\n`;
      if (issue.suggestion) md += `  - Suggestion: ${issue.suggestion}\n`;
    }
  }

  if (result.suggestions?.length) {
    md += `\n## Suggestions\n\n`;
    for (const s of result.suggestions) md += `- 💡 ${s}\n`;
  }

  if (result.praise?.length) {
    md += `\n## 👍 Good Practices\n\n`;
    for (const p of result.praise) md += `- ✅ ${p}\n`;
  }

  return md;
}
