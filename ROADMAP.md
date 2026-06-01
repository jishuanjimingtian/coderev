# coderev Roadmap

## 🎯 使命
一个轻量、可扩展的 AI 驱动代码审查 CLI 工具，帮助开发者快速发现代码质量问题。

## ✅ 已交付 (v0.1.0)
- [x] CLI 骨架（commander）
- [x] 本地代码审查：`coderev review <path>`
- [x] JSON/terminal 双输出格式
- [x] 6 条内置审查规则
- [x] GitHub PR 集成（自动贴评论 + 行内评论）
- [x] GitLab 集成（--gl）
- [x] 批量 PR 审查（--all）
- [x] coderev fix / hook / stats / config / cache / init 子命令
- [x] npm 发布

## ✅ v0.2.0 — 规则引擎增强
- [x] React hooks 规范检查
- [x] 性能反模式检测
- [x] 安全漏洞扫描（SQL 注入、XSS 等）
- [x] CSS/JS 体积警告
- [x] 自定义规则扩展（.coderevrules 文件支持）
- [x] 20 个单元测试

## ✅ v0.3.0 — 多智能体并行审查（当前）
- [x] 3 专业 Agent 并行审查（Security / Bug / Quality）
- [x] 置信度评分系统（0-100，阈值过滤）
- [x] 多 Agent 结果合并与去重
- [x] 安全性 agent 专注：注入、XSS、SSRF、密钥泄漏
- [x] Bug agent 专注：空指针、竞态、异步、逻辑错误
- [x] 质量 agent 专注：复杂度、DRY、命名、异常处理
- [x] `--single` 单 Agent 回退模式
- [x] `--min-confidence <n>` 置信度阈值配置
- [x] `--audit` 安全审计模式
- [x] 与 `.coderevhint` / CLAUDE.md 项目规范兼容

## 🌟 v0.4.0 — 体验提升
- [ ] 交互式修复（--interactive）
- [ ] 增量审查（只审查 diff 新增部分）
- [ ] HTML 报告输出
- [ ] CI 模式（exit code 可配置）
- [ ] 多项目配置继承
- [ ] Git blame 上下文分析（智能区分新问题/预存问题）

## 🔮 v0.5.0 — 协作与变现
- [ ] GitHub App（自动审查 PR）
- [ ] SaaS 版：云端规则仓库
- [ ] 团队协作：共享规则、审查历史
- [ ] VS Code 扩展
- [ ] CI/CD 原生集成（GitHub Actions、GitLab CI）

## 💎 远期
- [ ] 多语言 AST 级别分析
- [ ] AI 辅助审查建议（接入 LLM）
- [ ] 代码安全评分系统
- [ ] 企业版（私有部署 + SSO）
