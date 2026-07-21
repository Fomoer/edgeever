# EdgeEver

简体中文 | [English](README.md)

> **EdgeEver：无需服务器、0 费用、开源且原生支持 AI Agent 的自托管『印象笔记』替代品。**

EdgeEver 是一个开源、自托管、Cloudflare-native 的现代笔记工作区。它保留经典印象笔记的三栏体验，同时提供清晰的数据模型、REST API、OpenAPI schema 和 MCP endpoint，原生支持 AI Agent 接入。
> 💡 **终身免服务器，100% 免费**
> EdgeEver 采用纯 Serverless（无服务器）架构。自部署时**你不需要购买任何云服务器**，也**不需要折腾复杂的 Docker 或 SSL 证书**。直接运行在 Cloudflare 的免费额度内，个人日常使用 **完全免费，0 费用，0 运维**。

## 为什么做 EdgeEver

很多长期使用**印象笔记**的用户，核心需求只是一个**可靠、开放、响应足够快**的个人知识库。然而，当下的主流方案都各有痛点：

* **印象笔记**：功能日益臃肿，商业化广告和附加功能不断增加，性能与内存占用差强人意；且数据封闭，很难直接导出，国内版更不支持 MCP 联动；国际版虽支持 MCP，但入门套餐每月需 15 美元且有严格的额度限制。
* **Obsidian**：虽然足够开放，但对于“随时随地随手记”的轻量场景来说太重了；且官方同步收费（每月 5 美元），第三方同步方案门槛和折腾成本较高。
* **Memos 等轻量笔记**：虽然足够开放好用，但其流式布局与经典印象笔记式的“三栏工作流”有着天然的交互差异。

**EdgeEver 旨在填补这个空白**：它保留了用户最熟悉的经典三栏笔记体验，同时提供完全开放的数据模型、REST API、MCP 原生支持以及零成本自托管部署。

> 💡 **我目前研究的最佳实践是：**
> 用 **EdgeEver** 随手快速记录灵感与备忘，作为灵感的“原料库”；当需要进行结构化整理时，再通过 **MCP** 联动 AI，将内容自动同步并整合到 **Obsidian**、**Notion Database** 或**飞书多维表格**中。

## 在线演示

- Demo 地址：[https://demo.edgeever.org](https://demo.edgeever.org)

公开演示环境会在每周一凌晨 1:00（北京时间）自动重置并恢复示例笔记，请不要保存私密内容。

## 功能

- 零服务器，零运维，终身完全免费：基于 Cloudflare 无服务器架构与免费级配额，短笔记可达 15 万条，200KB 图片约可存放 5 万张，彻底免去云服务器租用和维护成本，并带来全球秒开的极速响应。
- 数据完全开放：笔记内容存放在基于标准 SQLite 的 Cloudflare D1 中，可通过 REST API、MCP 和 CLI 按需读取与管理，不用担心被单一笔记产品绑定。
- EdgeEver ZIP 导入与导出：同一份档案既包含便于直接阅读和迁移的 Markdown、Front Matter、嵌套笔记本结构与相对路径附件，也包含用于 EdgeEver 实例间完整恢复的版本化结构数据和历史版本。
- AI Agent 友好：原生支持 MCP，可让 Codex、Claude Code、Antigravity 等工具读取、整理和维护笔记，并可借助 MCP 与 Notion Database、飞书多维表格进行联动。
- 多端无缝同步且不限设备数：基于自建的 API 个人独享数据，摆脱商业笔记平台对登录设备数量的强制限制（如免费版只允许登录 2 台设备等），支持 PC、平板与手机无缝多端同步。
- 三栏布局：笔记本树、笔记列表、主编辑区。
- 无限级嵌套笔记本。
- 支持富文本编辑。
- 桌面端支持 Markdown 源码与富文本视图切换。
- 支持查看笔记历史版本，便于回溯内容变化。
- 笔记图片上传前支持 Web 端本地压缩，常见截图和大尺寸照片通常可减少约 50%-90% 体积，减少资源占用且不消耗 Cloudflare Images 额度。
- 多选合并笔记。
- 多选移动笔记，笔记本支持拖拽排序和调整层级。
- 已有笔记支持离线编辑草稿和本地同步队列。
- 支持单实例多账号，每个账号拥有隔离的个人笔记空间；管理员可创建、停用和重置成员账号，密码使用 PBKDF2-SHA256 hash。
- Chrome/Edge 网页裁剪插件已正式上架 [Chrome Web Store](https://chromewebstore.google.com/detail/edgeever-web-clipper/gjadpfmanienmlofajibkfkkpfdkclgo)。
- 支持安装为 PWA 应用，PC 和移动端均可流畅访问；原生移动端 App（iOS / Android）已开发完成并已提交上架审核，安卓用户可直接在 Release 页面下载 APK 抢先体验。

## 部署

以下三种方案任选其一即可完成部署。

### 方案 A：Cloudflare 一键部署（推荐）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tianma-if/edgeever)

一键部署会创建专属 GitHub 仓库和所需 Cloudflare 资源，并在仓库每日同步上游版本后自动触发重新部署；配置与排错见[使用 Cloudflare 一键部署 EdgeEver](docs/deploy-cloudflare-button.zh-CN.md)。

### 方案 B：通过 AI Agent 一句话部署
 
> 💡 **提示：** AI Agent 部署的底层逻辑与标准的手动部署完全一致。AI 助手只是代为在终端执行标准的、确定性的配置与部署命令（如 `wrangler` 和 `bun` 脚本），并非使用非确定性的黑盒部署方式。

将下方提示词复制给你的 AI 助手（Claude Code、Codex、OpenClaw、Antigravity、Cursor 等）。该入口与一键部署和手动部署共用同一套部署内核。

**建议：** 开始部署前，请先为 AI Agent 配置 GitHub 和 Cloudflare 的 MCP、插件或其他可用集成。

```text
请按以下流程操作：
1. 基于 https://github.com/tianma-if/edgeever 创建 GitHub 仓库并克隆到本地。
2. 严格按照 docs/agent-deploy-cloudflare.md 创建 Cloudflare 资源并运行 `bun run deploy:manual`。
3. 运行 `bun run deploy:builds:setup`，通过 Cloudflare Workers Builds 将已部署的 Worker 连接到仓库的 `main` 分支；如需 token，使用 User API Token，不要使用 Account API Token。
4. 验证首次自动构建和每日上游更新工作流。
```

Agent 应优先按 [AI Agent Cloudflare Deployment](docs/agent-deploy-cloudflare.md) 执行。首次部署后，请参阅 [Cloudflare Workers Builds 自动部署](docs/cloudflare-workers-builds.zh-CN.md)。所有安装入口共用同一套构建、migration、发布和验证流水线。

> 常见踩坑：Cloudflare 的 R2、D1 和 Worker 即使使用免费额度，在开通或使用过程中也可能要求绑定一张 Visa 卡。国内用户可以考虑办理招商银行多币种卡，拿到 Visa 卡后绑定到 Cloudflare 账号即可。

### 方案 C：手动部署

关于高级首次安装、Cloudflare 资源配置、故障排查与紧急修复，请参考 [Cloudflare 手动部署指南](docs/manual-deploy.zh-CN.md)。首次部署后，请配置 Cloudflare Workers Builds；之后仓库更新会自动部署。

推荐优先使用自动化辅助命令。手动配置模板使用 `admin` / `admin123` 作为初始登录账号密码，之后可在个人设置中修改密码。如果选择完全手动创建 Cloudflare 资源，必须先在 `.env.local` 中完成 D1 ID、R2 bucket 和 400 天会话期限等配置，再执行 `bun run deploy:manual`。

生产部署采用安全关闭策略：D1 未迁移或登录 Secret 缺失时，实例会显示可诊断的配置错误并拒绝访问，不会自动退化成免登录模式。请勿直接向 D1 写入明文密码；故障恢复命令见手动部署指南。


## 多账号登录

部署完成后，单个实例支持多账号登录。

实例管理员可以在 **个人中心** -> **账号管理** 中创建、停用成员账号或重置密码。每个成员拥有完全隔离的个人空间，包括笔记本、笔记、附件、回收站、导入导出和 MCP Token 等。


## PWA 安装说明

PWA 可以把 EdgeEver 像普通应用一样安装到桌面或手机主屏幕，打开更方便，也能配合浏览器能力提供更接近原生 App 的使用体验。

PC 端请使用 Chrome/Edge 打开站点，点击地址栏右侧的“安装”图标并确认。Android 建议用 Chrome 打开站点，点右上角三点菜单，选择“添加到主屏幕”，再点“安装”。Edge 可尝试菜单中的“添加到手机 / 添加到主屏幕 / 安装应用”，不同版本可能只创建快捷方式。请不要从微信等 App 内置浏览器安装。

> 常见踩坑：移动端安装 PWA 时，建议优先使用 Chrome 或 Edge。其他移动浏览器在安装过程中可能出现兼容性问题或异常报错。

## Chrome/Edge 网页裁剪插件

Chrome/Edge 网页裁剪插件已正式上架，您可以通过以下链接直接安装使用（Edge 浏览器亦可直接在 Chrome 应用商店中安装）：

- [Chrome Web Store 安装地址](https://chromewebstore.google.com/detail/edgeever-web-clipper/gjadpfmanienmlofajibkfkkpfdkclgo)

## 关于客户端

APP端初版已开发完成，上架审核中。

桌面端 App 仍在规划中，计划基于 Tauri 构建。

## 技术栈

- Bun workspace monorepo，包含 Web、API、官网与共享类型包。
- 官网：Astro 静态站点，位于 `apps/site`，可独立构建并部署到 Cloudflare Pages。
- 前端：Vite、React、React Router、TanStack Query，UI 基于 Tailwind CSS、shadcn/ui、Radix UI。
- 编辑器：TipTap / ProseMirror，支持 Markdown；PWA 使用 vite-plugin-pwa、Workbox、Dexie。
- 移动 App：Expo + React Native，采用 SQLite 本地存储与增量同步。
- 网页裁剪：Manifest V3、Mozilla Readability、Turndown，支持 Chrome 与 Microsoft Edge。
- 后端：Cloudflare Workers、Hono、Zod、D1、R2，提供 REST API、OpenAPI 与 Remote MCP。

## 快速开始

安装依赖：

```sh
bun install
```

应用本地 D1 迁移：

```sh
bun run db:migrate:local
```

启动默认开发环境。它会先应用本地迁移，并在首次启动时使用仓库内固定的 Demo 种子初始化本地 D1/R2；后续重启会保留本地修改，且不会连接任何远程实例。

```sh
bun run dev
```

如需明确连接已配置的远程实例，必须显式指定实例名：

```sh
EDGE_EVER_INSTANCE=<实例名> bun run dev:remote
```

常用检查：

```sh
bun run typecheck
bun run build
```

## 目录结构

```text
apps/web          Vite + React 前端、PWA、离线草稿与同步队列
apps/extension    Chrome/Edge Manifest V3 网页裁剪插件
apps/api          Cloudflare Worker + Hono API、OpenAPI、MCP endpoint
apps/mobile       Expo + React Native 移动端 App
apps/site         Astro 官方网站，可独立部署
packages/client   Web 与移动端共享的 API Client
packages/shared   共享类型、Zod schema、TipTap / Markdown 内容转换
scripts           Wrangler 封装、密码 hash、CLI、MCP stdio bridge、Evernote ENEX 导入
migrations        D1 数据库迁移
docs              OpenAPI schema、迁移指南等文档
wrangler.toml     Cloudflare Workers、Assets、D1、R2 配置
```

## 内容格式

EdgeEver 同时保存三种内容形态：

```text
content_json      TipTap/ProseMirror 文档，编辑器权威格式
content_markdown  API、Agent、导入导出使用
content_text      搜索、摘要和索引使用
```

请打开 **我的** -> **导入与导出**，导出或导入 EdgeEver ZIP。压缩包中的 `notes/` 目录可直接作为 Markdown 阅读和迁移，结构化数据则用于在 EdgeEver 实例之间完整恢复；导入时目标实例中的无关数据会保留，相同 EdgeEver ID 的内容会被覆盖。

## API 文档

OpenAPI schema：

```text
https://你的域名/api/openapi.json
```

仓库内文件：[docs/openapi.json](docs/openapi.json)。

## MCP

先在 EdgeEver 左下角 **个人中心** 的 **MCP 设置** 里创建 API Token，然后复制API Token或者复制整个MCP配置，发送给AI Agent，让他安装此MCP。
然后即可授权AI Agent读取和整理笔记。
> 放飞你的思路，这种情况下是有很多灵活玩法：
比如让AI Agent归纳你随机记录的灵感创意、针对你的笔记做精准的人物画像、构建自己的知识图谱、自动为笔记打标签）
借助 MCP，EdgeEver 还可以与 Notion Database、飞书多维表格等工具联动，把日常笔记中零散的灵感、信息和素材沉淀到结构化数据库中，方便后续整理、检索与管理。
## 图片压缩规则

图片压缩仅在 Web 端上传前执行，由设置页的“压缩笔记内图片”开关控制。启用后，浏览器会把 PNG、JPEG、WebP、AVIF 尝试压缩为 WebP，并将最长边限制在 `2560px` 以内；如果压缩结果不比原图小，则保留原图。

Cloudflare Worker 侧执行图片处理会消耗计算/图片处理额度，因此 EdgeEver 将图片压缩放在 Web 客户端完成；REST API 或 MCP 上传入口会按客户端提供的文件内容直接入库，不再由服务端自动压缩。

## 导入与迁移 (Migration)

如果你想从其他笔记软件迁移到 EdgeEver，请参考以下极简迁移指引：

- **印象笔记（Evernote）的迁入**：请参考 [docs/evernote-migration-guide.md](docs/evernote-migration-guide.md)
- **Memos 笔记的迁入**：请参考 [docs/memos-migration-guide.md](docs/memos-migration-guide.md)
- **Notion 笔记的迁入**：请参考 [docs/notion-migration-guide.md](docs/notion-migration-guide.md)

## 社区与反馈

- Bug、功能建议和部署问题请优先提交 [GitHub Issues](https://github.com/tianma-if/edgeever/issues)，方便后续用户检索和复用解决方案。
- 微信：`m1245207870`（请备注 EdgeEver）

### 微信交流群

欢迎加入 EdgeEver AI 交流群，讨论 EdgeEver 使用、AI 工具、智能体、工作流和其他 AI 话题。

> 群二维码 7 天内有效。如果二维码过期，请添加微信 `m1245207870`，并备注“EdgeEver 进群”。

<p align="center">
  <img src="assets/wechat-group-qr.jpg" alt="EdgeEver AI 交流群二维码" width="360" />
</p>

## 免责声明

EdgeEver 是一款完全独立的开源笔记软件，由个人和社区自主开发维护。本项目与 Evernote®（印象笔记）及其关联公司不存在任何商业合作、授权、赞助或隶属关系。
