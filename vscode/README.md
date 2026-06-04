# coderev VS Code Extension

在 VS Code 内直接运行 coderev 多智能体代码审查，Security / Bug / Quality 三个 Agent 并行审查你的代码。

## 功能

- **审查整个工作区** — `Ctrl+Shift+P` → `coderev: Review Workspace`
- **审查当前文件** — `Ctrl+Shift+P` → `coderev: Review Current File`
- **自动修复** — `Ctrl+Shift+P` → `coderev: Auto-fix Current File`
- **保存时自动审查** — 开启 `coderev.autoReviewOnSave`
- **Problems 面板集成** — 审查结果直接显示在 VS Code Problems 面板
- **状态栏快捷入口** — 点击状态栏 `coderev` 图标即可审查

## 安装

### 前置要求

1. 安装 `coderev-cli` 命令行工具：

```bash
npm install -g coderev-cli
```

2. 配置 API 密钥（支持 DeepSeek 或 OpenAI）：

```bash
# 方式一：环境变量
export DEEPSEEK_API_KEY=your-api-key

# 方式二：VS Code 设置
# 打开 Settings → 搜索 "coderev" → 设置 Api Key
```

### 安装扩展

从 VS Code Marketplace 搜索 "coderev" 并安装，或从本目录手动安装：

```bash
cd vscode
npm install
npm run compile
npm run package
# 然后在 VS Code 中: Extensions → ... → Install from VSIX
```

## 配置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `coderev.provider` | `deepseek` | AI 提供商 |
| `coderev.model` | `deepseek-chat` | 模型名称 |
| `coderev.minConfidence` | `60` | 置信度阈值 (0-100) |
| `coderev.apiKey` | `""` | API 密钥（优先于环境变量） |
| `coderev.baseUrl` | `""` | 自定义 API 地址 |
| `coderev.enableProblemsPanel` | `true` | 在 Problems 面板显示问题 |
| `coderev.autoReviewOnSave` | `false` | 保存时自动审查 |

## 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| `coderev.review` | — | 审查整个工作区 |
| `coderev.reviewCurrentFile` | — | 审查当前打开的文件 |
| `coderev.fixCurrentFile` | — | AI 自动修复当前文件 |
| `coderev.stats` | — | 显示审查统计 |
| `coderev.configure` | — | 打开 coderev 设置 |

## 开发

```bash
npm install
npm run compile
# 按 F5 启动 Extension Development Host
```
