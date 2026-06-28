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
- AI Agent 友好：原生支持 MCP，可让 Codex、Claude Code、Antigravity 等工具读取、整理和维护笔记。
- 同时适配 PC 与移动端，桌面管理和手机随手记录都顺手。
- 三栏布局：笔记本树、笔记列表、主编辑区。
- 无限级嵌套笔记本。
- 支持富文本编辑
- 笔记内图片可自动压缩，典型场景可节省约 80% 图片体积。
- 多选合并笔记。
- 多选移动笔记，笔记本支持拖拽排序和调整层级。
- PWA 可安装，支持静态应用壳离线打开和自动更新。
- 已有笔记支持离线编辑草稿和本地同步队列。
- 单用户登录，密码使用 PBKDF2-SHA256 hash。




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

先在 EdgeEver 左侧 **设置** 里创建 API Token，然后按客户端支持的方式接入。

Remote MCP / Streamable HTTP：

```text
https://你的域名/mcp
Authorization: Bearer <api-token>
```

stdio MCP 示例：

```json
{
  "mcpServers": {
    "edgeever": {
      "command": "bun",
      "args": ["/你的/edgeever/绝对路径/scripts/edgeever-mcp-stdio.mjs"],
      "env": {
        "EDGEEVER_URL": "https://你的域名",
        "EDGEEVER_TOKEN": "<api-token>"
      }
    }
  }
}
```

说明：

- `command` 需要本机已安装 Bun。
- `args` 改成你本机 EdgeEver 仓库里的绝对路径。
- `EDGEEVER_TOKEN` 来自 EdgeEver 左侧 **设置**。
- 只读 Agent 建议 scopes：`read:notebooks`、`read:memos`、`read:tags`；需要写入再加 `write:memos`。

## 开发者工具

CLI 不是 EdgeEver 面向 Agent 的主入口，只作为自托管场景下的调试、批处理、备份和迁移工具使用。

```sh
EDGEEVER_URL=https://你的域名 \
EDGEEVER_TOKEN=<api-token> \
bun run cli -- search edgeever
```

也可以保存为本机 profile，配置文件默认写入 `~/.edgeever/config.json`：

```sh
bun run cli -- profile set prod --url https://你的域名 --token <api-token>
bun run cli -- --profile prod notebooks
bun run cli -- --profile prod search edgeever
bun run cli -- --profile prod export <memo-id> --format markdown --out ./memo.md
```
