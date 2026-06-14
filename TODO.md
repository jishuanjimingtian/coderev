# coderev TODO

## ✅ v0.2.0 — 规则引擎增强（已发布）
- [x] React hooks 规范检查
- [x] 性能反模式检测
- [x] 安全漏洞扫描（SQL 注入、XSS 等）
- [x] 自定义规则扩展
- [x] 20 个单元测试

## ✅ v0.3.0 — 多智能体并行审查（已发布）
- [x] 3 专业 Agent 并行审查
- [x] 置信度评分系统
- [x] 多 Agent 合并去重
- [x] --single / --audit / --min-confidence
- [x] README 双语全面更新

## ✅ v0.4.0 — 体验提升（已发布）
- [x] 交互式修复（--interactive）
- [x] 增量审查（--incremental）
- [x] HTML 报告输出（--output html）
- [x] CI 模式（--ci，exit code 1）
- [x] 多项目配置继承（嵌套 .coderevrc.json 查找 + 深度合并）
- [x] Git blame 上下文分析（--blame）

## ✅ v0.5.0 — 协作与变现（已发布）
- [x] GitHub App（自动审查 PR）— `coderev serve`
- [x] GitHub Actions Action 原生集成
- [x] VS Code 扩展
- [x] GitLab CI 原生集成（`.gitlab-ci.yml` 模板 + `coderev init --gitlab-ci`）
- [x] 开源社区贡献指南 (CONTRIBUTING.md)

## ✅ v1.0.x — 平台化增强（已发布）
- [x] SaaS 规则市场（`coderev rules` search/install/publish）
- [x] 多模型支持 + 热门模板 + 主从回退
- [x] `coderev doctor` 环境诊断
- [x] `coderev setup --auto` 自动检测 API Key
- [x] Windows shebang BOM 修复

---

## 🔥 v1.3.0 — Issue 关联校验（已发布 2026-06-14）✅

- ✅ **Issue 关联校验**：`coderev review --issue <url>` → 解析 GitHub/GitLab issue，验证 PR diff 覆盖度
- ✅ **智能关键词提取**：文件路径、函数名、技术术语自动提取
- ✅ **关联度评分**：`fully-addressed` / `partially-addressed` / `unaddressed` 三种判决
- ✅ **Commit 引用扫描**：`--verify-issue` 自动检测 commit message 中的 issue 引用
- ✅ 34 个单元测试

---

## 🔥 需求挖掘 — 2026-06-14（历史）

> 今日竞品扫描：搜索服务不稳定（部分 fetch 成功）。基于昨日数据 + 今日 CodeRabbit GitHub App 页面抓取 + 行业趋势分析。

### 🆕 今日新发现
1. **CodeRabbit Issue 校验**：验证 PR 是否真正解决了关联 issue，识别遗漏的相关 issue。coderev 完全没有 issue 关联能力。
2. **CodeRabbit 增量 commit 自动审查**：PR 每推一个 commit 自动跑一次审查，无需人工触发。coderev 目前需手动运行或 CI 触发。
3. **对话式代码问答**：CodeRabbit 支持在 PR 内直接 @bot 提问，越聊越聪明。coderev 缺少交互式 PR 对话。
4. **代码库验证（缺失变更检测）**：CodeRabbit 不仅审查变更，还检查是否遗漏了应修改的文件。coderev 只审 diff。

### 📊 竞品格局速览（更新）
| 玩家 | 核心能力 | 最新动作 | coderev 差距 |
|------|---------|---------|-------------|
| **Qodo** | IDE + CLI + Git 全平台，Agentic 工作流，RAG | Gen 1.5 Agentic Mode、Command CLI SWE-bench 71.2%、Merge 1.0 Focus Mode | 缺 Agentic 闭环、缺 IDE 深度集成 |
| **CodeRabbit** | PR 审查 Bot，噪声过滤、对话式、Issue 校验 | VS Code 个人版免费，增量+摘要+联调+Issue 联动 | 缺 Issue 关联、缺增量自动审查、缺代码库验证 |
| **GitHub Copilot** | Chat 内置审查，生态绑定 | 深度 GitHub 集成、/tests 命令 | 缺生态深度绑定优势 |
| **coderev** | CLI 审查 + 多 Agent + CI/CD + RAG 索引，轻量开源 | v1.2.0 Phase 1 完成 | 见下方差距分析 |

---

## 🔥 需求挖掘 — 2026-06-13（历史存档）

> 今日竞品扫描：Qodo Command CLI 发布并达 SWE-bench Verified 71.2%；Qodo Gen 1.5 扩展 Agentic Mode（迭代工作流 + Shell 工具）；Qodo Merge 1.0 新增 Focus Mode（噪声过滤 + 动态学习 + /implement 命令）；深度 LangGraph + RAG pipeline 整合；Qodo × Snyk 安全合作；CodeRabbit 仍在活跃（VS Code 个人版免费）。

### 📊 竞品格局速览
| 玩家 | 核心能力 | 最新动作 |
|------|---------|---------|
| **Qodo** | IDE + CLI + Git 全平台覆盖，Agentic 工作流，RAG 代码库上下文 | Gen 1.5 Agentic Mode、Command CLI SWE-bench 71.2%、Merge 1.0 Focus Mode |
| **CodeRabbit** | PR 审查 Bot，侧重噪声过滤和对话式 | VS Code 个人版免费，积极推免费增值模式 |
| **GitHub Copilot** | Copilot Chat 内置审查，生态绑定 | 持续增强 Chat 审查能力，深度 GitHub 集成 |
| **coderev** | CLI 审查 + 多 Agent + CI/CD 集成，轻量开源 | 1.1.0，需补齐上下文感知和 Agentic 闭环 |

### Priority 1 — RAG 代码库上下文感知 🔴 ✅ v1.2.0 Phase 1 已发布
**状态**：Phase 1 完成！`coderev index` + `coderev review --rag` 已可用。
**差距**：coderev 只看 diff，不理解全局代码结构与团队编码模式。Qodo Merge 已有 Custom RAG pipeline，CodeRabbit 也有代码库索引。
**竞品信号**：
- Qodo Merge RAG：语义索引整个代码库 → 审查时检索相关上下文（函数签名、类型定义、调用链、最佳实践 Wiki）
- Qodo Embed 模型在 CoIR benchmark 领先
**方案**：
- Phase 1：本地代码库 Indexer（tree-sitter AST 分词 → 轻量向量嵌入，sqlite-vec 存储）
- Phase 2：审查 diff 时自动检索相关上下文（同文件函数、import 模块、类型定义），注入 prompt
- Phase 3：团队最佳实践自动学习（分析 accepted/rejected 建议模式）
**价值**：核心竞争力——减少误报 30%+，提升建议采纳率

### Priority 2 — Agentic 修复闭环 🟠
**差距**：3 Agent 审查是「发现问题→报告」的静态流程。Qodo Gen 1.5 已支持迭代式多步任务执行（规划→执行→验证→重试），配合 Terminal MCP 直接跑 build/test。
**竞品信号**：
- Qodo Gen 1.5 Agentic Mode：plan-first → run tools → evaluate → retry 循环
- Qodo Command：shell tool、文件系统 tool、ripgrep tool 组合
- Qodo Merge 1.0 `/implement` 命令：review 反馈直接转代码修改
**方案**：
- `coderev review --agentic`：发现问题 → AI 生成修复 → 自动跑 lint/build/test → 验证通过则提交建议
- 多轮迭代直到问题解决或达上限（默认 3 轮）
- 修复结果以 patch/diff 形式输出，可选自动 commit
**价值**：差异化——从「发现问题」升级到「解决问题」

### Priority 3 — 测试生成与覆盖率检查 🟡
**差距**：coderev 0 测试能力，Qodo Gen 有完整 AI 测试生成（TestGen-LLM 开源实现），且 Gen 1.0 进入 Agentic 测试工作流。
**竞品信号**：
- Qodo Gen：generate-run-fix-iterate 测试闭环
- Qodo Command 社区 Agent：diff-test-suite、test-runner-analyzer
- GitHub Copilot：/tests 命令生成测试
**方案**：
- `coderev test-gen`：对变更代码生成单元测试（jest/vitest/pytest）
- `coderev coverage`：检查变更代码的测试覆盖率，标注「缺少覆盖」
- 集成到审查报告：items 增加 `untested_code` 类别
**价值**：补齐 SDLC 链条，审查+测试一体化

### Priority 4 — 团队协作与审查历史 🟢
**差距**：coderev 是纯本地工具，无团队共享能力。Qodo 和 CodeRabbit 都有团队仪表盘、审查历史、最佳实践 Wiki。
**方案**：
- 审查结果持久化到 `.coderev/history/`（JSON + 增量索引）
- `coderev history`：查看历史审查记录、趋势、高频问题
- `coderev dashboard`：本地 Web UI 展示团队审查统计
- 后续可扩展云同步
**价值**：从单次使用到持续改进，提升团队采纳

### Priority 5 — 产品发布 & 增长 🔵
**差距**：GitHub Sponsors 未开通，Product Hunt 未发布，社区曝光不足。
**方案**：
- 发布到 Product Hunt（product-intro.html 已完成）
- 开通 GitHub Sponsors
- 在 V2EX/掘金/Reddit r/programming/Hacker News 宣传
- 录制 2 分钟 demo 视频
**价值**：获取早期用户，验证 PMF

---

## 📋 待办池（Backlog）

### 🔴 短期（v1.3.1）— 本周可执行
- [ ] **PR 自动摘要 + 技术漫游**（`coderev serve` 增强）：自动生成 PR Summary + Walkthrough 帖到 PR
- [ ] **Agentic 审查模式原型**（`--agentic` flag）：发现问题→生成修复→验证→建议 patch
- [ ] **增量 commit 自动审查**：GitHub App 监听 `push` 事件，每个 commit 自动触发审查

### 🟡 中期（v1.4.0）
- [ ] `coderev test-gen` 测试生成命令（jest/vitest/pytest）
- [ ] `coderev history` 审查历史 + 趋势分析
- [ ] PR 内 @bot 对话式问答（CodeRabbit 式交互）
- [ ] 代码库验证——检测遗漏未改的关联文件
- [ ] 团队最佳实践学习（accepted/rejected 模式分析）
- [ ] Bitbucket App webhook 集成

### 🔵 产品与增长
- [ ] Product Hunt 发布（product-intro.html 已完成）
- [ ] GitHub Sponsors 开通
- [ ] V2EX / 掘金 / Reddit / HN 宣传
- [ ] 2 分钟 demo 视频录制

### 🟢 长期
- [ ] 多语言 AST 级分析增强
- [ ] 企业版（私有部署 + SSO + 审计日志）
- [ ] `coderev dashboard` Web UI
- [ ] Azure DevOps PR 集成
- [ ] 安全评分系统
