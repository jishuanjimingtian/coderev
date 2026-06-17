# GitHub Release Notes

> 这些 release notes 应该被创建在 https://github.com/jishuanjimingtian/coderev/releases
> 使用 `gh release create` 或 GitHub Web UI 创建。
> 标签均已推送到远程，只需创建对应的 Release 对象并粘贴以下内容。

---

## v1.3.2 — GPT-5 + Haiku 4.5 Thinking 模型适配

**发布日期**: 2026-06-16

### 🤖 模型适配增强

- **GPT-5 模板**：新增 `gpt-5`（PR Benchmark 72.2分，Criticality Filtering）和 `gpt-5-minimal`（CI场景优化，62.7分）
- **Haiku 4.5 Thinking 模板**：新增 `haiku-thinking`（58% win over Sonnet 4.5, 1/3价格），支持 Thinking budget 配置
- **Thinking 参数支持**：`resolveTemplate()` 新增 `thinking` 字段，支持推理模型的 thinking budget 控制
- **自动检测优先级更新**：GPT-5 > Haiku 4.5 Thinking > DeepSeek，聚焦代码审查质量最优选择
- **新的 `fast` tier**：GPT-5 Minimal 引入快速模式，为 CI/CD 场景优化

### 🐛 Bug 修复

- 修复 `isIndexStale` flaky 测试（时序竞争条件，增加 50ms 延迟）

### 安装

```bash
npm install -g coderev-cli@1.3.2
```

---

## v1.3.1 — Agentic Fix Loop + PR Summary/Walkthrough

**发布日期**: 2026-06-15

### 🤖 Agentic Fix Loop (`--agentic`)

从"发现问题"升级到"解决问题"的完整闭环：

- **多轮自动修复** — find → fix → verify → retry
- `coderev review --agentic`：发现问题后自动生成修复 patch、应用、验证、重试
- `--agentic-rounds <n>`：设置每 issue 最大修复重试轮数（默认 3）
- `--agentic-auto-apply`：验证通过的修复自动 git apply
- **修复验证**：语法检查 + 项目 lint/test 命令
- **Patch diff 合并引擎**：解析 fix patch 并将其 hunks 合并到原始 diff 中
- 18 个单元测试覆盖

### 📋 PR Summary + Walkthrough

自动生成 PR 摘要、文件漫游和风险评估：

- `generatePrSummary()`：AI 分析 diff 生成结构化摘要
- **文件漫游**：每个变更文件的类型、变更类型、关键变更列表
- **风险评估**：low/medium/high 三级 + 具体关注点和缓解措施
- **审查清单**：为 human reviewer 生成可操作检查项
- 自动集成到 `coderev serve`：PR 事件触发后前置生成摘要
- 8 个单元测试覆盖

### 🎯 差异化

- 补齐 Qodo Agentic Mode + CodeRabbit PR Summary 的核心能力
- 开源且零外部服务依赖

### 安装

```bash
npm install -g coderev-cli@1.3.1
```

---

## v1.3.0 — Issue 关联校验

**发布日期**: 2026-06-14

### 🔗 Issue 关联校验

验证 PR 是否真正解决了关联 issue——对标 CodeRabbit Issue 校验能力：

- `coderev review --issue <url>`：审查后自动输出 Issue 验证报告
- `coderev review --verify-issue`：自动扫描 commit message 中的 issue 引用
- 支持 GitHub/GitLab issue URL 解析 + 简写格式
- **智能关键词提取**：文件路径、函数名、技术术语
- **关联度评分**：`fully-addressed` / `partially-addressed` / `unaddressed` 三种判决
- **34 个单元测试**全面覆盖

### 🎯 价值

- Issue-Driven 审查：避免 PR 遗漏关键需求
- 减少回归：自动检测关联 issue 是否被覆盖

### 安装

```bash
npm install -g coderev-cli@1.3.0
```

---

## 如何使用这些 Release Notes

```bash
# 方法 1: 使用 gh CLI
gh release create v1.3.0 --title "v1.3.0 - Issue 关联校验" --notes-file - <<'EOF'
[粘贴 v1.3.0 内容]
EOF

gh release create v1.3.1 --title "v1.3.1 - Agentic Fix Loop + PR Summary" --notes-file - <<'EOF'
[粘贴 v1.3.1 内容]
EOF

gh release create v1.3.2 --title "v1.3.2 - GPT-5 + Haiku 4.5 Thinking" --notes-file - <<'EOF'
[粘贴 v1.3.2 内容]
EOF

# 方法 2: 直接访问 GitHub Releases 页面手动创建
# https://github.com/jishuanjimingtian/coderev/releases/new
# 在 "Choose a tag" 下拉选择已存在的 tag，粘贴对应内容
```
