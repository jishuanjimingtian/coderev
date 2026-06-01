# coderev-cli

> 多智能体 AI 代码审查工具 — Security / Bug / Quality 三个 Agent 并行审查，带置信度评分。

[![npm version](https://img.shields.io/npm/v/coderev-cli)](https://www.npmjs.com/package/coderev-cli)

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

在项目根目录创建 `.coderevrc.json`：

```json
{
  "ai": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "temperature": 0.3
  },
  "rules": {
    "maxLineLength": 100,
    "predefined": ["security", "performance", "style"],
    "custom": [
      {
        "name": "no-console-log",
        "severity": "warning",
        "message": "避免在生产代码中使用 console.log"
      }
    ]
  }
}
```

内置 8 套预定义规则集，并支持 JS / TS / Python / Rust / Go / Java / SQL 语言专项规则。

### .coderevhint

项目上下文描述文件。AI 审查时自动加载并据此调整分析重点。兼容 `CLAUDE.md`。

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
