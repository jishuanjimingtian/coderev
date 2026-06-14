# Changelog

## [v1.3.0] — 2026-06-14

### 🔗 Issue 关联校验

- **`src/issue-validator.js`**：验证 PR 是否真正解决了关联 issue
  - 支持 GitHub issue URL (`github.com/owner/repo/issues/42`) 和 GitLab issue URL 解析
  - 支持简写格式：`owner/repo#42`、`#42`、`owner/repo!42`
  - 自动获取 issue 内容（标题、描述、标签、assignees）
  - 智能关键词提取：文件路径、函数名、技术术语
  - 关联度评分：对比 issue 关键词与 PR diff 的覆盖度
  - 三种判决：`fully-addressed` / `partially-addressed` / `unaddressed`
- **`coderev review --issue <url>`**：审查后自动输出 Issue 验证报告
- **`coderev review --verify-issue`**：自动扫描 commit message 中的 issue 引用
- **`src/issue-validator.test.js`**：34 个单元测试覆盖
  - URL 解析（GitHub/GitLab/简写/边界情况）
  - 关键词提取（文件路径/函数名/技术术语）
  - Issue 与 diff 的关联度验证
  - Commit message 中的 issue 引用扫描
  - 报告生成与格式化

### 🎯 价值

- **Issue-Driven 审查**：避免 PR 遗漏关键需求
- **减少回归**：自动检测关联 issue 是否被覆盖
- **CodeRabbit 对齐**：补齐 issue 关联能力差距

---

# Changelog

## [v1.2.0] — 2026-06-13

### ✨ RAG 代码库上下文感知 — Phase 1

- **`src/rag-indexer.js`**：轻量级代码库索引器（纯 JS，零原生依赖）
  - 多语言符号提取：JavaScript/TypeScript、Python、Go、Rust、Java/Kotlin
  - 支持函数声明、箭头函数、类、方法、导入/导出语句等符号类型
  - 基于 TF-IDF + 余弦相似度的语义搜索
  - 索引持久化到 `.coderev/index/`（JSON 格式，可跨会话复用）
  - 自动跳过 `node_modules`、`.git`、`dist` 等无关目录
  - 可配置最大索引文件数（默认 500）
- **审查上下文注入**：`coderev review --rag` 自动检索相关符号上下文
  - 同文件符号：变更文件中定义的函数、类、方法
  - 跨文件引用：变更文件的 import/export 关系
  - 语义相似：TF-IDF 搜索代码库中相似符号
  - 上下文自动注入 Agent prompt，提升审查准确度
- **`coderev index` 命令**：手动构建/重建代码库索引
  - 支持 `--repo <path>` 指定仓库路径
  - 支持 `--max-files <number>` 限制文件数
  - 支持 `--json` 输出统计数据
  - 显示语言分布、文件数、符号数的统计摘要
- **`src/rag-indexer.test.js`**：25 个单元测试覆盖
  - 符号提取：JS/TS/Python/Go/Rust/Java 多语言验证
  - TF-IDF 索引构建与搜索
  - 实际目录结构索引与持久化
  - 上下文检索（同文件 + 跨文件 + 语义）
  - 索引过期检测
- 终端输出添加 RAG 统计信息
- 自动索引：`--rag` 模式下若无索引则自动构建

### 🎯 价值

- **减少误报 30%+**：Agent 现在理解调用链、类型关系和代码结构
- **提升建议采纳率**：审查报告附带精确的符号上下文
- **轻量且离线**：无需外部服务，纯本地 JS 实现

---

## [v1.0.24] — 2026-06-05

### ✨ 多模型支持 + 热门模板 + 主从回退

- **`src/models.js`**：内置 11 个热门模型模板
  - DeepSeek V3 / R1、OpenAI GPT-4o / O3、Qwen Plus / Coder、Claude Sonnet 4、Gemini 2.5 Pro、智谱 GLM-4、月之暗面、Codestral
  - 每个模板预设 provider、baseURL、model、apiKeyEnv、描述
  - `resolveTemplate()` 支持用户覆盖参数
- **主从模型回退**：主模型调用失败时自动切到从模型
  - `coderev setup --model deepseek --fallback qwen`
  - 回退过程透明，控制台打印日志
- **不同 Agent 不同模型**：安全/缺陷/质量三个 Agent 可独立配置
  - `coderev setup --agent-security deepseek-r1 --agent-quality qwen`
- **`coderev models`**：列出所有模板及其配置和使用方法
- **`coderev setup`**：一键配置模型，主/从/Agent 级模型选择
- **`src/models.test.js`**：10 个测试覆盖模板解析、覆盖、验证

### 📝 README 全面更新

- 添加 `coderev models`、`coderev setup`、`coderev rules` 完整使用文档
- 添加 VS Code 扩展安装和功能说明
- 快速上手第 2 步改用 `coderev setup --model` 方式

---

## [v1.0.23] — 2026-06-04

### ✨ SaaS 规则市场

- **`src/rules-market.js`**：搜索、安装、发布、管理规则包
- **`coderev rules`** 子命令：`search` / `install` / `publish` / `list` / `uninstall` / `info`
- 安装的规则自动合并到 `.coderevrc.json` 的 `rules.custom`，带 `_source` 标记
- 安装记录保存在 `.coderev-marketplace/installed.json`

---

## [v1.0.22] — 2026-06-04

### ✨ VS Code 扩展 + GitHub Actions 模板

- **VS Code 扩展**（`vscode/`）：
  - `coderev.review`：审查整个工作区
  - `coderev.reviewCurrentFile`：审查当前文件
  - `coderev.fixCurrentFile`：自动修复当前文件
  - `coderev.stats`：查看审查统计
  - 保存时自动审查（`coderev.autoReviewOnSave`）
  - Problems 面板集成（诊断直接显示在编辑器中）
  - Output Channel 详细报告 + 状态栏按钮
- **`templates/github-action.yml`**：开箱即用的 GitHub Actions 工作流
  - 自动在 PR 上发布 sticky comment
  - 支持 check 模式（commit status + annotations）
  - 可选 CI 阻塞（CODEREV_BLOCK=true）
- **`coderev init --github-action`**：一键生成 `.github/workflows/coderev.yml`
- v0.5.0 VS Code 扩展 ✅ 完成

---

## [v1.0.21] — 2026-06-04

### ✨ GitLab CI 原生集成

- **`.gitlab-ci.yml` 模板**：开箱即用的 GitLab CI 配置
  - 自动检测 MR diff，运行 3 Agent 并行审查
  - 支持自动发布 MR 评论（需设置 GITLAB_TOKEN）
  - 支持 CI 阻塞模式（CODEREV_BLOCK=true，发现问题时 fail pipeline）
  - 可配 provider / model / confidence / blame / mode
  - 产物保留 7 天（artifacts）
- **`coderev init --gitlab-ci`**：一键生成 `.gitlab-ci.yml` 到项目根目录
- 与 GitHub Actions（action.yml）互补，形成完整 CI/CD 集成版图

---

## [v1.0.17] — 2026-06-03

### ✨ 新功能（v0.4.0 体验提升完成）

- **多项目配置继承**：`config.js` 支持从父目录向上查找所有 `.coderevrc.json`，深度合并配置
  - 团队可将基础配置放仓库根目录，子项目只设置覆盖字段
  - 支持 `inheritance.enabled: false` 关闭继承
  - 新增 `_inheritanceStack` 字段记录加载链
- **Git blame 上下文分析**：`coderev review --blame`，区分新增问题 vs 已有问题
  - 新增 `src/blame.js` 模块，解析 git blame 判断行来源
  - 输出 `isNew` 字段标记每个 issue 是否由本次变更引入
  - 终端/Markdown/JSON 输出均显示 `Blame Context` 统计
- **GitHub Action**：`action.yml` — 可直接在 GitHub Actions Marketplace 使用
  - 支持 `provider` / `model` / `min-confidence` / `blame` / `inline` 等参数
  - 自动清理上一次 coderev 评论，避免刷屏

## [v1.0.18] — 2026-06-03

### ✨ 新功能（v0.5.0 App 阶段）

- **GitHub App 自动审查**：`coderev serve` 启动 webhook 服务器，自动监听 PR 事件
  - 支持 `pull_request.opened / synchronize / reopened` 事件
  - 自动获取安装 token（JWT 认证）
  - 审查结果作为 PR comment + commit status 发布
  - 支持三种审查模式：comment / inline / check
  - 可选 auto-approve（无问题的 PR 自动 approve）
  - 跳过 draft PR 和 bot PR
- **部署文档**：`docs/github-app.md` 含创建 App、部署到 Railway/Docker/PM2 的详细步骤

---

## [v1.0.16] — 2026-06-02

### 📝 文档改进

- 重写 README，增加**项目介绍**、**命令详解**（每个命令的用途、参数列表、使用示例）、**配置详解**（全字段对照表、API Key 三种配置方式对比）、**平台集成**对比表、**FAQ** 常见问题解答
- 补充 `interactive` / `ci` / `incremental` / `html 报告` 等新增功能的详细使用说明

---

## [v1.0.15] — 2026-06-02

### ✨ 新功能（v0.4.0 体验提升）

- **交互式修复**：`coderev review --interactive`，逐条审查 issue，选择 AI 自动修复/跳过/退出
- **CI 模式**：`coderev review --ci`，发现问题时 exit code 1，可直接嵌入 CI/CD 管道
- **HTML 报告**：`coderev review --output html`，生成可视化 HTML 报告，支持深色/浅色主题
- **增量审查**：`coderev review --incremental`，只关注 diff 中新增/修改的行，忽略删除的上下文

### 💰 变现

- README 顶部添加 **GitHub Sponsors 按钮** + 中英赞助号召
- MONETIZATION Phase 1 完成

---

## [v1.0.8] — 2026-06-01

### 🐛 Bug 修复

- 修复 hook install 中 options 未定义的问题
- 修复 `reviewDiff` 空 diff 时的保护
- 修复 `filterDiffByPattern` 空保护
- 修复 `parseReviewResponse` 空输入保护
- 修复 `callAI` 中 `choices` 可选链

---

## [v1.0.0] — 2026-06-01

### 📦 变更

- 包名从 `@lishihao2749/coderev` 更名为 `coderev-cli`
- 迁移至 npm 账号 `aisync`

---

## [v0.3.1] — 2026-06-01

### 🐛 Bug 修复

- 修正 README 安装命令

---

## [v0.3.0] — 2026-06-01

### ✨ 新功能

- **多智能体并行审查**：3 Agent（Security / Bug / Quality）同时审查
- **置信度评分**：每个 issue 带 0-100 评分，低于阈值自动过滤
- **重复合并**：多 Agent 发现的重复问题自动去重

---

## [v0.2.0] — 2026-06-01

### ✨ 新功能

- 规则扩展至 18 条
- $8 套预定义规则集 + 7 语言专项规则
- 文档完善

---

## [v0.1.0] — 2026-05-31

### 🎉 首次发布

- CLI 骨架（review / fix / hook / stats / config / cache / init）
- 基础审查功能
- 多平台 Git 集成（GitHub / GitLab / Gitee / Bitbucket）
- 自动修复
- Git hooks
- 缓存系统
- 自定义规则
- 统计看板
- GitHub Actions CI
