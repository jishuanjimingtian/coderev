# coderev-cli

> 多智能体 AI 代码审查工具 — Security / Bug / Quality 三个 Agent 并行审查，带置信度评分。

[![npm version](https://img.shields.io/npm/v/coderev-cli)](https://www.npmjs.com/package/coderev-cli)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/jishuanjimingtian)](https://github.com/sponsors/jishuanjimingtian)

---

> 🌟 **Support coderev!** If you find this tool useful, consider [sponsoring on GitHub](https://github.com/sponsors/jishuanjimingtian) or buying me a coffee.
>
> 如果这个工具对你有帮助，可以考虑[在 GitHub 上赞助](https://github.com/sponsors/jishuanjimingtian)支持持续开发！

---

## 安装

```bash
npm install -g coderev-cli
```

> **Node.js 版本要求：>= 18**

```bash
# 验证版本
node -v
```

---

## 快速上手

```bash
# 1. 初始化项目配置
coderev init

# 2. 设置 API Key（支持 DeepSeek / OpenAI）
# Linux / macOS:
export DEEPSEEK_API_KEY="***"
# Windows PowerShell:
$env:DEEPSEEK_API_KEY="***"

# 3. 审查暂存区变更
coderev review

# 4. 或传入 git diff
git diff main | coderev review

# 5. 或审查 PR
coderev review --pr owner/repo#42
```

---

## 架构

```
   你的代码 (git diff)
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

## CLI 命令参考

### review

```bash
coderev review                           # 多 Agent 并行审查（默认）
coderev review --min-confidence 80       # 提高阈值，减少误报
coderev review --single                  # 单 Agent 模式（v0.2 兼容，更省）
coderev review --audit                   # 安全审计模式（OWASP 级）
coderev review --no-cache                # 跳过缓存
coderev review --format json             # JSON 输出
coderev review --format html             # HTML 报告输出
coderev review --incremental             # 只审查 diff 新增/变更行
coderev review --interactive             # 交互式逐条修复问题
coderev review --ci                      # CI 模式（发现问题则 exit code 1）
```

### interactive 交互式修复

`--interactive` 模式让你逐一审查每个 issue，选择修复（AI 生成补丁）或跳过：

```bash
coderev review --interactive
# 输出示例:
# Issue #1 of 3
# ● [high] [error] SQL injection risk in query construction
# File: src/db.js:42
# Suggestion: Use parameterized queries
# [a]pply fix / [s]kip / [q]uit > a
```

### CI 模式

`--ci` 模式用于 CI/CD 管道，发现问题时以非零退出码终止：

```bash
coderev review --ci --min-confidence 70
coderev review --ci --output json       # 结合 JSON 输出用于上游处理
```

### HTML 报告

生成漂亮的可视化 HTML 报告：

```bash
coderev review --output html > report.html
# 支持深色/浅色模式自动适配
```

### 增量审查

只关注 diff 中新增和修改的行，忽略移除的上下文：

```bash
coderev review --incremental
```

### fix

```bash
coderev fix --file changes.diff          # 自动修复建议
coderev fix --file changes.diff --apply  # 生成并应用补丁
```

### PR 审查

```bash
coderev review --pr owner/repo#42              # 审查外部 PR
coderev review --pr 42                          # 自动检测当前仓库
coderev review --pr owner/repo#42 --post        # 审查 + 贴评论
coderev review --pr owner/repo#42 --inline      # 行内评论
coderev review --pr owner/repo#42 --format json
```

### Git Hooks

```bash
coderev hook install                         # 安装 pre-commit
coderev hook install pre-commit --min-score 70
coderev hook install pre-push
```

### 其他

```bash
coderev stats                                # 统计看板
coderev stats week                           # 本周统计
coderev cache status                         # 缓存状态
coderev cache clear                          # 清空缓存
coderev config show                          # 查看配置
```

---

## 配置管理

coderev 支持三种配置方式（优先级从高到低），建议用配置文件，一劳永逸。

### 方式一：全局配置文件

在项目根目录创建 `.coderevrc.json`，coderev 会自动从当前目录向父目录逐级查找。也支持 `.coderevrc` 或 `coderev.config.json` 作为文件名。

```bash
# 一键生成默认配置
coderev init
```

### 方式二：环境变量

适用于临时测试或 CI 环境：
```bash
# Linux / macOS
export DEEPSEEK_API_KEY="sk-xxx"
export OPENAI_API_KEY="sk-xxx"

# Windows PowerShell
$env:DEEPSEEK_API_KEY="sk-xxx"
```

默认读取 `OPENAI_API_KEY`，如需改用 `DEEPSEEK_API_KEY`，在配置文件中设置：
```json
{
  "ai": {
    "apiKeyEnv": "DEEPSEEK_API_KEY"
  }
}
```

### 方式三：配置文件内直接写 Key

```json
{
  "ai": {
    "apiKey": "sk-xxx"
  }
}
```
> ⚠️ 注意：不要在公开仓库中提交含 Key 的配置文件，建议配合 `.gitignore` 或使用环境变量。

---

### 完整配置项说明

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
    "custom": [
      {
        "name": "no-console-log",
        "severity": "warning",
        "message": "避免在生产代码中使用 console.log",
        "filePattern": "src/**/*.js"
      }
    ]
  },
  "output": {
    "format": "terminal",
    "includeScore": true
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ai.provider` | string | `"openai"` | AI 提供商，支持 `"openai"` / `"deepseek"` |
| `ai.model` | string | 取决于 provider | 模型名称（openai 默认 `gpt-4o`，deepseek 默认 `deepseek-chat`）|
| `ai.temperature` | number | `0.3` | 生成温度，越低越确定（0-1） |
| `ai.maxTokens` | number | `4096` | 每次请求最大 token 数 |
| `ai.apiKey` | string | `""` | 直接在配置文件中写入 API Key |
| `ai.apiKeyEnv` | string | `"OPENAI_API_KEY"` | 从环境变量读取 Key 的变量名 |
| `ai.baseURL` | string | `""` | 自定义 API 地址（兼容 OpenAI 协议的任意服务） |
| `rules.maxLineLength` | number | `100` | 最大行长度检查 |
| `rules.predefined` | string[] | `["security","performance","style"]` | 启用的预定义规则集 |
| `rules.autoLanguage` | boolean | `true` | 是否自动检测 diff 语言并追加专项规则 |
| `rules.custom` | object[] | `[]` | 自定义规则数组 |
| `output.format` | string | `"terminal"` | 输出格式：`"terminal"` / `"markdown"` / `"json"` |
| `output.includeScore` | boolean | `true` | 是否显示评分 |

### 支持的 Provider

| provider | 默认模型 | 默认 API 地址 |
|----------|---------|--------------|
| `openai` | `gpt-4o` | `https://api.openai.com` |
| `deepseek` | `deepseek-chat` | `https://api.deepseek.com` |

通过 `ai.baseURL` 可对接任何兼容 OpenAI 协议的 API 服务（如 Azure OpenAI、本地 LLM 等）。

---

### 预定义规则集

`rules.predefined` 数组中可以启用以下规则集：

| 名称 | 说明 |
|------|------|
| `security` | 安全检查：注入、XSS、认证缺陷、密钥泄露 |
| `performance` | 性能检查：不必要的循环、内存泄漏、N+1 查询 |
| `style` | 代码风格：空格、import、未使用变量 |
| `typescript` | TypeScript 最佳实践（strict 模式、泛型、类型断言） |
| `react` | React 最佳实践（hooks 规则、key props、组件命名） |
| `node` | Node.js 最佳实践（错误处理、async 模式、文件安全） |
| `naming` | 命名规范（camelCase、PascalCase、常量大写） |
| `testing` | 测试质量（断言覆盖、边界情况、测试隔离） |

---

### 自定义规则

在 `rules.custom` 中定义专属规则：

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
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `name` | 规则名称 |
| `severity` | 严重级别：`"error"` / `"warning"` / `"info"` |
| `message` | 审查时的提示文字 |
| `filePattern` | 可选，限定生效的文件 glob 模式 |
| `enabled` | 可选，设为 `false` 可临时禁用 |

---

### 语言专项规则

coderev 自动从 diff 文件扩展名检测语言，追加专项检查（可通过 `rules.autoLanguage: false` 关闭）：

| 语言 | 检查重点 |
|------|---------|
| JavaScript | async/await 链、== vs ===、内存泄漏、import 循环依赖 |
| TypeScript | strict 模式、避免 any、泛型、类型断言 |
| Python | PEP 8、except 类型、mutable 默认参数、async 用法 |
| Rust | unsafe 审计、unwrap/expect、生命周期、ownership |
| Go | error handling、goroutine 安全、context 传播、data race |
| Java | null 处理、checked exception、== vs .equals()、线程安全 |
| SQL | 注入防护、N+1 查询、索引缺失、大 IN-clause |

---

### .coderevignore：忽略文件

不想被审查的文件，在 `.coderevignore` 中列出（glob 模式）：

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

---

### .coderevhint：项目上下文

给 AI 审查提供项目背景，让它更懂你的代码：

```
# 项目概况
- Language: TypeScript
- Framework: Next.js 14
- Database: PostgreSQL

# 编码规范
- Prefer: 函数式组件、Tailwind CSS、Server Actions
- Avoid: any 类型、使用 any 断言
```

兼容 `CLAUDE.md` 格式，两者可共存。

---

## 支持的 Git 平台

| 平台 | PR 审查 | 评论回贴 |
|------|---------|---------|
| GitHub | ✅ | ✅ 行内 / 摘要 |
| GitLab | ✅ | ✅ |
| Gitee  | ✅ | ✅ |
| Bitbucket | ✅ | ✅ |

---

## 缓存

- SHA256 摘要哈希
- 24 小时 TTL
- `coderev cache status` / `coderev cache clear`

---

## CI / GitHub Actions

内置工作流文件 `.github/workflows/coderev-review.yml`，PR 自动审查。

---

## 项目结构

```
coderev/
├── src/
│   ├── cli.js          # CLI 入口
│   ├── reviewer.js     # 多 Agent 审查核心
│   ├── config.js       # 配置加载
│   ├── github.js       # GitHub API
│   ├── gitlab.js       # GitLab API
│   ├── gitee.js        # Gitee API
│   ├── bitbucket.js    # Bitbucket API
│   ├── cache.js        # 缓存系统
│   ├── rules.js        # 规则引擎
│   ├── stats.js        # 统计看板
│   └── coderev.test.js # 20 个单元测试
├── .github/workflows/
├── .coderevrc.json
├── .coderevignore
└── .coderevhint
```

---

## License

MIT
