# GitHub App 自动审查 — coderev

> 在 GitHub 上安装 coderev App 后，每个 PR 提交或更新时会**自动运行代码审查**，并将结果以 review comment + commit status 的形式反馈。

## 架构

```
GitHub PR (opened/synchronize)
        │
        ▼
GitHub App Webhook ──POST──► coderev serve (你的服务器)
                                      │
                              ┌───────┴────────┐
                              │  fetch PR diff  │
                              └───────┬────────┘
                                      ▼
                              ┌───────────────┐
                              │ 3 Agents 审查  │
                              │ (并行运行)     │
                              └───────┬───────┘
                                      ▼
                         ┌────────────────────────┐
                         │ 发布 Review Comment    │
                         │ + Commit Status        │
                         │ (+ 可选自动 Approve)   │
                         └────────────────────────┘
```

## 前置条件

1. **一个可公开访问的服务器**（支持 HTTPS）
   - Railway / Render / Fly.io / Vercel / 自建 VPS 均可
   - 也可以用 localhost + ngrok 做测试
2. **GitHub 账号**（创建 GitHub App 用）
3. **coderev 已安装**（`npm install -g coderev-cli`）

## 快速开始

### 1. 创建 GitHub App

1. 打开 https://github.com/settings/apps/new
2. 填写基本信息：
   - **GitHub App name**: `coderev-xxx`（全局唯一）
   - **Homepage URL**: `https://github.com/jishuanjimingtian/coderev`
3. **Webhook** 部分：
   - **Active**: ✅ 勾选
   - **Webhook URL**: `https://你的服务器域名/webhook`
   - **Webhook secret**: 生成一个随机字符串（`openssl rand -hex 32`）
4. **Permissions** 设置：

   | Permission | Access | 原因 |
   |-----------|--------|------|
   | Pull requests | Read & Write | 获取 diff、发布评论 |
   | Checks | Read & Write | 设置 commit status |
   | Contents | Read-only | 读取 repo 代码 |
   | Commit statuses | Read & Write | 设置状态 |
   | Metadata | Read-only | 自动（必选） |

5. **Subscribe to events**：
   - ☑️ **Pull requests**（监听 opened / synchronize）
   - ☑️ **Check run**（可选，高级功能）
6. **Where can this app be installed?**：选 **Any account**
7. 点击 **Create GitHub App**
8. 创建后：
   - 记下 **App ID**（页面顶部）
   - 点击 **Generate a private key** → 下载 `.pem` 文件
   - 记下 **Webhook secret**

### 2. 安装 App 到仓库

1. 在 App 设置页左侧，点击 **Install App**
2. 选择要安装的账号（个人或组织）
3. 选择 **All repositories** 或 **Selected repositories**
4. 点击 **Install**

### 3. 启动 coderev 服务器

```bash
# 方式一：直接运行
coderev serve \
  --port 3000 \
  --app-id 123456 \
  --private-key "$(cat /path/to/key.pem)" \
  --webhook-secret "your-webhook-secret"

# 方式二：环境变量
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="$(cat /path/to/key.pem)"
export GITHUB_APP_WEBHOOK_SECRET="your-webhook-secret"
coderev serve --port 3000

# 方式三：通过 .coderevrc.json
# 在 .coderevrc.json 中添加 githubApp 字段
```

### 4. 测试

打开任意一个安装了 App 的仓库，创建一个 PR。你应该会看到：

1. **Commit Status**：出现 `coderev/review` 状态（pending → 完成后更新）
2. **PR Comment**：coderev 发布审查报告
3. 如果配置了 **auto-approve**，无问题的 PR 会自动 approve

## 配置选项

### 环境变量 / .coderevrc.json

```json
{
  "githubApp": {
    "appId": 123456,
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "webhookSecret": "your-secret",
    "port": 3000,
    "host": "0.0.0.0",
    "autoApprove": false,
    "minConfidence": 60,
    "reviewMode": "comment",
    "skipDrafts": true,
    "skipBotPRs": true
  }
}
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `appId` | — | GitHub App ID（必填） |
| `privateKey` | — | GitHub App 私钥 PEM（必填） |
| `webhookSecret` | '' | Webhook 签名密钥（推荐设置） |
| `port` | 3000 | HTTP 服务器端口 |
| `host` | '0.0.0.0' | 绑定地址 |
| `autoApprove` | false | 无问题 PR 自动 approve |
| `minConfidence` | 60 | 最低置信度阈值 |
| `reviewMode` | 'comment' | comment(评论) / inline(行内) / check(状态) |
| `skipDrafts` | true | 跳过 draft PR |
| `skipBotPRs` | true | 跳过 bot 提交的 PR |

## 部署指南

### Railway（推荐）

```bash
# railway.json
{
  "build": {
    "builder": "NIXPACKS"
  }
}
```

设置环境变量后一键部署。

### Docker

```dockerfile
FROM node:20-alpine
RUN npm install -g coderev-cli
EXPOSE 3000
CMD ["coderev", "serve"]
```

### PM2 进程守护

```bash
npm install -g pm2
pm2 start --name coderev-app "coderev serve --port 3000"
pm2 save
pm2 startup
```

### ngrok 本地测试

```bash
ngrok http 3000
# 将 Webhook URL 设为 https://xxx.ngrok.io/webhook
```

## 安全提示

- ⚠️ **Webhook secret 务必设置**，防止伪造 webhook 请求
- ⚠️ **Private key 不要提交到代码仓库**，使用环境变量注入
- ⚠️ HTTPS 是必需的（GitHub 要求 webhook 使用 HTTPS）
- ✅ coderev 只读取 PR diff，不会修改仓库代码（除非 auto-approve 开启）

## 故障排除

### "Invalid webhook signature"
→ 检查 webhook secret 是否匹配

### "Failed to get installation token"
→ 检查 App ID 和 private key 是否正确

### "PR not found"
→ App 可能没有安装到该仓库

### 审查结果一直 pending
→ 检查服务器日志，可能是审查超时或 API 调用失败
