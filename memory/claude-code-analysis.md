# 2026-06-01 追加
## Claude Code 源码分析 & coderev 改造方案

### Claude Code 核心优势（与 coderev 对比）

| 维度 | Claude Code | coderev (v0.2.0) |
|------|------------|-------------------|
| **多智能体并行** | 4个agent并行审查：CLAUDE.md合规×2、bug检测、git history分析 | 单个AI调用，串行 |
| **置信度评分** | 每个issue打0-100分，过滤低分（80以下丢弃） | 无置信度评分 |
| **项目规范文件** | CLAUDE.md 作为项目级审查标准 | .coderevhint（类似但未强制） |
| **插件系统** | 完善：commands/agents/skills/hooks/MCP | 无 |
| **Git 上下文** | git blame 分析历史上下文智能检测 | 纯 diff 文本分析 |
| **工作流** | feature-dev: 7阶段标准化工作流 | 只有审查命令 |
| **错误过滤** | 区分：预存问题、lint可捕获问题、真正的bug | 全部大锅炖 |
| **AI 路由** | diff太短直接静态分析，长diff用多agent | 统一走AI |
| **增量审查** | 只审查PR新增部分，预存问题不重复报 | 每次审查全部diff |
| **CLAUDE.md** | 高级的 `.claude/settings.json` `.claude/` 目录 | .coderevrc.json 单文件 |

### coderev 改造方案 v0.3.0

1. **多智能体并行审查系统**
   - 并行启动3-4个独立审查 agent
   - 安全审查、规范审查、Bug审查、历史分析
   - 置信度评分（0-100）+ 阈值过滤

2. **增量/智能审查**
   - git blame 上下文分析
   - 区分新问题和预存问题
   - 只报告PR新引入的问题

3. **插件架构**
   - 支持自定义规则插件
   - 支持审查后处理 hook
   - 支持自定义输出格式

4. **项目规范 CLAUDE.md 兼容**
   - 读取 CLAUDE.md + .coderevhint
   - 作为审查标准注入 prompt
