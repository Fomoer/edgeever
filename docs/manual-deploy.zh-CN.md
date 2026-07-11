# Cloudflare 手动部署指南

如果你熟悉 Cloudflare 和命令行，或者想自定义/精细控制部署流程，可以按照以下指南进行手动部署与后续更新。

> 💡 **提示**：如果是通过 AI 助手（Claude Code、Codex、Antigravity、Cursor、Trae 等）进行部署，AI 助手应优先参考 [AI Agent Cloudflare Deployment](agent-deploy-cloudflare.md) 约定。

## 部署步骤

1. **Fork 官方仓库**：
   访问并 Fork 官方仓库：[https://github.com/tianma-if/edgeever](https://github.com/tianma-if/edgeever)

2. **Clone 你的 Fork 仓库**：
   ```sh
   git clone <你的 Fork 仓库 URL>
   cd edgeever
   ```

3. **使用自动化辅助命令部署**：
   ```sh
   # 复制配置文件模板
   cp .env.local.example .env.local

   # 安装依赖
   bun install

   # 执行部署初始化，并设置首次登录密码
   EDGE_EVER_PASSWORD='<你的密码>' bun run deploy:setup

   # 诊断部署环境与配置
   bun run deploy:doctor

   # 执行部署
   bun run deploy
   ```

### 完全手动创建 Cloudflare 资源

如果你不想使用 `deploy:setup` 自动化脚本，也可以完全手动使用 Cloudflare CLI (Wrangler) 创建资源：

```sh
# 复制配置文件模板并安装依赖
cp .env.local.example .env.local
bun install

# 手动创建 D1 数据库
bunx wrangler d1 create edgeever

# 手动创建 R2 存储桶
bunx wrangler r2 bucket create edgeever-resources

# 生成密码 hash（用于后台验证）
bun run auth:hash -- <你的密码>

# 编辑 .env.local，至少填入刚创建的资源和密码配置
# EDGE_EVER_D1_DATABASE_ID=<D1 创建命令返回的 database_id>
# EDGE_EVER_R2_BUCKET_NAME=edgeever-resources
# EDGE_EVER_AUTH_PASSWORD_HASH=<上一步生成的 hash>
# EDGE_EVER_SESSION_TTL_DAYS=400

# 确认配置完整后再部署
bun run deploy:doctor
bun run deploy
```

必须在执行 `bun run deploy` **之前**，将 D1 创建命令返回的 `database_id`、R2 bucket 名称和生成的密码 hash 写入本机 `.env.local`。会话有效期建议保留模板中的 `400` 天；服务端也会把更大的值限制为 400 天。

`bun run deploy` 会构建 Web 应用、执行远程 D1 migration、部署 Worker，并将 `EDGE_EVER_AUTH_PASSWORD_HASH` 作为 Worker Secret 上传。部署脚本还会在成功后通过 `wrangler secret put` 再同步一次该 Secret，确保首次登录可用。部署完成后，请使用 `.env.local` 中的 `EDGE_EVER_AUTH_USERNAME` 和生成 hash 时使用的原始密码登录验证。

---

## 更新到最新版

当官方仓库发布新版本时，如果你的实例是通过 Fork 部署的，可以按照以下步骤拉取最新代码并更新：

1. 打开你自己的 EdgeEver Fork 仓库页面。
2. 点击页面上的 **Sync fork**，将官方仓库的最新代码同步到你的 Fork。
3. 在本地项目目录中拉取更新并重新部署：
   ```sh
   git pull
   bun install
   bun run deploy:doctor
   bun run deploy
   ```

> ⚠️ **注意**：同步 Fork 仅仅更新了你 GitHub 仓库里的代码，并不会自动更新已经部署在 Cloudflare 的 Worker/Pages 实例。必须在本地（或通过 Agent）重新执行部署命令，更新才会生效。
