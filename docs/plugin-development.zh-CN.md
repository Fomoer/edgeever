# EdgeEver 插件开发指南

[English](plugin-development.md)

EdgeEver 提供客户端插件与无代码主题扩展能力。用户可从官方市场、公开 GitHub 仓库或 Manifest 地址安装扩展。已安装扩展随当前工作区在 Web 与桌面端之间同步，在应用打开期间运行；Android 与 iOS 原生端暂不运行插件。

> [!NOTE]
> **安全模型**：客户端插件采用受信任代码模型（类似 Obsidian）。启用插件即代表信任其在客户端 JavaScript 环境中运行并调用插件 API。清单中的能力声明（Permissions）用于向用户披露插件涉及的功能范围，不构成强制安全沙箱。主题包为纯声明式 JSON，不执行任何 JavaScript。

---

## 目录

- [插件清单（Manifest）](#插件清单manifest)
  - [字段说明](#字段说明)
  - [可用权限标识](#可用权限标识)
- [插件入口与生命周期](#插件入口与生命周期)
- [API 参考](#api-参考)
  - [API 命名空间速查](#api-命名空间速查)
  - [1. 笔记与笔记本（Notes & Notebooks）](#1-笔记与笔记本notes--notebooks)
  - [2. 模板管理（Templates）](#2-模板管理templates)
  - [3. 资源附件（Resources）](#3-资源附件resources)
  - [4. 编辑器交互（Editor & Embeds）](#4-编辑器交互editor--embeds)
  - [5. 界面交互（UI, Commands & Panels）](#5-界面交互ui-commands--panels)
  - [6. 统一设置（Settings）](#6-统一设置settings)
  - [7. 数据存储与安全凭据（Storage & Secrets）](#7-数据存储与安全凭据storage--secrets)
  - [8. 网络请求（Network）](#8-网络请求network)
  - [9. 定时任务（Schedules，仅桌面端）](#9-定时任务schedules仅桌面端)
  - [10. 事件监听（Events）](#10-事件监听events)
  - [11. 人工智能（AI）](#11-人工智能ai)
- [主题扩展（Theme Manifest）](#主题扩展theme-manifest)
- [打包、分发与本地开发](#打包分发与本地开发)
  - [打包规范](#打包规范)
  - [GitHub 分发](#github-分发)
  - [本地测试与调试](#本地测试与调试)

---

## 插件清单（Manifest）

每个插件必须在根目录提供 `manifest.json`：

```json
{
  "type": "plugin",
  "id": "com.example.recent-notes",
  "name": "Recent Notes",
  "version": "1.0.0",
  "apiVersion": "2",
  "settingsUi": "host",
  "description": "查看最近更新的笔记。",
  "locales": {
    "zh-CN": {
      "name": "最近笔记",
      "description": "查看最近更新的笔记。"
    }
  },
  "entry": "./main.js",
  "platforms": ["web", "desktop"],
  "permissions": ["notes:read", "editor:read", "ui:commands", "ui:notices", "ui:panels"]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `type` | `"plugin"` | 是 | 固定为 `"plugin"`。 |
| `id` | `string` | 是 | 插件全局唯一标识，推荐反向域名格式（如 `com.example.plugin`）。 |
| `name` | `string` | 是 | 插件默认名称。 |
| `version` | `string` | 是 | 符合 SemVer 的版本号（如 `1.0.0`）。 |
| `apiVersion` | `"2"` | 是 | 插件 API 版本，当前固定为 `"2"`。 |
| `settingsUi` | `"host"` | 是 | 设置界面渲染方式，当前固定为 `"host"`（由宿主统一渲染）。 |
| `entry` | `string` | 是 | 入口脚本路径，GitHub 分发时固定为 `./main.js`。 |
| `description` | `string` | 否 | 插件默认描述。 |
| `locales` | `object` | 否 | 多语言本地化元数据，以 BCP 47 语言标签为键（如 `zh-CN`, `en-US`），覆盖 `name` 与 `description`。 |
| `platforms` | `string[]` | 否 | 支持的平台，可选 `"web"`、`"desktop"`。 |
| `permissions` | `string[]` | 否 | 能力声明列表，用于安装与更新时向用户披露。 |
| `settings` | `object` | 否 | 宿主渲染的配置项 Schema（详见下文）。 |

### 可用权限标识

声明权限用于在安装和更新界面向用户透明披露功能：
- **笔记与内容**：`notes:read`, `notes:write`, `notes:delete`, `templates:read`, `templates:write`, `metadata:read`, `metadata:write`, `resources:read`, `resources:write`
- **编辑器**：`editor:read`, `editor:write`
- **界面交互**：`ui:commands`, `ui:navigation`, `ui:notices`, `ui:panels`, `ui:embeds`
- **存储与系统**：`storage`, `secrets`, `network`, `network:public`, `schedules`
- **AI 能力**：`ai:generate`

---

## 插件入口与生命周期

插件入口文件（`main.js`）需导出一个包含 `activate` 生命周期的默认对象：

```js
export default {
  activate(context) {
    // 注册命令
    const disposeCommand = context.commands.register({
      id: "hello-world",
      title: "Say Hello",
      run() {
        context.ui.showNotice("Hello from EdgeEver Plugin!");
      }
    });

    // 返回清理函数（插件停用时执行）
    return () => {
      disposeCommand();
    };
  }
};
```

TypeScript 项目可使用 `@edgeever/plugin-api` 提供的辅助工具：

```ts
import { definePlugin } from "@edgeever/plugin-api";

export default definePlugin({
  activate(context) {
    return context.commands.register({
      id: "hello-world",
      title: "Say Hello",
      run: () => context.ui.showNotice("Hello!")
    });
  }
});
```

> [!TIP]
> 注册命令、面板、事件等接口均会返回清理函数；插件停用时，宿主也会自动回收其注册的命令与监听器。

---

## API 参考

### API 命名空间速查

插件上下文对象（`context`）提供以下能力接口：

| 命名空间 | 对应权限（披露用） | 核心方法 | 职责说明 |
| :--- | :--- | :--- | :--- |
| **`context.notes`** | `notes:read`<br>`notes:write`<br>`notes:delete` | `query()`, `queryContent()`, `get()`, `create()`, `update()`, `editMarkdown()`, `delete()`, `move()`, `pin()`, `restore()`, `revisions` | 笔记查询、正文读取、乐观并发编辑与版本管理 |
| **`context.notebooks`** | `metadata:read`<br>`metadata:write` | `list()`, `create()`, `update()`, `delete()` | 笔记本树状层级维护与增删改查 |
| **`context.tags`** | `metadata:read`<br>`metadata:write` | `list()`, `rename()`, `delete()` | 标签全局查询、重命名与删除 |
| **`context.templates`** | `templates:read`<br>`templates:write` | `list()`, `create()`, `update()`, `delete()`, `use()` | 模板增删改查及一键套用创建笔记 |
| **`context.resources`** | `resources:read`<br>`resources:write` | `list()`, `read()`, `upload()`, `update()`, `rename()`, `delete()` | 笔记图片及文件附件上传、下载、修改与管理 |
| **`context.editor`** | `editor:read`<br>`editor:write`<br>`ui:embeds` | `getSelection()`, `replaceSelection()`, `insertAtCursor()`, `getDocument()`, `editMarkdown()`, `insertEmbed()`, `embeds.register()` | 活动编辑器交互、实时文档修改与自定义块级 Embed |
| **`context.ui`** | `ui:navigation`<br>`ui:notices`<br>`ui:panels` | `showNotice()`, `openNote()`, `panels.register()`, `panels.open()` | 宿主全局提示、笔记精准跳转与自定义 DOM 面板 |
| **`context.commands`** | `ui:commands` | `register()` | 注册全局或编辑器命令（命令面板、工具栏快捷菜单） |
| **`context.settings`** | *(无)* | `get()`, `set()`, `remove()` | 读取与修改插件自身的宿主统一配置项 |
| **`context.storage`** | `storage` | `get()`, `set()`, `remove()` | 本地轻量键值存储（游标、偏好缓存，按插件与工作区隔离） |
| **`context.secrets`** | `secrets` | `get()`, `set()`, `remove()` | 本地加密的安全凭据存储（API Key、Token 等敏感数据） |
| **`context.network`** | `network`<br>`network:public` | `fetch(url, options)` | 网络请求（标准请求或跨域免凭据公开只读） |
| **`context.schedules`** | `schedules` | `upsert()`, `list()`, `remove()` | 桌面端持久化定时任务调度（应用开启期间运行） |
| **`context.events`** | *(无)* | `on(event, handler)` | 订阅工作区笔记、标签、模板及同步完成事件 |
| **`context.ai`** | `ai:generate` | `status()`, `generate()`, `transcribeResource()`, `transcribeMedia()` | 调用工作区配置的 AI 模型生成文本或转录音视频媒体 |

---

### 1. 笔记与笔记本（Notes & Notebooks）

#### 查询笔记

```ts
// 1. 查询轻量摘要列表（用于列表、侧边栏等，每页最多 200 条）
const result = await context.notes.query({
  notebookId: "optional-notebook-id",
  text: "关键词",
  tags: ["todo"],
  sort: "updated-desc", // "updated-desc" | "created-desc" | "title-asc"
  limit: 50,
  offset: 0
});
// 返回 { notes: PluginNoteSummary[], totalCount: number, nextOffset: number | null }

// 2. 查询包含完整 Markdown 内容的笔记（用于 Linter、索引扫描等）
const fullNotes = await context.notes.queryContent({
  tags: ["task"],
  limit: 20
});
```

#### 增删改查

```ts
// 获取单篇笔记详情
const note = await context.notes.get(noteId);

// 创建笔记
const newNote = await context.notes.create({
  notebookId: "target-notebook-id",
  title: "新笔记",
  contentMarkdown: "# 标题\n正文内容",
  tags: ["tag1"]
});

// 更新整篇笔记
await context.notes.update(noteId, {
  title: "更新后的标题",
  contentMarkdown: "新的正文",
  tags: ["updated"]
});

// 局部并发安全编辑（基于 revision 与 contentHash 进行乐观锁校验）
await context.notes.editMarkdown(noteId, {
  expectedRevision: note.revision,
  expectedContentHash: note.contentHash,
  edits: [
    { from: 0, to: 0, insert: "> 插入顶部引用\n\n" } // UTF-16 偏移量，半开区间 [from, to)
  ]
});

// 移动、置顶与删除
await context.notes.move([noteId], targetNotebookId);
await context.notes.pin([noteId], true);
await context.notes.delete(noteId, { permanent: false }); // 移入回收站
await context.notes.restore(noteId); // 从回收站恢复

// 历史版本
const revisions = await context.notes.revisions.list(noteId);
await context.notes.revisions.restore(noteId, revisionId);
```

#### 笔记本与标签

```ts
// 笔记本
const notebooks = await context.notebooks.list();
const nb = await context.notebooks.create({ name: "新建笔记本", parentId: null });
await context.notebooks.update(nb.id, { name: "新名称" });
await context.notebooks.delete(nb.id);

// 标签
const tags = await context.tags.list();
await context.tags.rename("old-tag", "new-tag");
await context.tags.delete("unused-tag");
```

---

### 2. 模板管理（Templates）

操作工作区内的公共模板或一键套用模板创建新笔记：

```ts
// 查询所有可用模板
const templates = await context.templates.list();

// 创建模板（可直接提供内容，或基于已有 noteId 生成）
const template = await context.templates.create({
  name: "会议纪要",
  description: "日常项目例会模板",
  contentMarkdown: "## 参会人员\n\n## 议题\n\n## 待办行动项\n",
  tags: ["meeting"]
});

// 更新模板
await context.templates.update(template.id, {
  name: "周会纪要",
  description: "每周团队例会"
});

// 套用模板在指定笔记本下创建新笔记
const note = await context.templates.use(template.id, targetNotebookId);

// 删除模板
await context.templates.delete(template.id);
```

---

### 3. 资源附件（Resources）

操作关联到笔记的媒体或文件附件：

```ts
// 获取笔记关联的所有附件
const resources = await context.resources.list(noteId);

// 读取附件 Blob
const blob = await context.resources.read(resourceId);

// 上传新附件
const uploaded = await context.resources.upload(noteId, file);

// 乐观并发更新附件内容（单文件上限 100 MiB）
await context.resources.update(resourceId, {
  file: newFile,
  expectedContentHash: currentResource.contentHash
});

// 重命名与删除
await context.resources.rename(resourceId, "document.pdf");
await context.resources.delete(resourceId);
```

---

### 4. 编辑器交互（Editor & Embeds）

用于在用户处于编辑状态时操作当前文档：

```ts
// 选区读取与替换
const selection = await context.editor.getSelection();
if (selection && !selection.empty) {
  await context.editor.replaceSelection(selection.text.toUpperCase());
}

// 在当前光标处插入内容
await context.editor.insertAtCursor("- [ ] 新建任务\n");

// 实时编辑当前正在编辑的文档（不会丢失未保存的内容）
const doc = await context.editor.getDocument();
if (doc) {
  await context.editor.editMarkdown([
    { from: 0, to: 0, insert: "<!-- 插件插入前缀 -->\n" }
  ]);
}
```

#### 自定义块级 Embed

插件可注册自定义块级渲染器并插入到文档中（保存为通用的 `edgeever-plugin-embed` 块）：

```ts
// 1. 注册 Embed 渲染器
context.editor.embeds.register({
  type: "my-diagram",
  async mount(container, embed) {
    const data = embed.data;
    container.innerHTML = `<div>图表预览: ${data.title}</div>`;
    return () => container.replaceChildren(); // 卸载清理
  }
});

// 2. 向文档中插入 Embed
await context.editor.insertEmbed({
  type: "my-diagram",
  title: "架构图",
  data: { mode: "preview", version: 1 } // JSON 兼容对象，上限 64 KiB
});
```

---

### 5. 界面交互（UI, Commands & Panels）

#### 命令注册

```ts
context.commands.register({
  id: "quick-action",
  title: "快速操作",
  listed: true, // 是否在市场卡片中展示，默认为 true；上下文命令建议设为 false
  menu: true,   // 是否在桌面端快捷菜单中展示，默认为 true
  async run() {
    context.ui.showNotice("操作执行成功");
  }
});
```

#### 笔记跳转

```ts
// 打开指定笔记并可选跳转至指定搜索关键词
await context.ui.openNote(noteId, { search: "关键定位词" });
```

#### 自定义 DOM 面板（Panels）

插件可以注册全屏或对话框形态的原生 DOM 面板：

```ts
context.ui.panels.register({
  id: "task-dashboard",
  title: "任务仪表盘",
  purpose: "dashboard", // "workflow" | "dashboard" | "preview" | "onboarding"
  presentation: "dialog", // "dialog" | "fullscreen"
  mount(container, { shell, requestClose, state }) {
    // 1. 使用宿主标准 Shell 控件（页头、搜索栏、分段切换等）
    shell.set({
      header: {
        title: "任务管理",
        description: "查看待办与进行中的任务",
        actions: [{ id: "refresh", label: "刷新" }]
      },
      toolbar: [
        {
          type: "tabs",
          key: "filter",
          value: "all",
          options: [{ value: "all", label: "全部" }, { value: "done", label: "已完成" }]
        },
        { type: "search", key: "q", placeholder: "搜索任务" }
      ],
      onAction(actionId) { /* 处理按钮点击 */ },
      onChange(key, value) { /* 处理筛选变更 */ }
    });

    // 2. 渲染插件自定义 DOM 内容
    const content = document.createElement("div");
    content.textContent = "内容区域";
    container.append(content);

    return () => content.remove(); // 卸载清理
  },
  beforeClose() {
    // 关闭防丢失保护：返回 true 允许关闭，false 阻止，或返回提示配置由宿主弹窗确认
    return true;
  }
});

// 打开面板
await context.ui.panels.open("task-dashboard", { state: { initialTab: "all" } });
```

---

### 6. 统一设置（Settings）

EdgeEver 由宿主统一渲染插件设置界面。在 `manifest.json` 中声明配置字段，无需手写设置页 UI：

```json
{
  "settings": {
    "fields": [
      { "key": "endpoint", "type": "text", "label": "API 地址", "required": true },
      { "key": "token", "type": "secret", "label": "API Token", "required": true },
      { "key": "autoSync", "type": "boolean", "label": "自动同步", "default": true },
      {
        "key": "mode",
        "type": "select",
        "label": "同步模式",
        "default": "fast",
        "options": [
          { "value": "fast", "label": "快速" },
          { "value": "full", "label": "完整" }
        ]
      }
    ]
  }
}
```

#### 读取与监听设置

```ts
// 读取设置值
const endpoint = await context.settings.get<string>("endpoint");
const token = await context.settings.get<string>("token");

// 监听当前插件设置变更
context.events.on("settings.changed", async ({ key }) => {
  if (key === "autoSync") {
    const autoSync = await context.settings.get<boolean>("autoSync");
    // 更新逻辑
  }
});
```

> [!NOTE]
> `type: "secret"` 字段会经过本地加密保存，不会明文回显在表单中。设置仅保存在当前设备，不跨端同步。

---

### 7. 数据存储与安全凭据（Storage & Secrets）

用于插件自身的数据持久化（按工作区与插件 ID 隔离存储在当前设备）：

```ts
// 普通键值存储（适合游标、偏好缓存）
await context.storage.set("last_sync_time", Date.now());
const lastSync = await context.storage.get<number>("last_sync_time");
await context.storage.remove("last_sync_time");

// 安全凭据存储（敏感 Token、密钥等，采用本地加密保存）
await context.secrets.set("api_key", "sk-xxx");
const apiKey = await context.secrets.get("api_key");
await context.secrets.remove("api_key");
```

---

### 8. 网络请求（Network）

```ts
// 1. 标准请求（支持任意 HTTP/HTTPS 请求，受宿主环境 CORS 策略约束）
const response = await context.network.fetch("https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "example" })
});
const data = await response.json();

// 2. 公开只读请求（无凭据读取跨域公开 RSS/API，仅支持 443 端口 HTTPS GET/HEAD）
const publicRes = await context.network.fetch("https://example.org/feed.xml", {
  transport: "public",
  headers: { Accept: "application/rss+xml" }
});
const xml = await publicRes.text();
```

---

### 9. 定时任务（Schedules，仅桌面端）

桌面端插件可注册定时计划执行已注册的命令（在 EdgeEver 打开期间运行）：

```ts
// 注册命令
context.commands.register({
  id: "sync-feed",
  title: "同步订阅",
  run: async () => { /* 耗时同步任务 */ }
});

// 配置定时计划（以 key 为唯一标识，激活时重复调用自动幂等更新）
await context.schedules.upsert({
  key: "hourly-sync",
  name: "每小时同步订阅",
  commandId: "sync-feed",
  cronExpression: "0 * * * *",
  missedRunPolicy: "run-once" // 错过的执行补跑一次 ("run-once" | "skip")
});

// 管理计划
const schedules = await context.schedules.list();
await context.schedules.remove("hourly-sync");
```

---

### 10. 事件监听（Events）

订阅工作区的数据变更事件：

```ts
// 监听笔记事件
context.events.on("note.created", ({ note }) => console.log("新建笔记", note.id));
context.events.on("note.updated", ({ note }) => console.log("笔记更新", note.id));
context.events.on("note.deleted", ({ noteId }) => console.log("笔记删除", noteId));

// 监听其他变更
context.events.on("tag.changed", () => { /* 标签更新 */ });
context.events.on("workspace.synced", () => { /* 工作区同步完成 */ });
```

---

### 11. 人工智能（AI）

调用用户当前工作区已配置的 AI 模型生成文本或转录媒体（凭据由宿主安全保管，插件无需知晓用户 API Key）：

```ts
// 1. 检查 AI 状态与当前配置模型
const status = await context.ai.status();
// { configured: boolean, modelName?: string }

if (status.configured) {
  // 2. 文本生成
  const result = await context.ai.generate({
    system: "你是一个专业的文本润色助手。",
    prompt: "请优化以下段落：...",
    maxOutputTokens: 2000,
    signal: abortController.signal
  });
  console.log("生成结果:", result.text);

  // 3. 转录笔记内已上传的音视频附件
  const transcript = await context.ai.transcribeResource(noteId, resourceId);
  // { text: string, resourceId: string, filename: string }

  // 4. 转录插件持有的独立媒体 Blob / File（无需先上传为笔记附件）
  const ownMedia = new File([audioBytes], "recording.mp3", { type: "audio/mpeg" });
  const mediaTranscript = await context.ai.transcribeMedia(ownMedia, {
    signal: abortController.signal
  });
  console.log("音频转录:", mediaTranscript.text);
}
```

---

## 主题扩展（Theme Manifest）

主题为纯无代码扩展，仅需一个 `manifest.json`：

```json
{
  "type": "theme",
  "id": "com.example.theme",
  "name": "Nord Emerald",
  "version": "1.0.0",
  "themeApiVersion": "1",
  "modes": ["light", "dark"],
  "light": {
    "color.background": "#f8fafc",
    "color.surface": "#ffffff",
    "color.text": "#0f172a",
    "color.accent": "#16a06e"
  },
  "dark": {
    "color.background": "#0f172a",
    "color.surface": "#1e293b",
    "color.text": "#f8fafc",
    "color.accent": "#4ade80"
  }
}
```

支持的 Token 包括：
- 颜色：`color.background`, `color.surface`, `color.surfaceMuted`, `color.text`, `color.textMuted`, `color.border`, `color.accent`, `color.accentForeground`, `color.success`, `color.warning`, `color.danger`（格式必须为 `#RRGGBB` 或 `#RRGGBBAA`）
- 排版与尺寸：`font.body`, `font.mono`, `font.size`, `lineHeight.body`, `radius.medium`, `density.scale`, `editor.contentWidth`

---

## 打包、分发与本地开发

### 打包规范

插件分发产物必须为免相对依赖的单个 Bundle 文件：
- `manifest.json`：插件清单
- `main.js`：打包后的单文件脚本（上限 5 MB）
- `styles.css`：可选样式表（上限 1 MB）

若使用 `@edgeever/plugin-api`，请在构建时将其内联打入 `main.js`。

### GitHub 分发

1. 将包含最新 `manifest.json` 的仓库发布在 GitHub（公开仓库）。
2. 创建 GitHub Release，Release Tag 匹配 Manifest 版本（如 `1.0.0` 或 `v1.0.0`）。
3. 在 Release 资产中上传 `manifest.json`、`main.js` 和可选的 `styles.css`。
4. 用户可在 EdgeEver 的「插件市场」页面直接输入仓库地址安装：
   ```text
   https://github.com/owner/edgeever-plugin
   ```

### 本地测试与调试

开发 EdgeEver 时，可直接在插件市场中输入本地 Manifest 地址进行调试：
- `/extensions/recent-notes/manifest.json`（官方示例插件）
- `/extensions/nord-emerald/manifest.json`（官方示例主题）

提交至官方已验证市场请参阅 [官方插件市场上架政策](plugin-marketplace-policy.zh-CN.md)。
