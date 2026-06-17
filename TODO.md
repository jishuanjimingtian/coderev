# coderev TODO

## ✅ v1.3.3 — 多 Agent 协调层（已发布 2026-06-17）
- [x] 跨 Agent 置信度统一校准（按 Agent 画像修正偏差）
- [x] 交集检测 + 自动提升置信度
- [x] 冲突检测（矛盾信号标记 + 降权）
- [x] Recall / Balanced / Precision 三模式
- [x] `--mode` CLI 选项
- [x] 协同统计终端/Markdown 输出
- [x] RELEASE_NOTES.md（v1.3.0-1.3.2 共 3 版）
- [x] 48 个单元测试

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

## ✅ v1.3.0 — Issue 关联校验（已发布 2026-06-14）

- ✅ **Issue 关联校验**：`coderev review --issue <url>` → 解析 GitHub/GitLab issue，验证 PR diff 覆盖度
- ✅ **智能关键词提取**：文件路径、函数名、技术术语自动提取
- ✅ **关联度评分**：`fully-addressed` / `partially-addressed` / `unaddressed` 三种判决
- ✅ **Commit 引用扫描**：`--verify-issue` 自动检测 commit message 中的 issue 引用
- ✅ 34 个单元测试

---

## 🔥 需求挖掘 — 2026-06-17（周三）

> 今日竞品扫描：web_search 超时，改用 web_fetch 定向抓取 Qodo 博客首页 + CodeRabbit Changelog + Qodo 2 篇 Benchmark 文章。CodeRabbit 的 MDX/JSX changelog 无法直接解析增量内容，但从 Navigation 菜单中捕捉到重要新功能方向。

### 🆕 今日新发现

1. **CodeRabbit Agent for Slack（全新形态）**：CodeRabbit 将 AI Agent 嵌入 Slack——从 issue 到代码的完整工作流：在 Slack 线程中讨论问题 → 生成代码库感知的实现计划（Coding Plan）→ 自动开 PR。配合 Scope 系统（命名空间隔离仓库/权限/预算）实现企业级治理。这超越了"PR 审查 Bot"定位，成为"SDLC Agent"。

2. **CodeRabbit Coding Plan + Finishing Touches**：
   - **Coding Plan**：从 issue/描述生成代码库感知的实现计划，可直接交接给任何 coding agent
   - **Finishing Touches**：审后 agentic 动作（Autofix、写 docstring、生成单测），在 PR comment 或 Walkthrough checkbox 触发
   - **Path Instructions**：按 glob pattern 作用域的自定义审查规则（如 `src/controllers/**`）——比 coderev 配置文件级别更细粒度
   - 这些功能让 CodeRabbit 从"被动审查"升级为"主动协助"

3. **Qodo 无新增文章**（6/16→6/17 无增量）——连续 5 天扫描后行业信号趋于稳定。Qodo 的战略方向已清晰：Multi-Agent Fabric + Context Engine + Rules Lifecycle = "Artificial Wisdom" 三支柱。

4. **v1.3.2 已完成**：GPT-5 + Haiku 4.5 Thinking 模板已于 6/16 提交并推送到远程（commit `086c38e`，tag `v1.3.2`），P1 优先级的模型适配需求已完成。但 npm publish 状态仍待确认。

5. **GitHub Release Notes 缺失**：远程 tag 已存在（v1.3.0/v1.3.1/v1.3.2），但 GitHub Releases 页面空无一物——缺少 release notes 影响项目可见性和用户信任。

### 📊 竞品格局速览（2026-06-17 更新）

| 玩家 | 核心能力 | 最新动作 | coderev 差距 |
|------|---------|---------|-------------|
| **Qodo** | PR Review + IDE + CLI 全平台，Multi-Agent Fabric，Context Engine，PR Knowledge System，Rules Lifecycle | Series B $70M（累计 $120M）；2.0 F1=60.1%；GPT-5 72.2 分；"Artificial Wisdom" 战略体系完整 | 缺多 Agent 协调层、缺 PR 历史学习、缺规则生命周期 |
| **CodeRabbit** | PR 审查 Bot + Slack Agent + Coding Plan + Path Instructions + Finishing Touches | Slack Agent（issue→plan→PR）、Coding Plan、Path Instructions、Finishing Touches（autofix/docstring/test gen）、Scope 系统 | 缺 Slack 集成、缺代码库感知计划生成、缺路径级规则、缺 PR 内容器人交互 |
| **GitHub Copilot** | Chat 内置审查，生态绑定 | 深度 GitHub 集成、/tests 命令 | 缺生态深度绑定优势（差距稳定） |
| **coderev** | CLI 审查 + 多 Agent + CI/CD + RAG 索引 + Agentic fix + 模型适配，轻量开源 | v1.3.2 完成模型适配；tag 已推到远程；release notes 缺失 | 见下方差距分析 |

### 🎯 v1.3.2 完成后状态更新

| 版本 | 状态 | 说明 |
|------|------|------|
| **v1.3.0** | ✅ 已发布 | Issue 关联校验，tag `v1.3.0` 已推远程 |
| **v1.3.1** | ✅ 已发布 | Agentic fix loop + PR Summary/Walkthrough，tag `v1.3.1` 已推远程 |
| **v1.3.2** | ✅ 已发布 | GPT-5 + Haiku 4.5 Thinking 模板，tag `v1.3.2` 已推远程 |
| **GitHub Releases** | ❌ 缺失 | 3 个版本的 release notes 均未创建 |
| **npm publish** | ⚠️ 待确认 | v1.3.2 最新版本是否已 publish 到 npm |

---

## 🔥 需求挖掘 — 2026-06-15

> 🚨 **重大信号**：Qodo 完成 $70M Series B（累计 $120M），提出「Artificial Wisdom」概念——从代码生成到代码治理的范式转移。Qodo 2.0 多智能体架构在 PR Benchmark F1=60.1%（领先 9%）。小模型也有思考能力（Haiku 4.5 Thinking 胜 Sonnet 4.5 Thinking，58% win rate）。GPT-5 在 PR Benchmark 达 72.2 分。

### 🆕 今日新发现

1. **Qodo 2.0 多智能体架构 + 自建基准**：Qodo 2.0 发布下一代 Multi-Agent Fabric，在自建 PR Benchmark（400 真实 PR + 注入 bug）上 F1=60.1%，领先第二名 9%。核心创新：Context Engine + Finding Recommendation Agent + Recall-optimized 模式。coderev 目前是 3 Agent 并行但缺少跨 Agent 协调层和统一置信度校准。

2. **PR 历史学习（Qodo 2.2 PR Knowledge System）**：Qodo 2.2 的 PR Knowledge System 索引仓库 PR 历史，学习团队审查模式，根据历史 context 决定哪些 findings 值得提出。实现「代码库有记忆」——避免重复建议、识别回归问题。coderev 完全缺少这个维度。

3. **Rules Lifecycle Management（Qodo 2.1）**：Qodo 将规则从静态 markdown/config 升级为「有生命周期的版本化实体」——可发现、起草、发布、废弃。组织级+仓库级双层规则，带 adoption/violation 分析。coderev 目前规则系统是 JSON 配置文件，无版本/生命周期/分析。

4. **Jira/GitHub Issue Ticket Compliance（Qodo Merge）**：Qodo Merge 新增 Jira 集成，验证 PR 代码是否满足 issue/Jira ticket 的验收标准。coderev v1.3.0 刚做了 Issue 关联校验但缺少 Jira 支持和验收标准级别的验证。

5. **GPT-5 代码审查能力飞跃**：GPT-5 Medium 在 PR Benchmark 72.2 分，亮点包括更广 bug 覆盖、精准 patch、规则合规、关键性过滤（无问题则返回空）。小模型趋势深化——Haiku 4.5 Thinking (58%) 在日常审查任务上超越 Sonnet 4.5 Thinking (42%)。对 coderev 多模型策略有参考价值。

### 📊 竞品格局速览（2026-06-15 更新）

| 玩家 | 核心能力 | 最新动作 | coderev 差距 |
|------|---------|---------|-------------|
| **Qodo** | PR Review + IDE + CLI 全平台，多智能体审查，PR 历史学习，规则生命周期 | Series B $70M（累计 $120M）；2.0 Multi-Agent Fabric F1 60.1%；2.2 PR Knowledge System；2.1 Rules System；Jira 集成；GPT-5 支持 | 缺多 Agent 协调层、缺 PR 历史学习、缺规则生命周期管理、缺 Jira |
| **CodeRabbit** | PR 审查 Bot，噪声过滤，对话式 | VS Code 个人版免费，增量审查，Issue 联动 | 缺 Issue 关联（✅ v1.3.0 已补齐）、缺代码库验证、缺 PR 内对话 |
| **GitHub Copilot** | Chat 内置审查，生态绑定 | 深度 GitHub 集成、/tests 命令 | 缺生态深度绑定优势 |
| **coderev** | CLI 审查 + 多 Agent + CI/CD + RAG 索引，轻量开源 | v1.3.0 Issue 关联已发布 | 见下方差距分析 |

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

### 🔴 短期（v1.3.3）— 本周可执行
- [x] **PR 自动摘要 + 技术漫游**（`coderev serve` 增强）：自动生成 PR Summary + Walkthrough 帖到 PR ✅ v1.3.1
- [x] **Agentic 审查模式原型**（`--agentic` flag）：发现问题→生成修复→验证→建议 patch ✅ v1.3.1
- [x] **GPT-5 + Haiku 4.5 Thinking 模型适配** ✅ v1.3.2（2026-06-16）
- [x] **多 Agent 协调层**：跨 Agent 置信度统一校准 + 冲突检测 + Recall/Precision 双模式 ✅ v1.3.3（2026-06-17）
- [x] **RELEASE_NOTES.md**：v1.3.0/1.3.1/1.3.2 三个版本的 release notes 已写入文件
- [ ] **npm publish v1.3.3**：待本次提交后发布
- [ ] **GitHub Release Notes 创建**：待 gh CLI 或 token 可用后，通过 GitHub API/Web UI 创建 Release
- [ ] **增量 commit 自动审查**：GitHub App 监听 `push` 事件，每个 commit 自动触发审查

### 🆕 新发现需求（2026-06-17 CodeRabbit Analysis）
- [ ] **Path Instructions（路径级规则）**：按 glob pattern 作用域的审查规则配置（如 `src/controllers/**` 启用严格的安全扫描）——比现有 `.coderevrc.json` 文件级配置更细粒度
- [ ] **Finishing Touches 模式**（审后自动动作）：Autofix、生成 docstring、生成单测——在审查结果中以 comment/checkbox 触发
- [ ] **Slack/Chat 集成方案**：是否需要类似 CodeRabbit Agent 的聊天平台 agent 能力？可先评估

### 🟡 中期（v1.4.0）
- [ ] `coderev test-gen` 测试生成命令（jest/vitest/pytest）
- [ ] `coderev history` 审查历史 + 趋势分析
- [ ] PR 内 @bot 对话式问答（CodeRabbit 式交互）
- [ ] 代码库验证——检测遗漏未改的关联文件
- [ ] 团队最佳实践学习（accepted/rejected 模式分析）
- [ ] Bitbucket App webhook 集成
- [ ] **PR 历史学习系统**：索引 PR 历史→学习团队审查模式→过滤低信号建议→识别回归（对标 Qodo 2.2 PR Knowledge System）
- [ ] **规则生命周期管理**：规则版本化、起草/发布/废弃流程、采纳率/违规分析（对标 Qodo 2.1 Rules System）
- [ ] **Jira Ticket 合规校验**：`coderev review --jira <ticket>` → 验收标准级别验证，扩展到 v1.3.0 issue 关联能力

### 🔵 产品与增长
- [ ] **GitHub Release Notes 创建**（v1.3.0-v1.3.2，共 3 版）——超优先
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

---

## 🔥 需求挖掘 — 2026-06-16（周二）

> 今日竞品扫描：web_fetch 确认 Qodo 博客 3 篇关键文章——Series B $70M 详情、Haiku 4.5 Thinking 双基准完整数据、GPT-5 PR Benchmark；CodeRabbit/GitHub Changelog 无有效增量内容。

### 🆕 今日新发现

1. **Qodo $70M Series B 已确认 + "Artificial Wisdom" 三支柱完整框架**：
   - 领投方 Qumra Capital，累计融资 $120M
   - 三支柱全部有独立文章确认：
     - **Multi-Agent Fabric**（qodo-2-0-agentic-code-review）
     - **Context Engine**（qodo-2-2-code-review-that-learns-from-your-pr-history-context）
     - **Rules Lifecycle Management**（introducing-qodo-rule-system）
   - 核心口号："Intelligence is enough for generation. Wisdom is a must for governance."
   - 定位从"审查工具"升级为"代码治理系统记录"（system of record for enterprise）

2. **Haiku 4.5 Thinking 双基准数据确认**：
   - 标准模式：Haiku 4.5 55.19% win over Sonnet 4 (44.81%)，质量 6.55 vs 6.20
   - Thinking 模式（4096 tokens）：Haiku 4.5 Thinking 58% win over Sonnet 4.5 Thinking (42%)，质量 7.29 vs 6.60
   - 价格：Haiku 是 Sonnet 的 1/3
   - 结论：小型推理模型在 PR 审查上可靠且有成本优势——对 coderev 开源定位是利好

3. **GPT-5 PR Benchmark 数据确认**：
   - Medium-budget 72.2 分（最高分），Low-budget 67.8，Minimal 62.7
   - 核心特性：Criticality Filtering——识别"无问题"场景返回空，减少噪声
   - Judge 模型：o3（基准测试评估）
   - GPT-5 Minimal 为 IDE/快速 CI 场景优化——速度是新瓶颈

4. **Qodo 已发布的具体文章链接确认**（补全知识图谱）：
   - 2.0 Agentic Review、2.2 PR Knowledge System、2.1 Rules System、Jira Ticket Compliance、GPT-5 集成、Haiku Thinking Benchmark——全部为已发布的独立文章

5. **v1.3.1 发布债务未解除**（连续第 2 天标记）：commit `4abc9ef`（Agentic fix loop + PR Summary/Walkthrough + RAG Indexer，+2601 行）仍待 npm publish/git tag/git push

### 📊 竞品格局速览（2026-06-16 更新）

| 玩家 | 核心能力 | 最新动作 | coderev 差距 |
|------|---------|---------|-------------|
| **Qodo** | PR Review + IDE + CLI 全平台，Multi-Agent Fabric，Context Engine，PR Knowledge System，Rules Lifecycle | Series B $70M（累计 $120M）；2.0 F1=60.1%；GPT-5 72.2 分；Haiku 4.5 Thinking 58% win；Jira 集成；"Artificial Wisdom" 战略 | 缺多 Agent 协调层、缺 PR 历史学习、缺规则生命周期、缺 Jira、缺双模式(recall/precision) |
| **CodeRabbit** | PR 审查 Bot，噪声过滤，对话式 | VS Code 个人版免费，增量审查，Issue 联动 | 缺 PR 内对话、缺代码库验证（差异未显著扩大） |
| **GitHub Copilot** | Chat 内置审查，生态绑定 | 深度 GitHub 集成、/tests 命令 | 缺生态深度绑定优势（差距稳定） |
| **coderev** | CLI 审查 + 多 Agent + CI/CD + RAG 索引 + Agentic fix，轻量开源 | v1.3.1 开发完成待发布 | 见下方差距分析 |

---

## 📊 2026-06-17 需求优先级 Top 5

> 连续 5 天扫描后形成最终稳定排序。v1.3.2 完成标志着"模型适配"里程碑达成。GitHub Release Notes + npm publish 成为新的阻塞性操作债务。

| 优先级 | 需求 | 理由 | 建议版本 | 连续标记 |
|--------|------|------|---------|---------|
| 🔴 **P0** | **GitHub Release Notes + npm publish**（v1.3.0→v1.3.2 共 3 版） | 远程 tag 已存在但 releases 页面为空；npm 发布状态待确认。本应跟着代码提交走的最基本交付动作，已欠债 3 个版本。影响用户发现和信任 | **立即** | 📅 Day 1（新） |
| 🔴 **P0** | 多 Agent 协调层（置信度校准 + 冲突检测 + Recall/Precision 双模式） | Qodo 2.0 Multi-Agent Fabric F1=60.1% 领先 9%，核心差距在协调层。3 Agent 各说各话，缺统一校准。是质量维度的最大单一提升 | v1.4.0 | 📅 Day 5 |
| 🟠 **P1** | PR 历史学习系统（降低噪声 + 识别回归） | Qodo 2.2 PR Knowledge System 已独立发布，"代码库有记忆"成为差异化标配。CodeRabbit Learning 模式也在跟进 | v1.4.0 | 📅 Day 3 |
| 🟠 **P1** | Path Instructions + Finishing Touches（路径级规则 + 审后自动动作） | CodeRabbit 新能力：glob 级规则细分 + autofix/docstring/test gen 触发。填补 coderev 从"审查"到"协助修复"的最后一公里 | v1.4.0 | 📅 Day 1（新） |
| 🟡 **P2** | 规则生命周期管理（版本化 + 采纳率分析） | Qodo 2.1 Rules System 已独立发布。规则从静态 JSON 升级为版本化实体。影响企业采纳和团队协作 | v1.5.0 | 📅 Day 3 |

---

## 🔮 战略洞察（2026-06-17 更新）

> 连续 5 天需求挖掘后的最终趋势判断——已高度稳定

### 行业正在发生什么

1. **从"代码生成"到"代码治理"的范式迁移**（确认度 95%）——Qodo $120M 融资 + "Artificial Wisdom" 战略是标志性事件。下半场的竞争不在"写代码"而在"管代码"
2. **小模型 + 推理 = 大模型替代**（确认度 90%）——Haiku 4.5 Thinking 以 1/3 价格在 PR 审查上超越 Sonnet 4.5 Thinking。对开源工具是结构性利好
3. **"代码库有记忆"成为新标配**（确认度 85%）——Context Engine / PR Knowledge System 从 nice-to-have 升级为差异化核心
4. **速度成为新瓶颈**（确认度 85%）——GPT-5 Minimal (62.7 分) 的存在说明"够好+够快"是新 PMF 维度。CI/CD 场景需要毫秒级反馈
5. **Agent 嵌入协作平台**（确认度 80%）——CodeRabbit Slack Agent 开辟新赛道：从"代码审查工具"进化到"SDLC 全流程 Agent"（issue→plan→PR→review→fix）

### coderev 的战略定位

- ✅ **优势**：轻量开源 CLI + 多 Agent + Agentic fix loop + RAG 索引 + GPT-5/Haiku 4.5 Thinking 适配，技术栈完整
- ✅ **v1.3.2 里程碑**：模型适配完成——GPT-5(72.2分) + Haiku 4.5 Thinking(58% win) + GPT-5 Minimal(CI优化) 全部就绪
- ⚠️ **紧迫差距**（按影响排序）：
  1. **发布体验**（GitHub Releases + npm）——3 个版本 tag 已推但 release notes 为空，纯操作债务
  2. **多 Agent 协调层**（质量）——Qodo 领先 9% 的根因
  3. **PR 历史学习**（差异化）——长期壁垒
  4. **Path Instructions + Finishing Touches**（细粒度控制）——CodeRabbit 新方向
  5. **规则生命周期**（企业级）——变现路径
- 🎯 **机会窗口**：
  - 小模型推理趋势降低开源工具运营成本 → 差异化定价优势（Haiku 4.5 Thinking 已在 v1.3.2 适配）
  - Qodo 闭源企业定位 + CodeRabbit 商业化路径留下开发者社区/中小团队空白 → 开源补位
  - 速度是 Qodo 尚未充分优化的维度 → GPT-5 Minimal 模板为 coderev CI 速度口碑铺路
- ⚡ **立即行动**：创建 GitHub Release Notes（v1.3.0-1.3.2）→ npm publish 确认 → 多 Agent 协调层设计
