# coderev-cli

> 多智能体 AI 代码审查工具 — Security / Bug / Quality 三个 Agent 并行审查，带置信度评分和自动修复。

[![npm version](https://img.shields.io/npm/v/coderev-cli)](https://www.npmjs.com/package/coderev-cli)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/jishuanjimingtian)](https://github.com/sponsors/jishuanjimingtian)

---

> 🌟 **Support coderev!** If you find this tool useful, consider [sponsoring on GitHub](https://github.com/sponsors/jishuanjimingtian) or buying me a coffee.
>
> 如果这个工具对你有帮助，可以考虑[在 GitHub 上赞助](https://github.com/sponsors/jishuanjimingtian)支持持续开发！

---

## 目录

- [项目介绍](#项目介绍)
- [安装](#安装)
- [快速上手](#快速上手)
- [命令详解](#命令详解)
  - [coderev review（核心审查）](#coderev-review核心审查)
  - [coderev fix（自动修复）](#coderev-fix自动修复)
  - [coderev hook（Git Hooks）](#coderev-hookgit-hooks)
  - [coderev stats（统计看板）](#coderev-stats统计看板)
  - [coderev cache（缓存管理）](#coderev-cache缓存管理)
  - [coderev config（配置管理）](#coderev-config配置管理)
  - [coderev init（初始化）](#coderev-init初始化)
  - [coderev serve（GitHub App 自动审查）](#coderev-servegithub-app-自动审查)
- [配置详解](#配置详解)
- [平台集成](#平台集成)
- [CI/CD 集成](#cicd-集成)
- [FAQ / 常见问题](#faq--常见问题)

---

## 项目介绍

**coderev 是什么？**

coderev（Code Review 缩写）是一个**多智能体 AI 代码审查 CLI 工具**。你扔给它一段代码 diff，它会并行启动 3 个 AI Agent，从**安全、缺陷、质量**三个维度审查，然后汇总成结构化的审查报告。

**为什么要用 coderev？**

| 场景 | 不用 coderev | 用 coderev |
|------|-------------|-----------|
| 每次提交前 | 凭肉眼检查或忘了检查 | 自动跑三个维度审查 |
| 审查同事的 PR | 逐行看，容易漏 | AI 先扫一遍，你只看高置信度 issue |
| 安全审计 | 依赖经验，覆盖不全 | OWASP 级别检查 |
| 项目代码质量把控 | 看个人标准和心情 | 统一的规则引擎 + 置信度评分 |

**适用人群**
- 独立开发者 — 提交前自动把关，减少 Bug
- 团队/开源维护者 — PR 接入 AI 初审，提高审查效率
- CI/CD 流水线 — 集成到 CI，自动拦截高风险代码

---

## 安装

### 全局安装（推荐）

```bash
npm install -g coderev-cli
```

> **要求 Node.js >= 18**，可使用 `node -v` 检查版本。

### 验证安装

```bash
coderev --help
```

看到命令列表则安装成功。

### 更新

```bash
npm update -g coderev-cli
```

---

## 快速上手

### 第 1 步：初始化

在项目目录中执行，生成默认配置：

```bash
coderev init
```

会在当前目录创建 `.coderevrc.json` 配置文件。

### 第 2 步：设置 API Key

coderev 需要调用 AI API 来审查代码。支持 OpenAI 和 DeepSeek。

```bash
# Windows PowerShell
$env:DEEPSEEK_API_KEY="sk-your-key-here"

# Linux / macOS
export DEEPSEEK_API_KEY="sk-your-key-here"
```

也可以写入配置文件（见下方「配置详解」）。

### 第 3 步：运行审查

#### 审查暂存区变更（最常用的方式）

```bash
git add .
coderev review
```

#### 审查当前分支的未提交变更

```bash
coderev review --diff
```

#### 审查某个 commit

```bash
coderev review --commit HEAD~1
```

#### 审查 PR

```bash
coderev review --pr 42
```

### 第 4 步：查看报告

审查结果会直接输出在终端。如果开启 HTML 模式，可以生成可视化报告：

```bash
coderev review --output html > report.html
# 浏览器打开 report.html
```

---

## 命令详解

### coderev review（核心审查）

**作用**：审查代码差异并输出审查报告。这是 coderev 最核心的命令。

**使用方式**：

```bash
coderev review [选项]
```

**默认可选参数**：

| 参数 | 说明 | 示例 |
|------|------|------|
| `--diff` | 审查当前分支未提交的变更（与最近 commit 对比） | `coderev review --diff` |
| `--commit <ref>` | 审查指定 commit | `coderev review --commit abc123` |
| `--staged` | 审查暂存区（默认行为） | `coderev review` |
| `--single` | 单 Agent 模式（只用 1 个 Agent，省 token，v0.2 兼容） | `coderev review --single` |
| `--min-confidence <0-100>` | 置信度阈值，低于此值的结果不显示（默认 60） | `coderev review --min-confidence 80` |
| `--no-cache` | 跳过缓存，强制重新审查 | `coderev review --no-cache` |
| `--format <format>` | 输出格式：`terminal`（终端） / `json` / `html` / `markdown` | `coderev review --format json` |
| `--output <type>` | 输出方式：`terminal`（终端）/ `json` / `html` / `markdown` | `coderev review --output html` |
| `--audit` | 安全审计模式，重点关注安全问题 | `coderev review --audit` |
| `--incremental` | 增量模式，只审查 diff 中新增和变更的行（忽略删除的行） | `coderev review --incremental` |
| `--interactive` | 交互式模式，逐条审查 issue 并选择是否修复 | `coderev review --interactive` |
| `--ci` | CI 模式，发现问题时以非零退出码终止 | `coderev review --ci` |
| `--pr <value>` | 审查 Pull Request，格式 `owner/repo#number` 或仅 `number`（自动检测仓库） | `coderev review --pr jishuanjimingtian/coderev#42` |
| `--post` | 审查 PR 后自动回贴评论（需配合 `--pr`） | `coderev review --pr 42 --post` |
| `--inline` | 审查 PR 后以行内方式回贴评论（需配合 `--pr`） | `coderev review --pr 42 --inline` |

**使用示例**：

```bash
# 最简用法：审查暂存区
coderev review

# 审查某个 PR 并回贴评论
coderev review --pr jishuanjimingtian/coderev#42 --post

# 终端输出 + 高置信度要求（减少误报）
coderev review --min-confidence 80

# CI 中使用，发现问题就报错
coderev review --ci --min-confidence 70

# 生成 HTML 报告
coderev review --format html > review-report.html

# 交互式审查并修复
coderev review --interactive

# 只审查新增的代码（增量模式）
coderev review --incremental

# 通过管道传入 diff（支持任意 diff 输入）
git diff main | coderev review
```

#### --interactive 交互式修复详解

**作用**：逐条展示每个审查发现的问题，让你决定是否用 AI 生成补丁自动修复。

**工作流程**：

```
coderev review --interactive
```

终端会依次展示每个 issue：

```
Issue #1 of 3
● [high] [error] SQL injection risk in query construction
  File: src/db.js:42
  Suggestion: Use parameterized queries
  
  [a]pply fix / [s]kip / [q]uit > a
```

**交互选项**：

| 按键 | 作用 |
|------|------|
| `a` | Apply fix — AI 生成补丁并应用到文件 |
| `s` | Skip — 跳过当前 issue |
| `q` | Quit — 退出交互模式 |

#### --ci CI 模式详解

**作用**：专为 CI/CD 管道设计。如果代码中发现任何 issue（且置信度高于阈值），coderev 以非零退出码退出，中断管道执行。

```bash
# 常规使用
coderev review --ci

# 配合高阈值，只拦截确定严重的问题
coderev review --ci --min-confidence 80

# 结合 JSON 输出，供上游 CI 脚本处理
coderev review --ci --format json
```

**在 CI 配置中的用法**（例如 GitHub Actions）：

```yaml
- name: coderev check
  run: |
    git fetch origin main
    git diff origin/main...HEAD | coderev review --ci
```

#### --incremental 增量审查详解

**作用**：默认情况下，coderev 会审查整个 diff 的上下文。增量模式下，**只关注新增和修改的行**，忽略被删除的旧代码。适用于：

- 大型代码库重构，不想看大段删除
- 只想关注"引入的新代码"是否有问题
- PR 审查时快速聚焦变更内容

```bash
coderev review --incremental
```

#### HTML 报告

**作用**：生成可视化的 HTML 审查报告，支持深色/浅色模式自动适配，方便分享或归档。

```bash
coderev review --output html > report.html
```

---

### coderev fix（自动修复）

**作用**：根据审查结果生成补丁文件，或直接应用到代码中。

```bash
coderev fix --file <diff文件>
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `--file <path>` | **必填**，指定包含 diff 的文件路径 | `coderev fix --file changes.diff` |
| `--apply` | 生成补丁后**直接应用到文件** | `coderev fix --file changes.diff --apply` |

**使用示例**：

```bash
# 先生成 diff
git diff > changes.diff

# 审查并生成修复建议（不自动应用）
coderev fix --file changes.diff

# 审查并直接应用补丁
coderev fix --file changes.diff --apply
```

---

### coderev hook（Git Hooks）

**作用**：安装 Git hooks，让你在 git 操作时自动触发代码审查。支持 pre-commit（提交前）和 pre-push（推送前）。

```bash
coderev hook install [hook类型] [选项]
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `install` | 安装 hook | `coderev hook install` |
| `install pre-commit` | 安装 pre-commit hook（提交前审查） | `coderev hook install pre-commit` |
| `install pre-push` | 安装 pre-push hook（推送前审查） | `coderev hook install pre-push` |
| `--min-score <number>` | 设置最低置信度阈值 | `coderev hook install pre-commit --min-score 70` |
| `remove` | 移除已安装的 hook | `coderev hook remove` |

**使用示例**：

```bash
# 安装默认 hook（pre-commit）
coderev hook install

# 安装 pre-commit，设置置信度 70
coderev hook install pre-commit --min-score 70

# 安装 pre-push
coderev hook install pre-push

# 移除所有 hook
coderev hook remove
```

**安装后效果**：
- `git commit` 时 → 自动审查暂存区代码，发现问题会阻止提交
- `git push` 时 → 自动审查将要推送的变更

---

### coderev stats（统计看板）

**作用**：查看代码审查的历史统计，包括审查次数、发现的 issue 数量、类型分布等。

```bash
coderev stats [周期]
```

| 参数 | 说明 | 示例 |
|------|------|------|
| （无参数） | 查看总体统计数据 | `coderev stats` |
| `week` | 本周统计 | `coderev stats week` |
| `month` | 本月统计 | `coderev stats month` |

**输出示例**（实际内容取决于缓存数据）：

```
📊 coderev 统计
═══════════════════
总审查次数: 47
总发现 issue: 156
  安全: 23 (14.7%)
  缺陷: 67 (42.9%)
  质量: 66 (42.3%)
═══════════════════
```

---

### coderev cache（缓存管理）

**作用**：管理审查结果缓存，避免重复审查相同的代码。

```bash
coderev cache <子命令>
```

| 子命令 | 说明 | 示例 |
|--------|------|------|
| `status` | 查看缓存状态（缓存条目数、过期时间） | `coderev cache status` |
| `clear` | 清空所有缓存 | `coderev cache clear` |

**缓存机制**：
- 基于代码 diff 的 SHA256 哈希值
- 缓存有效期 24 小时
- 同段代码反复审查时直接返回缓存结果，节省 API 调用

---

### coderev config（配置管理）

**作用**：查看或管理当前配置。

```bash
coderev config <子命令>
```

| 子命令 | 说明 | 示例 |
|--------|------|------|
| `show` | 显示当前生效的完整配置 | `coderev config show` |

---

### coderev init（初始化）

**作用**：在当前项目目录生成 `.coderevrc.json` 配置文件。

```bash
coderev init
```

生成的文件内容：

```json
{
  "ai": {
    "provider": "deepseek",
    "temperature": 0.3,
    "maxTokens": 4096
  },
  "rules": {
    "maxLineLength": 100,
    "predefined": ["security", "performance", "style"]
  }
}
```

如果项目已有配置文件，执行 `coderev init` 会提示是否覆盖。

---

### coderev serve（GitHub App 自动审查）

**作用**：启动 webhook 服务器，监听 GitHub App 的 pull_request 事件，自动对每个新 PR 进行代码审查。

**适用场景**：团队仓库每个 PR 自动审查 / 开源项目自动反馈 / CI/CD 增强

**参数**：

| 参数 | 说明 | 示例 |
|------|------|------|
| `--port` | 服务器端口（默认 3000） | `--port 8080` |
| `--app-id` | GitHub App ID | `--app-id 123456` |
| `--private-key` | GitHub App 私钥 PEM | `--private-key "$(cat key.pem)"` |
| `--webhook-secret` | Webhook 签名密钥 | `--webhook-secret xxx` |
| `--review-mode` | 审查模式（comment/inline/check） | `--review-mode inline` |
| `--auto-approve` | 无问题 PR 自动 approve | `--auto-approve` |
| `--min-confidence` | 最低置信度阈值 | `--min-confidence 70` |

**示例**：

```bash
# 启动服务器
coderev serve --app-id 123456 --webhook-secret mysecret --private-key "$(cat /path/to/key.pem)"

# 使用环境变量
GITHUB_APP_ID=123456 GITHUB_APP_WEBHOOK_SECRET=mysecret coderev serve
```

**事件处理**：
- `pull_request.opened` — 新 PR 自动审查
- `pull_request.synchronize` — PR 更新时重新审查
- `pull_request.reopened` — 重新审查
- Draft PR 和 Bot PR 默认跳过

**输出**：审查完成后自动：
1. 发布 PR review comment（Markdown 格式）
2. 设置 commit status（pending → success/failure/neutral）
3. 可选 auto-approve（无问题的 PR）

> 完整部署指南见 [docs/github-app.md](docs/github-app.md)

---

## 配置详解

### 配置加载顺序

coderev 按以下优先级加载配置（高的优先）：

1. **CLI 参数**（命令行传入）
2. **配置文件**（`.coderevrc.json` / `.coderevrc` / `coderev.config.json`）
3. **环境变量**（环境变量中设置的 API Key）
4. **默认值**

配置文件会自动从**当前目录向父目录逐级查找**，找到第一个便停止。

### 完整配置项参考

```json
{
  "ai": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "temperature": 0.3,
    "maxTokens": 4096,
    "apiKey": "",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "baseURL": ""
  },
  "rules": {
    "maxLineLength": 100,
    "predefined": ["security", "performance", "style"],
    "autoLanguage": true,
    "custom": []
  },
  "output": {
    "format": "terminal",
    "includeScore": true
  }
}
```

#### ai（AI 配置）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `provider` | string | `"openai"` | AI 提供商，支持 `"openai"` / `"deepseek"` |
| `model` | string | 取决于 provider | 模型名称 |
| `temperature` | number | `0.3` | 生成温度（0-1），越低越确定越保守 |
| `maxTokens` | number | `4096` | 每次请求最大输出 token 数 |
| `apiKey` | string | `""` | 直接在配置文件中写入 API Key |
| `apiKeyEnv` | string | `"OPENAI_API_KEY"` | 读取环境变量中的 API Key |
| `baseURL` | string | `""` | 自定义 API 地址，兼容 OpenAI 协议的任何服务 |

**支持的 Provider 默认值**：

| provider | 默认模型 | 默认 API 地址 |
|----------|---------|--------------|
| `openai` | `gpt-4o` | `https://api.openai.com` |
| `deepseek` | `deepseek-chat` | `https://api.deepseek.com` |

**对接任意兼容 OpenAI API 的服务**（如 Azure OpenAI、本地 LLM）：

```json
{
  "ai": {
    "provider": "openai",
    "baseURL": "https://your-custom-endpoint.com/v1",
    "apiKey": "sk-your-key"
  }
}
```

#### rules（规则引擎配置）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxLineLength` | number | `100` | 最大行长度检查，超过会警告 |
| `predefined` | string[] | `["security","performance","style"]` | 启用的预定义规则集 |
| `autoLanguage` | boolean | `true` | 是否自动检测 diff 语言并追加专项规则 |
| `custom` | object[] | `[]` | 自定义规则数组 |

**预定义规则集一览**：

通过配置 `rules.predefined` 数组，可以自由组合启用以下规则集：

| 名称 | 检查重点 |
|------|---------|
| `security` | SQL/NoSQL 注入、XSS、SSRF、CSRF、硬编码密钥、认证缺陷、授权缺失 |
| `performance` | 不必要的循环、大对象未释放、N+1 查询、内存泄漏、冗余计算 |
| `style` | 空格/缩进不统一、未使用的 import/变量、分号规范、命名约定 |
| `typescript` | 非严格模式、滥用 any、泛型使用不当、类型断言滥用、枚举误用 |
| `react` | hooks 规则违反、缺少 key props、函数组件命名、副作用清理 |
| `node` | 未捕获异常、异步回调链、文件 I/O 未关闭、路径遍历 |
| `naming` | 驼峰 vs 帕斯卡命名规范、常量大写、函数命名动词化 |
| `testing` | 断言覆盖不足、边界条件缺失、测试间耦合、输出不明确 |

**启用示例**：

```json
{
  "rules": {
    "predefined": ["security", "typescript", "react", "naming", "testing"]
  }
}
```

#### rules.autoLanguage 自动语言检测

coderev 会自动检查 diff 中文件的扩展名，追加对应的语言专项规则：

| 语言 | 扩展名 | 检查重点 |
|------|--------|---------|
| JavaScript | `.js`, `.jsx`, `.mjs` | async/await 链、== vs ===、内存泄漏、循环依赖 |
| TypeScript | `.ts`, `.tsx` | strict 模式、禁止 any、泛型约束、类型断言 |
| Python | `.py` | PEP 8 规范、异常类型指定、mutable 默认参数、async 用法 |
| Rust | `.rs` | unsafe 块审计、unwrap/expect 滥用、ownership 问题 |
| Go | `.go` | error 忽略、goroutine 泄漏、context 传播、data race |
| Java | `.java` | null 处理、checked exception、== vs .equals()、线程安全 |
| SQL | `.sql` | 注入防护、N+1 查询、索引缺失、大 IN-clause |

可通过 `rules.autoLanguage: false` 关闭此功能。

#### rules.custom 自定义规则

**作用**：针对团队或项目的特定规范，编写专属审查规则。

```json
{
  "rules": {
    "custom": [
      {
        "name": "no-console-log",
        "severity": "warning",
        "message": "避免在生产代码中使用 console.log"
      },
      {
        "name": "require-error-boundary",
        "severity": "error",
        "message": "React 组件必须包裹 ErrorBoundary",
        "filePattern": "src/components/**/*.jsx"
      },
      {
        "name": "single-quote-string",
        "severity": "warning",
        "message": "请使用单引号",
        "filePattern": "src/**/*.ts"
      }
    ]
  }
}
```

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 规则名称 |
| `severity` | ✅ | string | `"error"` / `"warning"` / `"info"` |
| `message` | ✅ | string | 审查时显示的提示文字 |
| `filePattern` | ❌ | string | 可选，限定生效的文件 glob 模式，如 `src/**/*.ts` |
| `enabled` | ❌ | boolean | 可选，设为 `false` 可临时禁用此规则 |

#### output（输出配置）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `format` | string | `"terminal"` | 输出格式：`"terminal"` / `"json"` / `"html"` / `"markdown"` |
| `includeScore` | boolean | `true` | 是否显示置信度评分 |

### .coderevignore 忽略文件

**作用**：指定 coderev 审查时跳过哪些文件或目录。

在项目根目录创建 `.coderevignore` 文件，语法同 `.gitignore`（glob 模式）：

```
# coderev ignore list
*.min.js
*.bundle.js
package-lock.json
yarn.lock
vendor/
dist/
build/
```

### .coderevhint 项目上下文

**作用**：给 AI 审查引擎提供项目背景，让它更准确理解你的代码。

在项目根目录创建 `.coderevhint` 文件：

```
# 项目概况
- Language: TypeScript
- Framework: Next.js 14
- Database: PostgreSQL

# 编码规范
- Prefer: 函数式组件、Tailwind CSS、Server Actions
- Avoid: any 类型、使用 any 断言
```

也兼容 `CLAUDE.md` 格式，两者可共存。

### API Key 配置方式对比

| 方式 | 安全性 | 适用场景 | 配置方法 |
|------|--------|---------|---------|
| 环境变量 | ✅ 最安全（不落盘） | 本地开发、CI 环境 | `$env:OPENAI_API_KEY="..."` |
| 配置文件直接写 | ⚠️ 注意.gitignore | 本地个人使用 | `"apiKey": "..."` |
| 配置文件引用 env | ✅ 安全 + 方便 | 推荐方式 | `"apiKeyEnv": "DEEPSEEK_API_KEY"` |

> **推荐做法**：环境变量 + `apiKeyEnv`。既不在代码中暴露 key，又无需每次都手动设置。

---

## 平台集成

### 支持的 Git 平台

coderev 支持四大平台，均支持 PR 审查和评论回贴：

| 平台 | PR 审查 | 摘要评论 | 行内评论 | 自动检测 |
|------|:-------:|:--------:|:--------:|:--------:|
| GitHub | ✅ | ✅ | ✅ | ✅ |
| GitLab | ✅ | ✅ | ✅ | ✅ |
| Gitee | ✅ | ✅ | ❌ | ❌ 需完整格式 |
| Bitbucket | ✅ | ✅ | ❌ | ❌ 需完整格式 |

**使用方式**：

```bash
# GitHub — 自动检测当前仓库
coderev review --pr 42

# 指定仓库（其他平台或跨平台）
coderev review --pr owner/repo#42

# 审查 + 回贴评论
coderev review --pr 42 --post

# 审查 + 行内评论（仅 GitHub/GitLab）
coderev review --pr 42 --inline
```

---

## CI/CD 集成

### GitHub Actions

项目初始化时自动生成 `.github/workflows/coderev-review.yml`，在 PR 创建或更新时自动触发代码审查。

**工作流说明**：
- 触发条件：PR 打开、同步、重新打开
- 执行内容：对比 PR 的 diff → coderev 审查 → 结果回贴到 PR 评论
- 效果：每个 PR 自动获得一份 AI 审查报告

或使用 GitHub Actions Marketplace 中的 Action：

```yaml
steps:
  - uses: jishuanjimingtian/coderev@v1
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
      api-key: ${{ secrets.DEEPSEEK_API_KEY }}
```

### GitLab CI

使用 `coderev init --gitlab-ci` 一键生成配置，或直接将 `templates/.gitlab-ci.yml` 复制到项目根目录。

**变量配置**（GitLab → Settings → CI/CD → Variables）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | ✅ | AI 提供商的 API Key |
| `GITLAB_TOKEN` | 可选 | GitLab PAT（api scope），用于自动发布 MR 评论 |
| `CODEREV_CONFIDENCE` | 可选 | 置信度阈值，默认 60 |
| `CODEREV_MODE` | 可选 | 审查模式：full / security / bugs / quality |
| `CODEREV_BLAME` | 可选 | 启用 git blame：true / false |
| `CODEREV_BLOCK` | 可选 | 发现问题时阻塞 MR：true / false |

**工作流过程**：
1. MR 创建/更新时自动触发
2. 生成 MR diff → coderev 3 Agent 并行审查
3. 审查结果作为 MR 评论自动发布（需 GITLAB_TOKEN）
4. 如开启 `CODEREV_BLOCK`，发现问题时 pipeline 失败

### 自定义 CI 集成

在任意 CI 管道中：

```bash
# 对比当前分支与 main
git fetch origin main
git diff origin/main...HEAD | coderev review --ci --min-confidence 70
```

如果代码存在高置信度问题，管道会以非零退出码中断，阻止合并。

---

## 架构

```
   你的代码 (git diff / PR)
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐
│  🔒  ││  🐛  ││  📐  │
│ 安全  ││ 缺陷  ││ 质量  │
│ 审计  ││ 检测  ││ 检查  │
└──┬───┘└──┬───┘└──┬───┘
   │       │       │
   └───────┼───────┘
           ▼
    ┌──────────┐
    │ 合并 &    │
    │ 置信度评分 │
    │ (0-100)   │
    └────┬─────┘
         ▼
  结构化审查报告
```

| Agent | 专注领域 |
|-------|---------|
| 🔒 安全审计 | SQL注入、XSS、SSRF、硬编码密钥、认证缺陷 |
| 🐛 缺陷检测 | 空指针、竞态条件、异步问题、逻辑错误 |
| 📐 质量检查 | 代码复杂度、DRY、命名规范、异常处理 |

每个 issue 附带**置信度评分 (0-100)**，低于阈值（默认 60）自动过滤。多 Agent 发现的重复问题自动合并去重。

---

## FAQ / 常见问题

### Q：为什么审查结果为空？
A：可能是代码本身没有问题，也可能是置信度低于阈值。可以尝试 `coderev review --min-confidence 0` 查看所有结果。

### Q：怎么换 API Key？
A：重新设置环境变量即可，或在 `.coderevrc.json` 中修改 `ai.apiKey` / `ai.apiKeyEnv`。

### Q：不想用 DeepSeek，想用其他 AI？
A：改成 `provider: "openai"`，再设置 `apiKeyEnv: "OPENAI_API_KEY"`。如果用的是兼容 OpenAI 协议的自定义 API，设置 `baseURL` 即可。

### Q：coderev 会泄漏我的代码吗？
A：代码通过你的 API Key 发送到 AI 服务商。coderev 本身不会存储或转发你的代码。本地缓存仅存储在你自己机器上。

### Q：缓存能关掉吗？
A：可以，审查时加 `--no-cache` 参数即可跳过缓存。

### Q：怎么给 coderev 加自己的规则？
A：在 `.coderevrc.json` 的 `rules.custom` 数组中添加。详见上方「自定义规则」章节。

---
## Contributing

欢迎贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
