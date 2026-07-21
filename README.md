# EdgeEver

[简体中文](README.zh-CN.md) | English

> **EdgeEver: A serverless, 100% free, open-source, and AI-native self-hosted Evernote alternative on Cloudflare.**

EdgeEver is an open-source, self-hosted, Cloudflare-native notes workspace. It keeps the classic Evernote-style three-pane experience while providing a clear data model, REST API, OpenAPI schema, Remote MCP endpoint, and native AI Agent integration.

> 💡 **Serverless & 100% Free Forever**
> EdgeEver uses a pure Serverless architecture. **No server purchase or VPS rental is required**, and there is no need to configure Docker or SSL certificates. By running within Cloudflare's free quotas, personal use is **100% free with zero maintenance**.

## Why EdgeEver

Many long-time **Evernote** users only need a **reliable, open, and responsive** personal knowledge base. However, existing mainstream solutions all have their pain points:

* **Evernote**: It has become increasingly bloated with commercial ads and unnecessary add-ons, leading to poor performance and high memory usage. It also locks down your data, making it hard to export. The Chinese version (Yinxiang) does not support MCP, while the international version supports MCP but requires a subscription starting at $15/month with strict usage limits.
* **Obsidian**: Although open and customizable, it is too heavy for quick, on-the-go captures (especially on mobile). Official sync costs $5/month, while third-party sync solutions require significant setup effort.
* **Memos & lightweight notes**: Though open and simple, their stream-based layouts differ significantly from the classic Evernote-style three-pane workflow.

**EdgeEver is designed to fill this gap**: it retains the familiar classic three-pane note-taking experience, while providing fully open data models, REST API, native MCP support, and zero-cost self-hosted deployment.

> 💡 **My current best practice:**
> Use **EdgeEver** to quickly capture ideas and reminders as a raw "material library." When content needs structured organization, use **MCP** to let AI automatically organize and sync it into **Obsidian**, **Notion Database**, or **Feishu Bitable**.

## Online Demo

- Demo: [https://demo.edgeever.org](https://demo.edgeever.org)

The public demo resets every Monday at 1:00 AM (China Standard Time) and restores sample notes. Do not store private content there.

## Features

- Serverless, 100% free, and zero maintenance: Built on Cloudflare's Serverless architecture, running entirely within free tiers. Store up to 150k notes and 50k images without any hosting fees, while enjoying near-instant response times globally.
- Open data: notes are stored in Cloudflare D1, based on standard SQLite, and can be read and managed through REST API, MCP, and CLI without locking your data to a single notes product.
- EdgeEver ZIP import and export: one archive combines human-readable Markdown, Front Matter, nested notebook structure, and relative-path attachments with versioned structured data and revision history for complete recovery between EdgeEver instances.
- AI Agent friendly: built-in MCP support lets tools such as Codex, Claude Code, and Antigravity read, organize, and maintain notes, while enabling integrations with Notion databases and Feishu Bitable.
- Uncapped multi-device sync: self-hosted API means no restrictive commercial limits on the number of active login devices, supporting seamless synchronization across PC, tablet, and mobile (via PWA or browser).
- Three-pane layout: notebook tree, note list, and main editor.
- Unlimited nested notebooks.
- Rich text editing.
- Switch between Markdown source and rich text views on desktop.
- Note version history for reviewing previous content changes.
- Local browser-side image compression before upload, often reducing screenshots and large photos by about 50%-90%.
- Batch note merging.
- Batch note moving, notebook drag sorting, and hierarchy editing.
- Offline drafts and local sync queue for existing notes.
- Multi-user instances with isolated personal workspaces, owner-managed accounts, and PBKDF2-SHA256 password hashing.
- Chrome/Edge web clipper is officially published on the [Chrome Web Store](https://chromewebstore.google.com/detail/edgeever-web-clipper/gjadpfmanienmlofajibkfkkpfdkclgo).
- Support installing as a PWA app for a native-like experience on PC and mobile; the native mobile App (iOS / Android) is complete and under store review, with the Android APK available on the GitHub Releases page for immediate download.

## Deployment

Choose any one of the following three options to complete deployment.

### Option A: Deploy to Cloudflare (Recommended)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tianma-if/edgeever)

One-click deployment creates a dedicated GitHub repository and the required Cloudflare resources, then automatically redeploys after the repository's daily upstream sync; see [Deploy EdgeEver with Cloudflare](docs/deploy-cloudflare-button.md) for setup and troubleshooting.

### Option B: Deploy with an AI Agent

> 💡 **Note:** Under the hood, AI Agent deployment uses the exact same deterministic CLI commands (Wrangler and Bun scripts) as the manual flow. The AI agent simply executes these standard commands in the terminal on your behalf for convenience; it is not a non-deterministic, black-box deployment.
 
Copy this prompt into your AI coding assistant, such as Claude Code, Codex, OpenClaw, Antigravity, or Cursor. It uses the same deployment core as the button and manual flows:

**Recommendation:** Before deployment, configure GitHub and Cloudflare MCP servers, plugins, or other supported integrations for your AI Agent.

```text
Please follow these steps:
1. Create a GitHub repository from https://github.com/tianma-if/edgeever and clone it locally.
2. Follow docs/agent-deploy-cloudflare.md to create Cloudflare resources and run `bun run deploy:manual`.
3. Run `bun run deploy:builds:setup` to connect the deployed Worker to the repository's `main` branch through Cloudflare Workers Builds. If setup needs a token, use a User API Token, not an Account API Token.
4. Verify the first automatic build and the daily upstream-update workflow.
```

Agents should follow [AI Agent Cloudflare Deployment](docs/agent-deploy-cloudflare.md).

After the first deployment, see [Cloudflare Workers Builds](docs/cloudflare-workers-builds.md). All installation entry points use the same build, migration, deployment, and verification pipeline.

> Common pitfall: Cloudflare R2, D1, and Workers may still require a Visa card during activation or usage, even when you stay within the free quotas.

### Option C: Manual Deployment

Please refer to the [Cloudflare Manual Deployment Guide](docs/manual-deploy.md) for advanced first-time installation, Cloudflare resource setup, troubleshooting, and emergency recovery. After the first deployment, connect Workers Builds; future repository updates deploy automatically.

The automated helper commands are recommended. The manual template uses `admin` / `admin123` for the initial login, and the password can be changed later in Personal Settings. If you create the Cloudflare resources manually, finish configuring `.env.local`—including the D1 ID, R2 bucket, and the 400-day session limit—before running `bun run deploy:manual`.

Production deployments fail closed: when D1 migrations or the login Secret are missing, the instance shows a diagnosable configuration error and denies access instead of falling back to an unauthenticated workspace. Never insert plaintext passwords into D1; use the recovery command documented in the manual deployment guide.


## Multi-Account Login

Once deployed, a single instance supports multi-account login.

The instance administrator can create, disable, or reset member accounts in **Profile** -> **User accounts**. Each member gets a fully isolated personal workspace, including notebooks, notes, attachments, Trash, import/export, and MCP tokens.


## PWA Installation

EdgeEver can be installed as a PWA on desktop or mobile home screens. On desktop, open the site in Chrome or Edge and use the install icon in the address bar. On Android, open it in Chrome, use the three-dot menu, and choose **Add to Home screen** or **Install**. Avoid installing from embedded browsers such as WeChat.

> Common pitfall: When installing the PWA on mobile, Chrome or Edge is recommended. Other mobile browsers may encounter compatibility issues or unexpected errors during installation.

## Chrome/Edge Web Clipper

The Chrome/Edge web clipper is officially published. You can install it directly from the link below (Microsoft Edge users can also install directly from the Chrome Web Store):

- [Chrome Web Store Link](https://chromewebstore.google.com/detail/edgeever-web-clipper/gjadpfmanienmlofajibkfkkpfdkclgo)

## Native Clients

The initial app version is complete and currently under store review.

The desktop app remains on the roadmap and is planned to use Tauri.

## Tech Stack

- Bun workspace monorepo with Web, API, official site, and shared type package.
- Official site: Astro static site in `apps/site`, deployable to Cloudflare Pages.
- Frontend: Vite, React, React Router, TanStack Query, Tailwind CSS, shadcn/ui, and Radix UI.
- Editor: TipTap / ProseMirror with Markdown support; PWA uses vite-plugin-pwa, Workbox, and Dexie.
- Mobile app: Expo + React Native, with SQLite local storage and incremental sync.
- Web clipper: Manifest V3, Mozilla Readability, and Turndown for Chrome and Microsoft Edge.
- Backend: Cloudflare Workers, Hono, Zod, D1, and R2, with REST API, OpenAPI, and Remote MCP.

## Quick Start

Install dependencies:

```sh
bun install
```

Apply local D1 migrations:

```sh
bun run db:migrate:local
```

Start the default development environment. It applies pending local migrations and initializes local D1/R2 stores once with the repository's fixed demo seed. Existing local changes are preserved on later restarts, and no remote instance is contacted.

```sh
bun run dev
```

To intentionally develop against a configured remote instance, select it explicitly:

```sh
EDGE_EVER_INSTANCE=<name> bun run dev:remote
```

Checks:

```sh
bun run typecheck
bun run build
```

## Project Structure

```text
apps/web          Vite + React frontend, PWA, offline drafts, and sync queue
apps/extension    Chrome/Edge Manifest V3 web clipper
apps/api          Cloudflare Worker + Hono API, OpenAPI, MCP endpoint
apps/mobile       Expo + React Native mobile app
apps/site         Astro official website, deployable independently
packages/client   Shared API client for web and mobile apps
packages/shared   Shared types, Zod schemas, TipTap / Markdown conversion
scripts           Wrangler wrapper, password hash, CLI, MCP stdio bridge, Evernote ENEX import
migrations        D1 database migrations
docs              OpenAPI schema, migration guides, and deployment docs
wrangler.toml     Cloudflare Workers, Assets, D1, R2 configuration
```

## Content Formats

EdgeEver stores note content in three forms:

```text
content_json      TipTap/ProseMirror document, the editor source of truth
content_markdown  API, Agent, import, and export format
content_text      Search, summary, and indexing text
```

Open **Profile** -> **Import and export** to export or import an EdgeEver ZIP. Its `notes/` directory is directly readable and portable as Markdown, while its structured data supports complete recovery between EdgeEver instances. Import preserves unrelated target data and overwrites records with matching EdgeEver IDs.

## API

OpenAPI schema:

```text
https://your-domain/api/openapi.json
```

Repository file: [docs/openapi.json](docs/openapi.json).

## MCP

Create an API token in **Profile** -> **MCP settings**, then copy either the token or full MCP configuration into your AI Agent so it can install the MCP server and read or organize notes with permission.

With MCP, EdgeEver can also connect to tools such as Notion databases and Feishu Bitable, turning scattered ideas, information, and materials from everyday notes into structured data that is easier to organize, search, and manage.

## Image Compression

Image compression happens in the Web client before upload and is controlled by the **Compress note images** setting. When enabled, PNG, JPEG, WebP, and AVIF files are converted to WebP when beneficial, with the longest edge limited to `2560px`. If compression does not reduce size, the original file is kept.

EdgeEver avoids Worker-side image processing to reduce compute and image-processing quota usage. REST API and MCP upload paths store the file content provided by the client without additional server-side compression.

## Migration

If you want to migrate notes from other platforms to EdgeEver, please refer to the following simple migration guides:

- **Evernote Migration**: Please refer to [docs/evernote-migration-guide.md](docs/evernote-migration-guide.md)
- **Memos Migration**: Please refer to [docs/memos-migration-guide.md](docs/memos-migration-guide.md)
- **Notion Migration**: Please refer to [docs/notion-migration-guide.md](docs/notion-migration-guide.md)

## Community and Feedback

- Bugs, feature requests, and deployment issues: [GitHub Issues](https://github.com/tianma-if/edgeever/issues)

## Disclaimer

EdgeEver is an independent open-source note-taking application developed and maintained by individuals and the community. It is not affiliated with, authorized, sponsored, or endorsed by Evernote Corporation or its affiliates.
