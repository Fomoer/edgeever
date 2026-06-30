# EdgeEver

> **EdgeEver: A self-hosted, Cloudflare-native Evernote alternative.**
>
> **EdgeEver：基于 Cloudflare 全家桶自托管的开源『印象笔记』。**

EdgeEver 是一个开源、自托管、Cloudflare-native 的现代笔记工作区。它保留经典印象笔记的三栏体验，同时提供清晰的数据模型、REST API、OpenAPI schema 和 MCP endpoint。

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/msh01/edgeever">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

## 在线演示

- Demo 地址：[https://demo.edgeever.org](https://demo.edgeever.org)
- 演示账号：`ee-demo`
- 演示密码：`demo#dZ6Q29Zjfor%`

公开演示环境可能会被重置，请不要保存私密内容。

## 功能

- 个人使用几乎可以零成本托管：基于 Cloudflare D1 + R2 免费额度，短笔记可达 10 万条量级，200KB 图片约可存放 5 万张。
- 数据完全开放：笔记内容存放在基于标准 SQLite 的 Cloudflare D1 中，可通过 REST API、MCP 和 CLI 按需读取、迁移或导出，不用担心被单一笔记产品绑定。
- AI Agent 友好：原生支持 MCP，可让 Codex、Claude Code、Antigravity 等工具读取、整理和维护笔记。
- 同时适配 PC 与移动端，支持网页访问与 PWA 安装，桌面管理和手机随手记录都顺手。
- 三栏布局：笔记本树、笔记列表、主编辑区。
- 无限级嵌套笔记本。
- 支持富文本编辑。
- 笔记内图片支持 Web 端本地压缩，减少资源占用且不消耗 Cloudflare Images 额度。
- 多选合并笔记。
- 多选移动笔记，笔记本支持拖拽排序和调整层级。
- 已有笔记支持离线编辑草稿和本地同步队列。
- 单用户登录，密码使用 PBKDF2-SHA256 hash。

> 移动端安装 PWA 时建议使用 Chrome 浏览器，部分移动端浏览器可能无法正常完成安装。

## 技术栈

- 前端：Vite、React、Shadcn UI、Tailwind CSS、TipTap、TanStack Query、Dexie。
- 后端：Cloudflare Workers、Hono。
- 存储：Cloudflare D1、Cloudflare R2。
- 工具链：Bun、Wrangler、TypeScript。

## 快速开始

安装依赖：

```sh
bun install
```

应用本地 D1 迁移：

```sh
bun run db:migrate:local
```

启动本地开发：

```sh
bun run dev
```

常用检查：

```sh
bun run typecheck
bun run build
```

## 部署

最简单的方式是点击上方 **Deploy to Cloudflare** 按钮，根据 Cloudflare 向导完成授权和部署。

如果使用 CLI 部署：

```sh
cp .env.local.example .env.local
bunx wrangler d1 create edgeever
bunx wrangler r2 bucket create edgeever-resources
bun run auth:hash -- <你的密码>
bun run deploy
```

把 D1 创建命令返回的 `database_id` 和密码 hash 填入本机 `.env.local`。

## 目录结构

```text
apps/web       Vite + React 前端
apps/api       Cloudflare Worker + Hono API
packages/shared 共享类型、schema 和内容转换
migrations     D1 数据库迁移
wrangler.toml  Cloudflare Workers 配置
```

## 内容格式

EdgeEver 同时保存三种内容形态：

```text
content_json      TipTap/ProseMirror 文档，编辑器权威格式
content_markdown  API、Agent、导入导出使用
content_text      搜索、摘要和索引使用
```

## API 文档

OpenAPI schema：

```text
https://你的域名/api/openapi.json
```

仓库内文件：[docs/openapi.json](docs/openapi.json)。

## MCP

先在 EdgeEver 左下角 **个人中心** 的 **MCP 设置** 里创建 API Token，然后按客户端支持的方式接入。

Remote MCP / Streamable HTTP：

```text
https://你的域名/mcp
Authorization: Bearer <api-token>
```

## 图片压缩规则

图片压缩仅在 Web 端上传前执行，由设置页的“压缩笔记内图片”开关控制。启用后，浏览器会把 PNG、JPEG、WebP、AVIF 尝试压缩为 WebP，并将最长边限制在 `2560px` 以内；如果压缩结果不比原图小，则保留原图。

Worker 端不会调用 Cloudflare Images，也不会在 REST API 或 MCP 上传时自动压缩图片；这些入口会按客户端提供的文件内容直接入库。
