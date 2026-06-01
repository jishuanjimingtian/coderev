#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const pkg = require('../package.json');
const { reviewDiff } = require('./reviewer');
const { loadConfig } = require('./config');
const { resolvePrRef, fetchPrDiff, postPrComment, resolveToken, fetchPrFiles, postInlineComments } = require('./github');

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
  .option('--gl <ref>', 'GitLab MR to review, e.g. owner/repo!42 or full URL')
  .option('--gee <ref>', 'Gitee PR to review, e.g. owner/repo!42 or full URL')
  .option('--gc <ref>', 'GitCode MR to review, e.g. owner/repo!42 or full URL')
  .option('--bb <ref>', 'Bitbucket PR to review, e.g. owner/repo#42 or full URL')
  .option('--all', 'Review all open PRs for the repo (use with --pr owner/repo or --repo)')
  .option('--github-token <token>', 'GitHub personal access token')
  .option('--gitlab-token <token>', 'GitLab personal access token')
  .option('--gee-token <token>', 'Gitee personal access token')
  .option('--gc-token <token>', 'GitCode personal access token')
  .option('--bb-token <token>', 'Bitbucket app password')
  .option('--post', 'Post review result as PR/MR comment')
  .option('--no-cache', 'Skip cache and force fresh review')
  .option('--audit', 'Security audit mode (OWASP-focused review)')
  .option('--single', 'Use single-agent mode (legacy, no parallel review)')
  .option('--min-confidence <number>', 'Minimum confidence threshold 0-100 (default: 60)', '60')
  .option('--agents <list>', 'Comma-separated agent list: security,bugs,quality')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);

      let diff;
      let prRef = null;

      // Load .coderevignore if it exists
      let ignorePattern = '';
      try {
        const fs = require('fs');
        if (fs.existsSync('.coderevignore')) {
          ignorePattern = fs.readFileSync('.coderevignore', 'utf-8')
            .split('\n')
            .filter(l => l.trim() && !l.startsWith('#'))
            .map(l => l.trim())
            .join(',');
        }
      } catch {}

      if (options.all && prRef) {
        // Batch mode: review all open PRs
        const { listPullRequests } = require('./github');
        const token = resolveToken(options.githubToken, config);
        const repoRef = { owner: prRef.owner, repo: prRef.repo };
        const prList = await listPullRequests(repoRef, token, { state: 'open', limit: 20 });

        if (prList.length === 0) {
          console.log(chalk.blue(`   No open PRs found for ${prRef.owner}/${prRef.repo}`));
          return;
        }

        console.error(chalk.bold(`\n📋 Found ${prList.length} open PRs in ${prRef.owner}/${prRef.repo}:`));
        for (const pr of prList) {
          console.error(`  #${pr.number} ${pr.title} (${pr.draft ? 'draft' : 'open'})`);
        }
        console.error('');

        const results = [];
        for (const pr of prList) {
          console.error(chalk.blue(`↻ Reviewing PR #${pr.number}...`));
          const fullRef = { owner: prRef.owner, repo: prRef.repo, pr: pr.number };
          try {
            const prDiff = await fetchPrDiff(fullRef, token);
            const result = await reviewDiff(prDiff, config, { noCache: true, ignorePattern });
            results.push({ number: pr.number, title: pr.title, result });

            if (options.post) {
              const md = formatMarkdown(result);
              await postPrComment(fullRef, md, token);
              console.error(chalk.green(`  ✔ #${pr.number} reviewed & posted`));
            } else {
              const scoreColor = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
              const scoreStr = scoreColor(`${result.score}/100`);
              const issueCount = (result.issues || []).length;
              console.error(`  ${scoreStr} (${issueCount} issues) - ${result.summary || ''}`);
            }
          } catch (err) {
            console.error(chalk.red(`  ✖ #${pr.number}: ${err.message}`));
          }
        }

        // Summary
        const scores = results.filter(r => r.result).map(r => r.result.score);
        if (scores.length > 0) {
          const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
          console.error(chalk.bold(`\n📊 Batch Summary: ${results.length}/${prList.length} reviewed, avg score: ${avg}`));
        }

        if (options.output === 'json') {
          console.log(JSON.stringify(results, null, 2));
        } else if (options.output === 'markdown') {
          for (const r of results) {
            console.log(`## PR #${r.number}: ${r.title}\n`);
            console.log(formatMarkdown(r.result));
            console.log('---\n');
          }
        }
        return;
      }

      if (options.gl) {
        const { resolveMrRef, fetchMrDiff } = require('./gitlab');
        const glRef = resolveMrRef(options.gl, options.repo);
        const glToken = options.gitlabToken || process.env.GITLAB_TOKEN;
        console.error(chalk.blue(`↻ Fetching GitLab MR ${glRef.owner}/${glRef.repo}!${glRef.mr}...`));
        diff = await fetchMrDiff(glRef, glToken);
        console.error(chalk.green(`✔ Diff fetched (${diff.length} chars)`));
      } else if (options.gee) {
        const { resolvePrRef: resolveGiteeRef, fetchPrDiff: fetchGiteeDiff } = require('./gitee');
        const geeRef = resolveGiteeRef(options.gee, options.repo);
        const geeToken = options.geeToken || process.env.GITEE_TOKEN;
        console.error(chalk.blue(`↻ Fetching Gitee PR ${geeRef.owner}/${geeRef.repo}!${geeRef.pr}...`));
        diff = await fetchGiteeDiff(geeRef, geeToken);
        console.error(chalk.green(`✔ Diff fetched (${diff.length} chars)`));
      } else if (options.gc) {
        const { resolveMrRef: resolveGcRef, fetchMrDiff: fetchGcDiff } = require('./gitcode');
        const gcRef = resolveGcRef(options.gc, options.repo);
        const gcToken = options.gcToken || process.env.GITCODE_TOKEN;
        console.error(chalk.blue(`↻ Fetching GitCode MR ${gcRef.owner}/${gcRef.repo}!${gcRef.mr}...`));
        diff = await fetchGcDiff(gcRef, gcToken);
        console.error(chalk.green(`✔ Diff fetched (${diff.length} chars)`));
      } else if (options.bb) {
        const { resolvePrRef: resolveBbRef, fetchPrDiff: fetchBbDiff } = require('./bitbucket');
        const bbRef = resolveBbRef(options.bb, options.repo);
        if (options.bbToken) process.env.BITBUCKET_USERNAME = options.bbToken.split(':')[0] || '';
        const bbToken = options.bbToken || process.env.BITBUCKET_APP_PASSWORD;
        console.error(chalk.blue(`↻ Fetching Bitbucket PR ${bbRef.owner}/${bbRef.repo}#${bbRef.pr}...`));
        diff = await fetchBbDiff(bbRef, bbToken);
        console.error(chalk.green(`✔ Diff fetched (${diff.length} chars)`));
      } else if (options.pr) {
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

      const result = await reviewDiff(diff, config, {
        noCache: options.noCache === false,
        ignorePattern,
        audit: options.audit || undefined,
        single: options.single || undefined,
        minConfidence: parseInt(options.minConfidence) || undefined,
      });

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

      if (options.inline && prRef) {
        const token = resolveToken(options.githubToken, config);
        if (!token) {
          console.error(chalk.red('✖ --inline requires --github-token or GITHUB_TOKEN env var'));
          process.exit(1);
        }
        console.error(chalk.blue(`↻ Posting inline review to PR ${prRef.owner}/${prRef.repo}#${prRef.pr}...`));

        // Get PR files for commit SHA and file mapping
        const prFiles = await fetchPrFiles(prRef, token);
        // Get PR info for head SHA
        const https = require('https');
        const prInfo = await new Promise((resolve, reject) => {
          https.get('https://api.github.com/repos/' + prRef.owner + '/' + prRef.repo + '/pulls/' + prRef.pr, {
            headers: { 'User-Agent': 'coderev', 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + token },
          }, (r) => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>{ try{resolve(JSON.parse(b))}catch{reject()}}); }).on('error', reject);
        });

        // Map issues to inline comments by file name
        const inlineComments = [];
        const fileMap = {};
        for (const f of prFiles) {
          fileMap[f.filename] = f;
        }

        for (const issue of result.issues || []) {
          if (!issue.file) continue;
          const fileInfo = fileMap[issue.file];
          if (!fileInfo) continue;
          // GitHub API wants line number in the NEW file (RIGHT side) or OLD file (LEFT side)
          inlineComments.push({
            path: issue.file,
            line: issue.line || 1,
            side: 'RIGHT',
            type: issue.type || 'info',
            severity: issue.severity || 'low',
            message: issue.message,
            suggestion: issue.suggestion || '',
          });
        }

        if (inlineComments.length > 0) {
          // Use PR head SHA
          const headSha = prInfo?.head?.sha;
          if (headSha) {
            await postInlineComments(prRef, headSha, inlineComments, token);
            console.error(chalk.green(`✔ ${inlineComments.length} inline comments posted!`));
          } else {
            console.error(chalk.red('✖ Could not resolve PR head commit SHA'));
          }
        } else {
          console.error(chalk.yellow('⚠ No line-level issues to post inline'));
        }
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

// ── Fix ──────────────────────────────────────────────────────
program
  .command('fix')
  .description('Generate a fix patch for issues found in a diff')
  .option('-f, --file <path>', 'Path to diff file')
  .option('--pr <ref>', 'GitHub PR to fix')
  .option('--apply', 'Apply the fix patch directly')
  .option('--github-token <token>', 'GitHub personal access token')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);

      let diff;
      let prRef = null;

      if (options.pr) {
        const { resolvePrRef, fetchPrDiff } = require('./github');
        prRef = resolvePrRef(options.pr, options.repo);
        const token = resolveToken(options.githubToken, config);
        console.error(chalk.blue(`↻ Fetching PR ${prRef.owner}/${prRef.repo}#${prRef.pr}...`));
        diff = await fetchPrDiff(prRef, token);
      } else if (options.file) {
        const fs = require('fs');
        diff = fs.readFileSync(options.file, 'utf-8');
      } else {
        const fs = require('fs');
        const stdinBuffer = fs.readFileSync(0, 'utf-8');
        if (!stdinBuffer.trim()) {
          console.error(chalk.red('✖ No diff input provided.'));
          process.exit(1);
        }
        diff = stdinBuffer;
      }

      console.error(chalk.blue('↻ Generating fix patch...'));
      const { reviewDiff } = require('./reviewer');
      const result = await reviewDiff(diff, config, { noCache: true, single: true });

      // Build fix prompt from issues
      const apiKey = getApiKey(config);
      const fixPrompt = [
        {
          role: 'system',
          content: `You are an expert programmer. Given a diff and a list of issues, generate a unified patch that fixes ALL the issues. Return ONLY the patch content wrapped in \`\`\`diff \`\`\` blocks. Do NOT explain the fixes, just output the patch.`,
        },
        {
          role: 'user',
          content: `Diff:\n\`\`\`diff\n${diff}\n\`\`\`\n\nIssues to fix:\n${result.issues.map(i => `- [${i.severity}] ${i.message} in ${i.file}:${i.line || '?'}`).join('\n')}\n\n${result.suggestions.map(s => `- Suggestion: ${s}`).join('\n')}\n\nGenerate the fix patch:`,
        },
      ];

      const aiResponse = await callAI(apiKey, fixPrompt, config);

      // Extract patch from response
      const patchMatch = aiResponse.match(/```diff\n([\s\S]*?)\n```/);
      const patch = patchMatch ? patchMatch[1] : aiResponse;

      console.log('\n' + chalk.bold('🩹 Fix Patch / 修复补丁:'));
      console.log('━'.repeat(50));
      console.log(patch);

      if (options.apply) {
        const fs = require('fs');
        const tmpFile = path.join(require('os').tmpdir(), 'coderev-fix.patch');
        fs.writeFileSync(tmpFile, patch);
        console.error(chalk.blue(`↻ Applying patch from ${tmpFile}...`));
        try {
          const { execSync } = require('child_process');
          const cwd = prRef ? undefined : process.cwd();
          execSync(`git apply "${tmpFile}"`, { cwd, stdio: 'pipe' });
          console.log(chalk.green('✔ Patch applied successfully!'));
        } catch (applyErr) {
          console.error(chalk.red(`✖ Failed to apply patch: ${applyErr.stderr || applyErr.message}`));
        }
      }
    } catch (err) {
      console.error(chalk.red(`✖ ${err.message}`));
      process.exit(1);
    }
  });

// ── Config ─────────────────────────────────────────────────────
program
  .command('config')
  .description('Manage configuration')
  .argument('[action]', 'Action: show | validate | path', 'show')
  .action((action) => {
    const { loadConfig } = require('./config');

    if (action === 'show') {
      const config = loadConfig();
      // Mask sensitive fields
      const masked = JSON.parse(JSON.stringify(config));
      if (masked.ai?.apiKey) masked.ai.apiKey = masked.ai.apiKey.slice(0, 8) + '...' + masked.ai.apiKey.slice(-4);
      if (masked.github?.token) masked.github.token = masked.github.token.slice(0, 8) + '...' + masked.github.token.slice(-4);
      console.log(chalk.bold('\n⚙ Active Configuration / 当前配置:'));
      console.log('━'.repeat(50));
      console.log(JSON.stringify(masked, null, 2));
    } else if (action === 'validate') {
      const fs = require('fs');
      let found = null;
      let current = process.cwd();
      while (true) {
        for (const name of ['.coderevrc.json', '.coderevrc', 'coderev.config.json']) {
          const full = path.join(current, name);
          if (fs.existsSync(full)) { found = full; break; }
        }
        if (found) break;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }

      if (found) {
        try {
          const parsed = JSON.parse(fs.readFileSync(found, 'utf-8'));
          const errors = [];
          if (!parsed.ai) errors.push('Missing "ai" section');
          if (!parsed.ai?.provider) errors.push('Missing "ai.provider"');
          if (!parsed.ai?.model) errors.push('Missing "ai.model"');
          if (errors.length === 0) {
            console.log(chalk.green(`✔ Config valid / 配置有效: ${found}`));
          } else {
            console.log(chalk.yellow(`⚠ Config found but has issues / 配置存在但有问题:`));
            for (const e of errors) console.log(chalk.yellow(`   ${e}`));
          }
        } catch (parseErr) {
          console.error(chalk.red(`✖ Invalid JSON in ${found}: ${parseErr.message}`));
        }
      } else {
        console.log(chalk.blue('   No config file found in current or parent directories.'));
        console.log(chalk.blue('   Run `coderev init` to create one.'));
      }
    } else if (action === 'path') {
      let current = process.cwd();
      while (true) {
        for (const name of ['.coderevrc.json', '.coderevrc', 'coderev.config.json']) {
          const full = path.join(current, name);
          if (require('fs').existsSync(full)) {
            console.log(full);
            return;
          }
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      console.log(chalk.blue('   No config file found'));
    }
  });

// ── Stats ─────────────────────────────────────────────────────
program
  .command('stats')
  .description('Review statistics and trends')
  .argument('[period]', 'Period: day | week | month | all', 'all')
  .option('--clear', 'Clear all review history')
  .action((period, options) => {
    const { getStats, clearHistory } = require('./stats');

    if (options.clear) {
      if (clearHistory()) {
        console.log(chalk.green('✔ Review history cleared'));
      } else {
        console.error(chalk.red('✖ Failed to clear history'));
      }
      return;
    }

    const stats = getStats({ period });

    if (stats.total === 0) {
      console.log(chalk.blue('\n   No review data for this period.'));
      console.log(chalk.blue('   Run a review first with `coderev review`.'));
      return;
    }

    console.log(chalk.bold('\n📊 Review Statistics / 审查统计'));
    console.log('━'.repeat(50));
    console.log(`  Period / 周期:       ${chalk.bold(period)}`);
    console.log(`  Total reviews / 总数: ${stats.total}`);
    if (stats.totalAllTime > stats.total) {
      console.log(`  All time / 累计:     ${stats.totalAllTime}`);
    }
    console.log(`  Avg score / 平均分:    ${chalk.cyan(stats.averageScore)}`);
    console.log(`  Highest / 最高:      ${chalk.green(stats.highestScore)}`);
    console.log(`  Lowest / 最低:       ${chalk.red(stats.lowestScore)}`);
    console.log(`  Total issues / 问题数: ${chalk.yellow(stats.totalIssues)}`);

    if (Object.keys(stats.issueTypes).length > 0) {
      console.log(chalk.bold('\n  Issue Types / 问题类型:'));
      for (const [type, count] of Object.entries(stats.issueTypes)) {
        const icon = type === 'error' ? chalk.red('✖') : type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
        console.log(`    ${icon} ${type}: ${count}`);
      }
    }

    if (Object.keys(stats.severityBreakdown).length > 0) {
      console.log(chalk.bold('\n  Severity / 严重程度:'));
      for (const [sev, count] of Object.entries(stats.severityBreakdown)) {
        const color = sev === 'high' ? chalk.red : sev === 'medium' ? chalk.yellow : chalk.blue;
        const sevLabel = sev === 'high' ? '严重' : sev === 'medium' ? '中等' : sev === 'low' ? '轻微' : sev;
        console.log(`    ${color('●')} ${sevLabel}: ${count}`);
      }
    }

    if (stats.trend.length > 0) {
      console.log(chalk.bold('\n  Trend (last ' + stats.trend.length + ' reviews):'));
      for (const t of stats.trend) {
        const bar = '█'.repeat(Math.max(1, Math.round(t.score / 10)));
        const color = t.score >= 80 ? chalk.green : t.score >= 50 ? chalk.yellow : chalk.red;
        console.log(`    ${t.date} ${color(bar)} ${t.score} (${t.issues} issues)`);
      }
    }
    console.log('');
  });

// ── Hook ──────────────────────────────────────────────────────
program
  .command('hook')
  .description('Install or remove a git hook (pre-commit / pre-push)')
  .argument('<action>', 'Action: install | remove')
  .argument('[hook-type]', 'Hook type: pre-commit | pre-push', 'pre-commit')
  .option('--min-score <number>', 'Minimum score to allow commit (default: 50)', '50')
  .action((action, hookType, options) => {
    const fs = require('fs');
    const gitDir = path.join(process.cwd(), '.git', 'hooks');
    const hookPath = path.join(gitDir, hookType);
    const minScore = options.minScore || '50';

    if (action === 'install') {
      if (!fs.existsSync(gitDir)) {
        console.error(chalk.red('✖ Not a git repository: ' + process.cwd()));
        process.exit(1);
      }

      const hookScript = `#!/bin/sh
# coderev ${hookType} hook
export PATH="$PATH:$(npm root -g)/../.bin"
echo "↻ Running coderev ${hookType} hook..."
coderev review --repo . --output markdown > /tmp/coderev-hook-report.md 2>/dev/null
SCORE=$(grep -oP 'Score: \\K\\d+' /tmp/coderev-hook-report.md || echo 0)
echo "Score: $SCORE/100"
MIN_SCORE=${minScore}
if [ "$SCORE" -lt "$MIN_SCORE" ]; then
  echo "✖ Score below threshold ($MIN_SCORE). Aborting ${hookType}."
  cat /tmp/coderev-hook-report.md
  exit 1
fi
`;

      fs.writeFileSync(hookPath, hookScript);
      try {
        fs.chmodSync(hookPath, '755');
      } catch {}
      console.log(chalk.green(`✔ ${hookType} hook installed at ${hookPath}`));
    } else if (action === 'remove') {
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
        console.log(chalk.green(`✔ ${hookType} hook removed`));
      } else {
        console.log(chalk.blue('   No hook to remove'));
      }
    } else {
      console.error(chalk.red('✖ Unknown action. Use "install" or "remove".'));
      process.exit(1);
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
        // 填入你的 API Key 或通过环境变量设置
        // apiKey: "sk-xxx",
        // apiKeyEnv: "DEEPSEEK_API_KEY",
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

    // Also create .coderevignore if it doesn't exist
    const ignorePath = path.join(process.cwd(), '.coderevignore');
    if (!fs.existsSync(ignorePath)) {
      const ignoreContent = `# coderev ignore list
# Files matching these patterns will be skipped during review.

*.min.js
*.bundle.js
package-lock.json
yarn.lock
vendor/
dist/
build/
`;
      fs.writeFileSync(ignorePath, ignoreContent);
      console.log(chalk.green(`✔ Default .coderevignore created at ${ignorePath}`));
    }

    // Also create .coderevhint if it doesn't exist
    const hintPath = path.join(process.cwd(), '.coderevhint');
    if (!fs.existsSync(hintPath)) {
      const hintContent = `# Project context for AI code review
# Describe your project here to get more relevant reviews.

## Project Overview
- Language: 
- Framework: 
- Build system:

## Conventions
- Prefer:
- Avoid:
`;
      fs.writeFileSync(hintPath, hintContent);
      console.log(chalk.green(`✔ Default .coderevhint created at ${hintPath}`));
    }
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
  // Chinese section
  const cnLines = [];
  cnLines.push(chalk.bold('\n📋 代码审查报告'));
  cnLines.push('━'.repeat(50));
  if (result.summary) cnLines.push('\n' + chalk.bold('摘要:') + ' ' + result.summary);
  if (result.score !== undefined && result.score !== null) {
    const color = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
    cnLines.push('\n' + chalk.bold('评分:') + ' ' + color(result.score + '/100'));
  }
  if (result.issues && result.issues.length > 0) {
    cnLines.push('\n' + chalk.bold('问题 (' + result.issues.length + '):'));
    for (const issue of result.issues) {
      const typeLabel = issue.type === 'error' ? chalk.red('✖') : issue.type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      const sevMap = { high: '严重', medium: '中等', low: '轻微' };
      const sevLabel = issue.severity && sevMap[issue.severity] ? ' [' + sevMap[issue.severity] + ']' : '';
      cnLines.push('  ' + typeLabel + sevLabel + ' ' + issue.message);
      if (issue.file) cnLines.push('     ' + chalk.gray('文件:') + ' ' + issue.file);
      if (issue.line) cnLines.push('     ' + chalk.gray('行号:') + ' ' + issue.line);
      if (issue.suggestion) cnLines.push('     ' + chalk.gray('建议:') + ' ' + issue.suggestion);
    }
  }
  if (result.suggestions && result.suggestions.length > 0) {
    cnLines.push('\n' + chalk.bold('改进建议:'));
    for (const s of result.suggestions) cnLines.push('  💡 ' + s);
  }
  if (result.praise && result.praise.length > 0) {
    cnLines.push('\n' + chalk.bold('👍 好的实践:'));
    for (const p of result.praise) cnLines.push('  ✅ ' + p);
  }
  cnLines.push('\n' + '━'.repeat(50));

  // English section
  const enLines = [];
  enLines.push(chalk.bold('\n📋 Code Review Report'));
  enLines.push('━'.repeat(50));
  if (result.summary) enLines.push('\n' + chalk.bold('Summary:') + ' ' + result.summary);
  if (result.score !== undefined && result.score !== null) {
    const color = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
    enLines.push('\n' + chalk.bold('Score:') + ' ' + color(result.score + '/100'));
  }
  if (result.issues && result.issues.length > 0) {
    enLines.push('\n' + chalk.bold('Issues (' + result.issues.length + '):'));
    for (const issue of result.issues) {
      const typeLabel = issue.type === 'error' ? chalk.red('✖') : issue.type === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      const sev = issue.severity ? ' [' + issue.severity + ']' : '';
      enLines.push('  ' + typeLabel + sev + ' ' + issue.message);
      if (issue.file) enLines.push('     ' + chalk.gray('File:') + ' ' + issue.file);
      if (issue.line) enLines.push('     ' + chalk.gray('Line:') + ' ' + issue.line);
      if (issue.suggestion) enLines.push('     ' + chalk.gray('Suggestion:') + ' ' + issue.suggestion);
    }
  }
  if (result.suggestions && result.suggestions.length > 0) {
    enLines.push('\n' + chalk.bold('Suggestions:'));
    for (const s of result.suggestions) enLines.push('  💡 ' + s);
  }
  if (result.praise && result.praise.length > 0) {
    enLines.push('\n' + chalk.bold('👍 Good Practices:'));
    for (const p of result.praise) enLines.push('  ✅ ' + p);
  }
  enLines.push('\n' + '━'.repeat(50));

  return cnLines.join('\n') + '\n' + enLines.join('\n');
}

function formatMarkdown(result) {
  // Chinese section
  let md = '# 📋 代码审查报告\n\n';
  if (result.summary) md += '**摘要:** ' + result.summary + '\n\n';
  if (result.score !== undefined) md += '**评分:** ' + result.score + '/100\n\n';
  if (result.issues?.length) {
    md += '## 问题 (' + result.issues.length + ')\n\n';
    for (const issue of result.issues) {
      const sevMap = { high: '严重', medium: '中等', low: '轻微' };
      const sevLabel = issue.severity && sevMap[issue.severity] ? ' [' + sevMap[issue.severity] + ']' : '';
      md += '- **' + issue.type.toUpperCase() + '**' + sevLabel + ': ' + issue.message + '\n';
      if (issue.file) md += '  - 文件: \`' + issue.file + '\`\n';
      if (issue.line) md += '  - 行号: ' + issue.line + '\n';
      if (issue.suggestion) md += '  - 建议: ' + issue.suggestion + '\n';
    }
  }
  if (result.suggestions?.length) {
    md += '\n## 改进建议\n\n';
    for (const s of result.suggestions) md += '- 💡 ' + s + '\n';
  }
  if (result.praise?.length) {
    md += '\n## 👍 好的实践\n\n';
    for (const p of result.praise) md += '- ✅ ' + p + '\n';
  }

  // English section
  md += '\n---\n\n';
  md += '# 📋 Code Review Report\n\n';
  if (result.summary) md += '**Summary:** ' + result.summary + '\n\n';
  if (result.score !== undefined) md += '**Score:** ' + result.score + '/100\n\n';
  if (result.issues?.length) {
    md += '## Issues (' + result.issues.length + ')\n\n';
    for (const issue of result.issues) {
      md += '- **' + issue.type.toUpperCase() + '**';
      if (issue.severity) md += ' [' + issue.severity + ']';
      md += ': ' + issue.message + '\n';
      if (issue.file) md += '  - File: \`' + issue.file + '\`\n';
      if (issue.line) md += '  - Line: ' + issue.line + '\n';
      if (issue.suggestion) md += '  - Suggestion: ' + issue.suggestion + '\n';
    }
  }
  if (result.suggestions?.length) {
    md += '\n## Suggestions\n\n';
    for (const s of result.suggestions) md += '- 💡 ' + s + '\n';
  }
  if (result.praise?.length) {
    md += '\n## 👍 Good Practices\n\n';
    for (const p of result.praise) md += '- ✅ ' + p + '\n';
  }

  return md;
}
