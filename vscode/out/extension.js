"use strict";
/**
 * coderev VS Code Extension
 *
 * Integration of coderev-cli review results inside VS Code.
 * Supports: workspace review, single-file review, auto-fix, on-save review,
 * and diagnostic display via Problems panel.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ——— Diagnostic Collection ———
let diagnosticCollection;
const CATEGORY_ICON = {
    security: '🔒',
    bug: '🐛',
    quality: '📐',
    performance: '⚡',
    style: '🎨'
};
const SEVERITY_MAP = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    info: vscode.DiagnosticSeverity.Information
};
// ——— Helpers ———
function getCoderevPath() {
    // Try global install first
    const isWindows = os.platform() === 'win32';
    const binName = isWindows ? 'coderev.cmd' : 'coderev';
    // Check common paths
    const globalPaths = [
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm', binName),
        path.join(os.homedir(), '.npm-global', 'bin', binName),
        '/usr/local/bin/coderev',
        '/opt/homebrew/bin/coderev',
    ];
    for (const p of globalPaths) {
        if (fs.existsSync(p))
            return p;
    }
    // Fall back to PATH lookup
    return isWindows ? 'coderev.cmd' : 'coderev';
}
function getWorkspaceDiffPath(workspaceRoot) {
    return workspaceRoot;
}
function formatIssueMarkdown(issue, idx) {
    const icon = CATEGORY_ICON[issue.category] || '📋';
    const severityBadge = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
    const agentTag = issue.agent.toUpperCase();
    const newTag = issue.isNew ? ' 🆕' : issue.isNew === false ? ' 📄' : '';
    let md = `### ${idx}. ${icon} ${severityBadge} [${issue.rule}] ${agentTag}${newTag}\n\n`;
    md += `**${issue.message}**\n\n`;
    if (issue.suggestion) {
        md += `> 💡 ${issue.suggestion}\n\n`;
    }
    md += `| 属性 | 值 |\n|---|---|\n`;
    md += `| 分类 | ${issue.category} |\n`;
    md += `| 严重度 | ${issue.severity} |\n`;
    md += `| 置信度 | ${issue.confidence}/100 |\n`;
    md += `| Agent | ${issue.agent} |\n`;
    if (issue.location) {
        md += `| 位置 | ${issue.location.file}:${issue.location.line} |\n`;
    }
    md += '\n---\n';
    return md;
}
function parseJsonOutput(stdout) {
    try {
        // Find JSON block in output
        const jsonMatch = stdout.match(/\{[\s\S]*"summary"[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    }
    catch {
        return null;
    }
}
function issuesToDiagnostics(issues) {
    const map = new Map();
    for (const issue of issues) {
        if (!issue.location)
            continue;
        const fileUri = vscode.Uri.file(issue.location.file);
        const key = fileUri.fsPath;
        if (!map.has(key))
            map.set(key, []);
        const range = new vscode.Range(new vscode.Position(Math.max(0, (issue.location.line || 1) - 1), issue.location.column || 0), new vscode.Position(Math.max(0, (issue.location.endLine || issue.location.line || 1) - 1), 999));
        const diagnostic = new vscode.Diagnostic(range, `[${issue.agent.toUpperCase()}] ${issue.message}`, SEVERITY_MAP[issue.severity] || vscode.DiagnosticSeverity.Information);
        diagnostic.source = `coderev (${issue.rule})`;
        diagnostic.code = `${issue.category}:${issue.rule}`;
        map.get(key).push(diagnostic);
    }
    return map;
}
// ——— Commands ———
async function runReview(reviewPath, context) {
    const config = vscode.workspace.getConfiguration('coderev');
    const provider = config.get('provider') || 'deepseek';
    const model = config.get('model') || 'deepseek-chat';
    const minConfidence = config.get('minConfidence') ?? 60;
    const apiKey = config.get('apiKey') || process.env.DEEPSEEK_API_KEY;
    const baseUrl = config.get('baseUrl');
    if (!apiKey) {
        vscode.window.showErrorMessage('coderev: No API key configured. Set `coderev.apiKey` in settings or DEEPSEEK_API_KEY environment variable.');
        return null;
    }
    const coderevPath = getCoderevPath();
    const args = [
        coderevPath,
        'review',
        reviewPath,
        '--provider', provider,
        '--model', model,
        '--min-confidence', String(minConfidence),
        '--json'
    ];
    const env = {
        ...process.env,
        DEEPSEEK_API_KEY: apiKey,
        ...(baseUrl ? { DEEPSEEK_BASE_URL: baseUrl } : {})
    };
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'coderev: Running code review...',
        cancellable: false
    }, async (_progress) => {
        try {
            // Use shell mode to find coderev in PATH
            const cmd = `"${coderevPath}" review "${reviewPath}" --provider ${provider} --model ${model} --min-confidence ${minConfidence} --json`;
            const { stdout } = await execAsync(cmd, {
                cwd: reviewPath,
                env,
                timeout: 120000,
                maxBuffer: 10 * 1024 * 1024
            });
            return parseJsonOutput(stdout);
        }
        catch (err) {
            vscode.window.showErrorMessage(`coderev review failed: ${err.message}`);
            console.error('coderev error:', err);
            return null;
        }
    });
}
async function reviewWorkspace(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage('coderev: No workspace folder open.');
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    // Check if git repo
    try {
        await execAsync('git rev-parse --git-dir', { cwd: rootPath });
    }
    catch {
        vscode.window.showWarningMessage('coderev: Workspace is not a git repository.');
        return;
    }
    const result = await runReview(rootPath, context);
    if (!result)
        return;
    showReviewResults(result, context);
}
async function reviewCurrentFile(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('coderev: No active editor.');
        return;
    }
    const filePath = editor.document.uri.fsPath;
    // Run review on just this file
    const result = await runReview(path.dirname(filePath), context);
    if (!result)
        return;
    // Filter issues for this file only
    const fileIssues = result.issues.filter(i => i.location && path.resolve(i.location.file) === path.resolve(filePath));
    const filteredResult = {
        ...result,
        issues: fileIssues,
        summary: {
            ...result.summary,
            totalIssues: fileIssues.length,
            security: fileIssues.filter(i => i.agent === 'security').length,
            bug: fileIssues.filter(i => i.agent === 'bug').length,
            quality: fileIssues.filter(i => i.agent === 'quality').length,
        }
    };
    showReviewResults(filteredResult, context);
}
async function fixCurrentFile(_context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('coderev: No active editor.');
        return;
    }
    const filePath = editor.document.uri.fsPath;
    const coderevPath = getCoderevPath();
    try {
        const { stdout } = await execAsync(`"${coderevPath}" fix "${filePath}"`, {
            cwd: path.dirname(filePath),
            env: {
                ...process.env,
                DEEPSEEK_API_KEY: vscode.workspace.getConfiguration('coderev').get('apiKey') || process.env.DEEPSEEK_API_KEY || ''
            },
            timeout: 120000,
            maxBuffer: 10 * 1024 * 1024
        });
        vscode.window.showInformationMessage('coderev: Fix applied. Check the file for changes.');
        // Show in output channel
        outputChannel.append(stdout);
        outputChannel.show(true);
    }
    catch (err) {
        vscode.window.showErrorMessage(`coderev fix failed: ${err.message}`);
    }
}
async function showStats(_context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return;
    const rootPath = workspaceFolders[0].uri.fsPath;
    const coderevPath = getCoderevPath();
    try {
        const { stdout } = await execAsync(`"${coderevPath}" stats "${rootPath}"`, {
            cwd: rootPath,
            timeout: 30000
        });
        outputChannel.append(stdout);
        outputChannel.show(true);
    }
    catch (err) {
        outputChannel.append(`Stats error: ${err.message}\n`);
        outputChannel.show(true);
    }
}
async function openSettings(_context) {
    vscode.commands.executeCommand('workbench.action.openSettings', 'coderev');
}
// ——— Results Display ———
let outputChannel;
function showReviewResults(result, context) {
    const s = result.summary;
    // 1. Show Problems Panel
    if (diagnosticCollection && vscode.workspace.getConfiguration('coderev').get('enableProblemsPanel')) {
        diagnosticCollection.clear();
        const diagMap = issuesToDiagnostics(result.issues);
        for (const [filePath, diags] of diagMap) {
            diagnosticCollection.set(vscode.Uri.file(filePath), diags);
        }
    }
    // 2. Show in Output Channel
    outputChannel.clear();
    outputChannel.appendLine('═'.repeat(60));
    outputChannel.appendLine('  coderev — Code Review Report');
    outputChannel.appendLine('═'.repeat(60));
    outputChannel.appendLine('');
    outputChannel.appendLine(`📊 Summary:`);
    outputChannel.appendLine(`   Total: ${s.totalIssues}  |  🔒 Security: ${s.security}  |  🐛 Bug: ${s.bug}  |  📐 Quality: ${s.quality}`);
    if (s.newIssues !== undefined || s.preExistingIssues !== undefined) {
        outputChannel.appendLine(`   🆕 New: ${s.newIssues ?? '-'}  |  📄 Pre-existing: ${s.preExistingIssues ?? '-'}`);
    }
    outputChannel.appendLine(`⏱ Duration: ${result.duration}  |  Mode: ${result.mode}`);
    outputChannel.appendLine('');
    if (result.issues.length === 0) {
        outputChannel.appendLine('✅ No issues found! Your code looks great.');
    }
    else {
        for (let i = 0; i < result.issues.length; i++) {
            outputChannel.appendLine(formatIssueMarkdown(result.issues[i], i + 1));
        }
    }
    outputChannel.appendLine('═'.repeat(60));
    outputChannel.show(true);
    // 3. Show notification summary
    const summaryMsg = `coderev: ${s.totalIssues} issue(s) found (🔒${s.security} 🐛${s.bug} 📐${s.quality})`;
    if (s.totalIssues > 0) {
        vscode.window.showWarningMessage(summaryMsg, 'Show Details', 'Go to Problems').then(choice => {
            if (choice === 'Show Details')
                outputChannel.show(true);
            if (choice === 'Go to Problems')
                vscode.commands.executeCommand('workbench.actions.view.problems');
        });
    }
    else {
        vscode.window.showInformationMessage('coderev: ✅ No issues found!');
    }
}
// ——— On-Save Auto Review ———
async function onDidSaveDocument(doc) {
    const config = vscode.workspace.getConfiguration('coderev');
    const autoReview = config.get('autoReviewOnSave') || config.get('reviewOnSave');
    if (!autoReview)
        return;
    // Only review if it's a code file
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.rb', '.java', '.c', '.cpp', '.h', '.cs', '.swift', '.kt', '.scala', '.php', '.vue', '.svelte'];
    const ext = path.extname(doc.fileName);
    if (!codeExtensions.includes(ext))
        return;
    try {
        const result = await runReview(path.dirname(doc.fileName), {});
        if (!result)
            return;
        // Filter to this file
        const fileIssues = result.issues.filter(i => i.location && path.resolve(i.location.file) === path.resolve(doc.fileName));
        // Update diagnostics for this file
        if (diagnosticCollection) {
            diagnosticCollection.delete(doc.uri);
            if (fileIssues.length > 0) {
                const diagMap = issuesToDiagnostics(fileIssues);
                const diags = diagMap.get(doc.uri.fsPath) || [];
                diagnosticCollection.set(doc.uri, diags);
            }
        }
        if (fileIssues.length > 0) {
            // Quiet notification - just update status bar
            statusBarItem.text = `$(warning) coderev: ${fileIssues.length} issue(s)`;
            statusBarItem.tooltip = `${fileIssues.length} issue(s) found on save. Click to show output.`;
            statusBarItem.backgroundColor = undefined;
        }
        else {
            statusBarItem.text = `$(check) coderev: clean`;
            statusBarItem.tooltip = 'No issues found on last save.';
        }
    }
    catch {
        // Silent fail on auto-review
    }
}
// ——— Status Bar ———
let statusBarItem;
function createStatusBar() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.text = `$(shield) coderev`;
    item.tooltip = 'Click to review workspace';
    item.command = 'coderev.review';
    item.show();
    return item;
}
// ——— Activation / Deactivation ———
function activate(context) {
    console.log('coderev extension activated');
    // Output channel
    outputChannel = vscode.window.createOutputChannel('coderev');
    // Diagnostics collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('coderev');
    context.subscriptions.push(diagnosticCollection);
    // Status bar
    statusBarItem = createStatusBar();
    context.subscriptions.push(statusBarItem);
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('coderev.review', () => reviewWorkspace(context)));
    context.subscriptions.push(vscode.commands.registerCommand('coderev.reviewCurrentFile', () => reviewCurrentFile(context)));
    context.subscriptions.push(vscode.commands.registerCommand('coderev.fixCurrentFile', () => fixCurrentFile(context)));
    context.subscriptions.push(vscode.commands.registerCommand('coderev.stats', () => showStats(context)));
    context.subscriptions.push(vscode.commands.registerCommand('coderev.configure', () => openSettings(context)));
    // Auto-review on save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onDidSaveDocument));
}
function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}
//# sourceMappingURL=extension.js.map