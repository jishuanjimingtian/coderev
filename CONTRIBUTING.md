# Contributing to coderev

感谢你对 coderev 的关注！我们欢迎各种形式的贡献。

## 🌟 贡献方式

| 方式 | 适合 | 难度 |
|------|------|------|
| 🐛 报告 Bug | 所有人 | ⭐ |
| 💡 提议新功能 | 所有人 | ⭐ |
| 📝 改进文档 | 所有人 | ⭐ |
| 🔧 修复 Bug | 需要 JS/Node.js | ⭐⭐ |
| 🚀 开发新功能 | 需要理解 CLI/AI 架构 | ⭐⭐⭐ |
| 🔒 安全审计 | 安全研究者 | ⭐⭐⭐ |

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/jishuanjimingtian/coderev.git
cd coderev

# 安装依赖
npm install

# 运行测试
npm test

# 测试 CLI
node src/cli.js review --help
```

## 📁 项目结构

```
src/
├── cli.js          # CLI 入口（commander 命令定义）
├── reviewer.js     # 多 Agent 审查引擎（Security/Bug/Quality）
├── config.js       # 配置加载 + 多级继承
├── rules.js        # 审查规则引擎
├── github.js       # GitHub PR 集成
├── gitlab.js       # GitLab MR 集成
├── github-app.js   # GitHub App webhook 服务器
├── gitee.js        # Gitee PR 集成
├── gitcode.js      # GitCode MR 集成
├── bitbucket.js    # Bitbucket PR 集成
├── blame.js        # Git blame 上下文分析
├── fixer.js        # 交互式自动修复
├── cache.js        # 审查结果缓存
├── stats.js        # 统计看板
└── index.js        # 公共 API 入口
templates/
└── .gitlab-ci.yml  # GitLab CI 模板
```

## 🧪 提交指南

### Commit 信息格式

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加 XX 功能
fix: 修复 XX 问题
docs: 更新文档
refactor: 重构 XX 模块
test: 添加测试
chore: 杂项维护
```

### 分支策略

```bash
git checkout -b feat/my-feature   # 新功能
git checkout -b fix/my-bug       # 修复问题
git checkout -b docs/my-doc      # 文档更新
```

### 提交前检查

- [ ] `npm test` 全部通过
- [ ] 新功能有相应的测试覆盖
- [ ] 相关的 README / CHANGELOG 已更新
- [ ] 没有硬编码敏感信息

## 🔒 安全报告

如果你发现安全漏洞，请**不要**提公开 Issue，而是发送至：

📧 2749278679@qq.com

我们会尽快响应和修复。

## 💬 社区沟通

- **功能建议 / Bug 报告**：提交 [GitHub Issue](https://github.com/jishuanjimingtian/coderev/issues)
- **问题讨论**：在 Issue 中使用对应的标签（bug / enhancement / question）
- **通用问题**：查看 [FAQ](README.md#faq--常见问题)

## ⚖️ 行为准则

- 尊重所有贡献者
- 建设性讨论，不人身攻击
- 保持耐心，维护者都是业余时间维护
- 遵循 [Contributor Covenant](https://www.contributor-covenant.org/)

## 📄 License

MIT — 贡献即表示你同意在此许可下发布你的代码。

---

**感谢每一位贡献者！** ❤️

如果 coderev 对你有帮助，考虑 [GitHub Sponsors 赞助](https://github.com/sponsors/jishuanjimingtian)支持持续开发。
