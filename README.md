# coderev — AI Code Review Agent 🚀

**coderev** 是一个 AI 驱动的一站式代码审查工具。采用**多智能体并行审查架构**——3 个专业 Agent 同时从安全、Bug、质量维度审查代码，每个 Issue 附带置信度评分，自动过滤误报。支持 GitHub PR 集成、自动修复、git hooks、缓存、自定义规则、多语言专项审查、统计看板。

## 🧠 架构：多智能体并行审查 (v0.3.0)

```
        你的代码 (git diff)
               │
        ┌──────┼──────┐
        ▼      ▼      ▼
    ┌──────┐┌──────┐┌──────┐
    │  🔒  ││  🐛  ││  📐  │
    │Security││  Bug  ││Quality│
    │Auditor││Detector││Check │
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

**3 个专业 Agent 并行工作**，从不同角度审查同一份代码：

| Agent | 专注领域 |
|-------|---------|
| 🔒 Security Auditor | SQL注入、XSS、SSRF、硬编码密钥、认证缺陷 |
| 🐛 Bug Detector | 空指针、竞态条件、异步问题、逻辑错误 |
| 📐 Code Quality | 代码复杂度、DRY、命名规范、异常处理 |

每个 issue 都会计算**置信度评分 (0-100)**，低于阈值（默认 60）的自动过滤。同一问题被多个 Agent 发现时自动去重。

## ⚡ 新功能

```bash
# 多智能体并行审查（默认）
coderev review

# 提高置信度阈值（更少但更可靠的结果）
coderev review --min-confidence 80

# 降低阈值（更多结果，含一些误报）
coderev review --min-confidence 40

# 单 Agent 模式（v0.2.x 传统模式）
coderev review --single

# 安全审计模式（注入 OWASP 级审查）
coderev review --audit
```

## 快速开始

```bash
# 全局安装
npm install -g coderev

# 初始化项目配置
coderev init

# 设置 API Key
export DEEPSEEK_API_KEY="***"

# 审查 diff 文件
coderev review --file changes.diff

# 审查 git 仓库
coderev review --repo . --base main --head feature

# 管道接入
git diff main | coderev review
```

## GitHub PR 审查

```bash
coderev review --pr owner/repo#42              # 审查 PR
coderev review --pr 42                          # 自动检测当前仓库
coderev review --pr owner/repo#42 --post        # 审查 + 贴评论
coderev review --pr owner/repo#42 --inline      # 行内评论（逐行贴 issue）
coderev review --pr owner/repo#42 --output json # JSON 输出
```

## 行内评论

`--inline` 模式将每条 issue 贴在 PR 的具体代码行上，像人工 review 一样直观。

## 自动修复

```bash
coderev fix --file changes.diff          # 生成修复 patch
coderev fix --file changes.diff --apply  # 生成并自动应用
coderev fix --pr owner/repo#42           # 从 PR 生成修复
```

## Git Hooks（提交前检查）

```bash
coderev hook install                      # 安装 pre-commit（默认 50 分阈值）
coderev hook install pre-commit --min-score 70  # 自定义阈值
coderev hook install pre-push             # 安装 pre-push
coderev hook remove                       # 移除 hook
```

## 审查统计看板

```bash
coderev stats                    # 全部历史统计
coderev stats week               # 本周统计
coderev stats day                # 今日统计
coderev stats month              # 本月统计
coderev stats --clear            # 清空历史
```

自动记录每次审查结果，统计数据看板包含：平均分、最高/最低分、问题类型分布、严重程度分布、分数趋势图。

## 项目上下文（.coderevhint）

在项目根目录创建 `.coderevhint` 文件，描述项目概况、架构、规范。AI 审查时会自动加载并据此调整审查重点。

## 多语言专项规则

coderev 自动检测 diff 中的编程语言，为不同语言添加专项检查规则：

| 语言 | 检查重点 |
|---|---|
| JavaScript | async/await 链、== vs ===、内存泄漏、import 循环依赖 |
| TypeScript | strict 模式、avoid any、泛型、类型断言 |
| Python | PEP 8、except 类型、mutable 默认参数、async 用法 |
| Rust | unsafe 审计、unwrap/expect、生命周期、ownership |
| Go | error handling、goroutine 安全、context 传播、data race |
| Java | null 处理、checked exception、== vs .equals()、线程安全 |
| SQL | 注入防护、N+1 查询、索引缺失、大 IN-clause |

## 缓存

```bash
coderev cache status      # 查看缓存状态（24h 自动过期）
coderev cache clear       # 清理缓存
coderev review --no-cache # 跳过缓存强刷
```

## 配置管理

```bash
coderev config show       # 查看当前配置（自动遮盖敏感信息）
coderev config validate   # 验证配置文件
coderev config path       # 显示配置路径
```

团队共享：将 `.coderevrc.json` 放入仓库根目录，自动读取。

## GitHub Actions 自动审查

在工作流中使用 `coderev-review.yml`，PR 创建时自动审查并贴评论。详见 `.github/workflows/`。

## 安装与配置

```bash
npm install -g coderev
coderev init                        # 生成 .coderevrc.json + .coderevignore + .coderevhint
```

## 项目结构

```
coderev/
├── src/
│   ├── cli.js        # CLI 入口 (7 个子命令，支持 --single / --min-confidence)
│   ├── reviewer.js   # AI 审查核心（多智能体并行 / 置信度评分 / 3 个 Agent）
│   ├── config.js     # 配置加载（自动递归搜索）
│   ├── github.js     # GitHub API 交互（PR、评论、行内）
│   ├── gitlab.js     # GitLab API 交互
│   ├── gitee.js      # Gitee API 交互
│   ├── bitbucket.js  # Bitbucket API 交互
│   ├── cache.js      # 缓存系统（SHA256 + 24h TTL）
│   ├── rules.js      # 规则引擎（8 套预定义 + 7 种语言专项 + 自定义）
│   ├── stats.js      # 统计看板
│   └── coderev.test.js # 20 个单元测试
├── .github/workflows/  # GitHub Actions
├── .coderevrc.json     # 配置模板
├── .coderevignore      # 忽略规则
├── .coderevhint        # 项目上下文提示
└── ROADMAP.md          # 完整路线图

## License

MIT
