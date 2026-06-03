# Changelog

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
