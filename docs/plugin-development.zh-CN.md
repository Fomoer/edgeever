# EdgeEver 插件开发（P0 预览版）

EdgeEver P0 扩展 API 支持受信任的客户端插件和无代码主题包。用户可以从已验证插件市场、公开 GitHub 仓库或 Manifest 地址安装扩展；扩展安装在当前设备，并且只在 EdgeEver 打开期间运行。桌面端用户可以为已注册的插件命令设置定时计划，并在 EdgeEver 运行期间执行。当前预览版不包含 Webhook、服务端常驻后台运行时、不受约束的 TipTap 扩展和严格的 JavaScript 沙箱。

## 安全模型

主题包只包含经过校验的 Manifest 和公开 Design Tokens，不执行 JavaScript。

客户端插件采用类似 Obsidian 的受信任代码模型。启用插件即代表信任它使用完整的 EdgeEver 插件上下文；能力声明只是可选的描述性元数据，不限制 API 调用。插件模块运行在客户端 JavaScript 环境中，因此用户只能安装来自可信开发者的插件。

用户在一台设备上首次启用社区客户端插件时，EdgeEver 会显示一次社区插件信任确认；确认后不会对每个插件重复提示。官方插件（发布者为 EdgeEver）不会触发该确认。主题包不能执行 JavaScript，因此也不会触发该确认。

公开 API 不会向插件暴露 EdgeEver Repository、IndexedDB 数据库、Cloudflare Binding 或 React 内部状态。

## 插件 Manifest

```json
{
  "type": "plugin",
  "id": "com.example.recent-notes",
  "name": "Recent Notes",
  "version": "1.0.0",
  "apiVersion": "2",
  "settingsUi": "host",
  "description": "Adds a command for recent notes.",
  "entry": "./main.js",
  "platforms": ["web", "desktop"],
  "permissions": ["notes:read", "editor:read", "ui:commands", "ui:notices", "ui:panels"]
}
```

Manifest 和 JavaScript 模块必须返回允许 EdgeEver 来源访问的 CORS 响应头。相对 `entry` 地址基于 Manifest 地址解析。

## 通过 GitHub 分发

开发者可以把公开 GitHub 仓库地址直接分享给用户。仓库默认分支根目录必须包含最新的 `manifest.json`，每个版本通过 GitHub Release 发布。Release Tag 使用 Manifest 中的版本号或带 `v` 前缀的版本号，例如 `1.2.0` 或 `v1.2.0`。

Release 必须上传以下资产：

```text
manifest.json
main.js
styles.css（可选）
```

GitHub 插件的 `entry` 固定为 `./main.js`，`main.js` 必须是无需相对模块导入的单文件 Bundle。EdgeEver 会读取默认分支 Manifest、查找相同版本的 Release、并行下载资产、验证 GitHub 提供的 SHA-256 Digest（如果存在），然后把验证后的包缓存到当前设备的 IndexedDB。插件市场的 GitHub 元数据和 Release 资产都由当前 EdgeEver 实例代理获取，因此桌面端或浏览器不必直接访问 `api.github.com`。`main.js` 上限为 5 MB，`styles.css` 上限为 1 MB。

EdgeEver 会在插件市场页面打开、窗口重新获得焦点及每 30 分钟检查一次更新。Registry 条目声明 `"publisher": "edgeever"` 的市场安装属于 EdgeEver 官方扩展。应用内 Registry 版本是已校验的基线；EdgeEver 会通过实例解析 GitHub 默认分支上的最新 Release，并自动更新到该校验和固定版本。社区市场扩展以及从 GitHub 或 Manifest 地址直接安装的扩展绝不会静默更新，用户必须点击「更新」并确认；如果手动确认的新版改变能力声明或旧版网络域名元数据，确认框会列出这些变化供用户查看。GitHub 分发的 Release `manifest.json` 必须与默认分支中用于提示更新的 Manifest 完全一致，否则安装会被拒绝。

升级采用可回滚切换：新旧版本的包会分别缓存；如果新版无法激活，EdgeEver 会恢复原 Manifest、原启用状态和上一版本代码，而不是留下一个被破坏或被停用的插件。

用户在独立的「插件市场」页面中粘贴以下地址即可自由安装，无需经过官方市场收录：

```text
https://github.com/owner/edgeever-plugin
```

目前仅支持公开 GitHub 仓库；私有仓库 Token 尚未开放。

## 已验证插件市场

官方插件市场仅收录自由及开源插件。每个上架版本都必须提供完整且人类可读的源码、认可的开源许可证、构建信息，以及可追溯的公开源码版本。该要求仅适用于官方市场准入；用户仍可自由通过 GitHub 或 Manifest 地址安装其他插件。完整要求参阅[官方插件市场上架政策](plugin-marketplace-policy.zh-CN.md)。

插件市场是一个经过校验的 Registry，不接管插件所有权。Registry 为每个版本固定插件 ID、GitHub 仓库、版本号及 `manifest.json`/`main.js`/`styles.css` 的 SHA-256；安装时仍从开发者的 GitHub Release 或登记的公开地址下载，并再次核对校验和。可选的 `"publisher": "edgeever"` 标记仅保留给 EdgeEver 项目维护的 Registry 条目；它会启用自动更新，社区投稿不得使用。

Registry 格式：

```json
{
  "registryVersion": "1",
  "updatedAt": "2026-08-16T00:00:00.000Z",
  "entries": [{
    "id": "com.example.recent-notes",
    "name": "Recent Notes",
    "description": "Shows recently updated notes.",
    "author": "EdgeEver",
    "publisher": "edgeever",
    "category": "Productivity",
    "repositoryUrl": "https://github.com/example/edgeever-recent-notes",
    "distribution": {
      "type": "github",
      "repositoryUrl": "https://github.com/example/edgeever-recent-notes"
    },
    "verification": {
      "version": "1.0.0",
      "checksums": {
        "manifestJson": "<64 位 SHA-256>",
        "mainJs": "<64 位 SHA-256>"
      }
    }
  }]
}
```

市场安装显示“已验证”，GitHub 或 Manifest 自由安装会明确显示未经验证的来源，但 EdgeEver 不阻止用户安装。卸载插件时会同时删除本机缓存的全部插件版本、当前工作区的普通插件存储和 Secret Storage。

以下能力声明仅用于披露和向后兼容，均为可选：

- `notes:read`
- `notes:write`
- `notes:delete`
- `templates:read`
- `templates:write`
- `metadata:read`
- `metadata:write`
- `resources:read`
- `resources:write`
- `network`
- `storage`
- `secrets`
- `schedules`
- `editor:read`
- `editor:write`
- `ui:commands`
- `ui:navigation`
- `ui:notices`
- `ui:panels`
- `ui:embeds`

通过 `context.network.fetch()` 访问网络不受能力声明或静态域名列表限制。`networkHosts` 仅作为兼容旧版的描述性元数据保留，不参与拦截。插件需要无凭据读取跨域公开响应时，可以使用匿名只读的 `network:public` 传输。

## 插件入口

```js
export default {
  activate(context) {
    return context.commands.register({
      id: "count-recent-notes",
      title: "Count recent notes",
      async run() {
        const result = await context.notes.query({
          sort: "updated-desc",
          limit: 10
        });
        context.ui.showNotice(`${result.notes.length} recent notes`);
      }
    });
  }
};
```

TypeScript 项目可以从 `@edgeever/plugin-api` 导入类型与辅助函数：

```ts
import { definePlugin } from "@edgeever/plugin-api";

export default definePlugin({
  activate(context) {
    // 在这里注册命令和事件监听器。
  }
});
```

每次注册都会返回清理函数。插件停用时，宿主也会自动清理已注册的命令和事件。

## 定时任务 API

桌面插件可以持久化定时执行自己的已注册命令。先注册命令，再用稳定的插件内计划键调用 `upsert()`：

```js
export default {
  async activate(context) {
    context.commands.register({
      id: "refresh-feeds",
      title: "刷新订阅源",
      async run() {
        // 只要桌面端保持运行，插件命令就可以执行耗时任务。
      }
    });

    await context.schedules.upsert({
      key: "hourly-refresh",
      name: "每小时刷新订阅源",
      commandId: "refresh-feeds",
      cronExpression: "0 * * * *",
      missedRunPolicy: "run-once"
    });
  }
};
```

`upsert()` 以“插件 ID + 计划键”为幂等标识，因此插件每次激活时调用也不会重复创建。第一台创建计划的桌面设备会保持为执行设备；同一插件在另一台电脑激活时只更新同一份计划定义，不会抢走执行权。省略 `isEnabled` 会保留用户的启停选择。插件可以通过 `context.schedules.list()` 查看自己的计划，并用 `context.schedules.remove(key)` 删除。

执行中心只保留最近 30 天的定时任务执行记录。过期记录会在升级时立即清理，并在后续执行或查看记录时持续物理删除。

### SDK 包

`@edgeever/plugin-api` 是可发布的 ESM 包，包含生成后的 JavaScript 和 TypeScript 声明。在 EdgeEver 仓库中修改公开契约后，需要重新构建：

```sh
bun run build:plugin-api
```

维护者可以在不发布的情况下检查最终公开包内容：

```sh
cd packages/plugin-api
npm pack --dry-run
```

构建后的包只包含 `dist/index.js`、`dist/index.d.ts`、README 和包元数据。插件项目应把 SDK 运行时辅助函数一并打入单文件 `main.js`，发布包中不能残留对 `@edgeever/plugin-api` 的运行时导入。

## 笔记 API

```ts
context.notes.query({ text, notebookId, tags, sort, limit, offset });
context.notes.queryContent({ text, notebookId, tags, sort, limit, offset });
context.notes.get(noteId);
context.notes.editMarkdown(noteId, { expectedRevision, expectedContentHash, edits });
context.notes.create({ notebookId, title, contentMarkdown, tags });
context.notes.update(noteId, { title, contentMarkdown, tags });
context.notes.delete(noteId, { permanent: false });
context.notes.move([noteId], notebookId);
context.notes.pin([noteId], true);
context.notes.restore(noteId);
context.notes.revisions.list(noteId);
context.notes.revisions.restore(noteId, revisionId);
context.notebooks.list();
context.notebooks.create({ name, parentId });
context.notebooks.update(notebookId, { name, parentId, sortOrder });
context.notebooks.delete(notebookId);
context.tags.list();
context.tags.rename("old", "new");
context.tags.delete("unused");
```

`notes.query()` 返回轻量摘要。当插件必须扫描多篇笔记的 Markdown 时，例如 Tasks 索引、日历、看板或 Linter，应使用 `notes.queryContent()`。两个接口每页最多返回 200 篇笔记；持续使用 `nextOffset` 翻页，直到它为 `null`。不需要正文时应优先使用摘要查询。

所有写入都经过 EdgeEver 的共享 Repository 和业务层，包括离线队列与桌面端适配器。插件不能直接访问具体存储实现。
`notes.update()` 会读取当前版本并返回更新后的完整笔记。
`notes.editMarkdown()` 使用 `notes.get()` 返回的 `revision` 与 `contentHash` 做乐观并发检查。它适合任务勾选、Linter 和索引维护等只修改 Markdown 局部内容的插件：

```ts
const note = await context.notes.get(noteId);
await context.notes.editMarkdown(noteId, {
  expectedRevision: note.revision,
  expectedContentHash: note.contentHash,
  edits: [
    { from: 2, to: 3, insert: "x" },
    { from: note.contentMarkdown.length, to: note.contentMarkdown.length, insert: "\n追加内容" }
  ]
});
```

编辑区间使用 JavaScript UTF-16 字符串偏移和半开区间 `[from, to)`。一次调用中的区间不得重叠、越界或切开 Unicode 代理对。笔记基线已经变化或当前编辑器存在未保存内容时，宿主拒绝写入并抛出带 `code: "NOTE_CONFLICT"` 的错误；插件应重新读取并要求用户重试。无效区间使用 `code: "INVALID_MARKDOWN_EDIT"`。SDK 导出 `PluginApiError` 和 `PluginApiErrorCode` 供 TypeScript 插件缩小错误类型。
启用后的插件无需能力门禁即可读取和修改笔记本与标签。

附件继续通过 Web/桌面端共用的 Repository 适配器执行：

```ts
context.resources.list(noteId);
const blob = await context.resources.read(resourceId);
context.resources.upload(noteId, file);
context.resources.update(resourceId, { file, expectedContentHash });
context.resources.rename(resourceId, filename);
context.resources.delete(resourceId);
```

`resources.update()` 使用 `resources.list()` 返回的 `contentHash` 做乐观并发检查。基线过期时会抛出 `code: "RESOURCE_CONFLICT"` 的 `PluginApiError`。当前替换上限为 100 MiB，并要求资源已同步且设备在线。宿主会把新内容写入新的对象键，再有条件地切换数据库指针，因此被拒绝的更新不会损坏旧对象。

启用后的插件无需能力门禁即可订阅 `note.*`、`tag.changed`、`template.*`、`resource.*` 和同步队列事件。

通过 EdgeEver 正常 Repository 层成功完成的笔记、标签、模板和资源变更——无论来自用户操作还是插件操作——都会进入同一条插件事件流。`workspace.synced` 用于报告已完成的 Repository 同步；失败的变更不会发送成功事件。

## 模板 API

模板是工作区共享数据，而不是插件私有设置。启用后的插件无需能力门禁即可读取、创建、更新、删除和套用模板：

```ts
const template = await context.templates.create({
  name: "每日站会",
  contentMarkdown: "## 已完成\n\n## 下一步\n",
  tags: ["daily"]
});
await context.templates.update(template.id, { description: "团队同步" });
const note = await context.templates.use(template.id, notebookId);
context.events.on("template.updated", ({ template }) => console.log(template.name));
```

`templates.create({ noteId })` 可以从已有笔记生成模板。插件也可以调用 `templates.list()` 和 `templates.delete(templateId)`。

## 宿主统一渲染的设置

插件可以在 Manifest 中声明设置，由 EdgeEver 在插件详情的独立「插件设置」页面统一渲染。已安装插件卡片和插件工具菜单均可直达该页面；未声明配置项的插件不显示设置入口，停用的插件仍可配置。设置仅保存在当前设备。默认行为和凭据应放在设置中，实际操作使用插件命令或功能面板，无需为普通配置另建面板。目前支持 `text`、`secret`、`number`、`boolean` 和 `select`。字段还可以声明只读的 `list`（标题和可选说明）；EdgeEver 会在字段旁显示一个小入口，并用宿主对话框以列表展示这些条目。

插件 API v2 强制要求 `settingsUi: "host"`。设置 Schema 有意保持为声明式结构：字段布局、控件、间距、校验、响应式行为、无障碍、保存状态和密钥呈现均由 EdgeEver 管理；Manifest 中的 HTML、组件、CSS class、内联样式、颜色、字体以及自定义设置页导航等展示属性会被忽略。插件决定“配置什么”，而不是“设置页长什么样”。宿主会拒绝自定义设置页。授权、连通性测试、数据迁移、索引重建等流程应使用命令或命名清晰的功能面板，不要在自定义面板中重复实现普通设置。

```json
{
  "settings": {
    "fields": [
      { "key": "endpoint", "type": "text", "label": "API Endpoint", "required": true },
      { "key": "token", "type": "secret", "label": "API Token", "required": true },
      { "key": "format", "type": "select", "label": "格式", "default": "md", "options": [
        { "value": "md", "label": "Markdown" },
        { "value": "html", "label": "HTML" }
      ] },
      {
        "key": "topics.ai",
        "type": "boolean",
        "label": "主题 · AI 前沿",
        "default": true,
        "list": {
          "title": "AI 前沿信源",
          "actionLabel": "查看信源",
          "items": [
            { "title": "OpenAI News", "description": "openai.com" }
          ]
        }
      }
    ]
  }
}
```

插件通过 `context.settings` 读取校验后的值。Secret 会加密保存在当前设备的 Secret Storage 中，禁止在 Manifest 中声明默认明文，也不会回填到设置表单：

```ts
const endpoint = await context.settings.get("endpoint");
const token = await context.settings.get("token");
await context.settings.set("format", "html");
await context.settings.remove("token");
```

插件可以监听自己设置的变化，并重新读取宿主已经校验过的值。事件只会发送给拥有该设置的插件，且不会携带设置值，避免 secret 或其他配置进入事件载荷：

```ts
context.events.on("settings.changed", async ({ key }) => {
  if (key !== "format") return;
  const format = await context.settings.get("format");
  // 应用更新后的格式。
});
```

## 插件存储与网络

插件存储按照 EdgeEver 工作区和插件 ID 隔离：

```ts
await context.storage.set("cursor", "next-page");
const cursor = await context.storage.get<string>("cursor");
```

直接请求可以访问任意 HTTP 或 HTTPS 地址，并使用任意方法、请求头、正文和浏览器凭据模式。Web 运行时仍遵循浏览器的 CORS 与 Cookie 规则：

```json
{
  "permissions": ["network"]
}
```

```ts
await context.network.fetch("https://api.example.com/items", {
  headers: { Authorization: `Bearer ${token}`, "X-Client": "my-plugin" },
  credentials: "include",
});
```

普通 `storage` 适合游标和偏好设置。API Key 等敏感字符串应使用 `secrets`：

```ts
await context.secrets.set("api-token", token);
const token = await context.secrets.get("api-token");
await context.secrets.remove("api-token");
```

Web 端按照工作区和插件 ID 隔离 Secret，并使用设备本地、不可导出的 WebCrypto 密钥进行 AES-GCM 加密，密文保存在 IndexedDB。它可以避免密钥以明文形式落盘，但由于 P0 插件是同页面受信任代码，不能防御恶意插件读取运行中的数据。

## 编辑器 API

`editor:read` 可以读取当前编辑器选区或完整实时文档，`editor:write` 可以替换选区、在光标处插入 Markdown，或对实时文档应用经过校验的 UTF-16 区间编辑：

```ts
const selection = await context.editor.getSelection();
if (selection && !selection.empty) {
  await context.editor.replaceSelection(selection.text.toUpperCase());
}
await context.editor.insertAtCursor("**Inserted by plugin**");

const document = await context.editor.getDocument();
if (document) {
  await context.editor.editMarkdown([
    { from: 0, to: 0, insert: "<!-- 已通过 linter 检查 -->\n" }
  ]);
}
```

没有打开可编辑笔记时，读取返回 `null`，写入会抛出错误。`editor.editMarkdown()` 使用与 `notes.editMarkdown()` 相同的区间校验，但操作当前内存中的文档，因此可以安全保留用户尚未保存的修改。插件修改会进入正常的编辑器事务和自动保存流程。

### 插件 Embed

启用后的插件可以为自己的受约束块级 Embed 类型注册渲染器，并将其插入编辑器：

```ts
const disposeEmbed = context.editor.embeds.register({
  type: "drawing",
  async mount(container, embed) {
    const scene = await context.resources.read(embed.resourceId);
    // 在 container 中渲染与框架无关的预览。
    return () => container.replaceChildren();
  }
});

await context.editor.insertEmbed({
  type: "drawing",
  resourceId: sceneResource.id,
  previewResourceId: previewResource.id,
  title: "架构图",
  data: { mode: "view" }
});
```

宿主会分配 Embed ID 和插件 ID，因此插件不能冒充其他渲染器。Embed 元数据只能使用兼容 JSON 的值，且上限为 64 KiB。EdgeEver 会在 Markdown 中将通用节点保存为 `edgeever-plugin-embed` 围栏块。插件停用或不可用时，Web 和公开分享页面会显示稳定的降级内容，原生编辑器则通过“不支持内容”兼容路径无损保留原节点。插件不会获得原始 TipTap 编辑器或 Schema。

## 笔记导航

启用后的插件可以从任务、日历、索引或搜索面板打开一篇现有笔记：

```ts
await context.ui.openNote(noteId, { search: "- [ ] 发布版本" });
```

宿主会先确认笔记存在且未被删除，再切换到对应笔记本和编辑器。提供 `search` 后，EdgeEver 会打开笔记内搜索并显示第一个精确匹配。插件不需要也不能操作私有路由或 React 状态。

## 自定义面板

插件可以注册框架无关的 DOM 面板。用户从「插件市场」的已安装插件区域打开面板，关闭、停用或卸载插件时宿主会执行清理函数：

```ts
context.ui.panels.register({
  id: "dashboard",
  title: "Dashboard",
  purpose: "dashboard",
  presentation: "fullscreen",
  mount(container, { state, requestClose }) {
    const heading = document.createElement("h2");
    heading.textContent = "Plugin dashboard";
    container.append(heading);
    return () => heading.remove();
  },
  beforeClose() {
    return hasUnsavedDrawing
      ? { title: "绘图尚未保存", message: "仍要关闭吗？", confirmLabel: "关闭绘图" }
      : true;
  }
});

await context.ui.panels.open("dashboard", { state: { resourceId } });
```

每个 API v2 面板必须声明一种业务用途：`workflow`、`dashboard`、`preview` 或 `onboarding`。面板不能作为另一套设置入口。持久化的布尔值、文本、数字、密钥和固定选项必须放进 Manifest 设置 Schema。只有在执行某项操作时才有意义的工作区动态选项，可在宿主设置 Schema 尚不支持时保留为工作流控件。

`presentation` 可以使用 `dialog`（默认）或 `fullscreen`。`panels.open()` 只能打开调用插件自己注册的面板；可选 JSON 状态上限为 64 KiB，并通过挂载上下文传入。`beforeClose()` 可以返回 `true` 关闭、返回 `false` 保持打开，或返回由宿主显示确认框所需的文案。挂载上下文中的 `requestClose()` 同样会经过这项保护。

### 面板系统控件

用 `mount` 上下文里的 `shell.set()` 描述标题、说明、页头按钮、搜索、分段选项、下拉框和空状态。EdgeEver 用与应用其余部分相同的组件来渲染这些控件。`container` 仍是插件内容区——列表、画布和表单继续由插件自己的 DOM 负责。

```js
mount(container, { shell, requestClose }) {
  const list = document.createElement("div");
  container.append(list);
  const render = (query) => {
    const tasks = queryTasks(query);
    shell.set({
      header: {
        title: "待办任务",
        description: `${tasks.length} 项未完成`,
        actions: [{ id: "refresh", label: "刷新" }],
      },
      toolbar: [
        { type: "tabs", key: "view", value: query.view, options: [
          { value: "open", label: "未完成" },
          { value: "done", label: "已完成" },
        ] },
        { type: "search", key: "q", placeholder: "搜索任务", value: query.q },
        { type: "select", key: "priority", label: "优先级", value: query.priority, options: [
          { value: "all", label: "全部" },
          { value: "high", label: "高" },
        ] },
      ],
      empty: tasks.length ? null : { title: "没有符合条件的任务" },
      onAction(id) { if (id === "refresh") render(query); },
      onChange(key, value) { render({ ...query, [key]: value }); },
    });
    list.replaceChildren(...tasks.map(renderRow));
  };
  render({ view: "open", q: "", priority: "all" });
}
```

将 `header.description` 设为 `null` 会隐藏默认的「由受信任插件提供」说明（辅助技术仍可读取）。从不调用 `shell.set()` 的插件保持原来的内嵌卡片布局。控件回调只存在于内存中，不会写入面板 `state`。

## 桌面端插件入口

启用插件后，桌面端左侧工作区快捷栏会显示统一的拼图入口。菜单按插件分组展示命令和面板，并在顶部保留最近使用的操作；“管理插件与主题”会直接打开独立插件市场页面。插件不会各自在工具栏占用一个图标。

## 主题 Manifest

主题是一种不包含代码的扩展包：

```json
{
  "type": "theme",
  "id": "com.example.theme",
  "name": "Example Theme",
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

`@edgeever/plugin-api` 会通过 `THEME_TOKEN_NAMES` 导出所有支持的 Token。未知 Token 会被拒绝，避免主题依赖私有 DOM 选择器。
颜色 Token 只接受 `#RRGGBB` 或 `#RRGGBBAA`，字体与尺寸 Token 同样使用受限格式。主题值不能包含选择器、远程资源或 CSS 函数。

## 仓库内示例

本地开发 EdgeEver 时，可以在独立的「插件市场」页面中安装：

- `/extensions/recent-notes/manifest.json`
- `/extensions/nord-emerald/manifest.json`

第一个示例演示笔记查询、选区替换、命令和自定义面板，第二个示例演示无代码主题 Token API。

## 当前限制

- 插件只安装在当前设备，不参与同步。
- 插件只在应用打开期间运行。
- 桌面插件可以持久化定时执行自己的已注册命令，用户则可以在插件页面管理这些计划并分页查看执行记录。计划通过工作区同步、绑定一台桌面设备，并且只在该设备运行 EdgeEver 时执行；错过的计划可以选择跳过，或在恢复后合并补跑一次。这不是服务端常驻后台运行时。
- 暂无 Webhook 接收端、服务端后台运行环境、市场投稿后台和自动审核流水线。
- 能力声明只是可选的描述性元数据，不是 API 授权或安全沙箱。
- 自定义面板可以从桌面端统一插件菜单或插件管理页打开，尚未支持固定到主导航或编辑器侧栏。
- Secret Storage 仅保存在当前设备，不会同步到其他设备。

## 通用 AI 与公开网络能力（尚未发布）

启用后的插件可以调用当前工作区的默认 AI 模型，`ai:generate` 仅是可选的披露元数据。接口只接受普通提示词；来源解析、业务流程和提示词属于插件，凭据保留在宿主。

```ts
const status = await context.ai.status(); // { configured, modelName? }
const result = await context.ai.generate({
  system: "把给定文本翻译成英文。",
  prompt: "用户提供的文本",
  maxOutputTokens: 1000,
  signal: controller.signal,
});
```

`system` 最多 8,000 字符，`prompt` 最多 90,000 字符，输出最多 5,000 token，生成最长 120 秒。后端要求交互式用户会话，公开演示模式禁用 AI，供应商错误脱敏。每个后端实例对每工作区的 AI 调用设置四路并发保护，不是分布式配额。模型费用沿用已配置供应商的计费；停用插件会中止其调用。

默认的 `network.fetch(url, init)` 是受信任的浏览器请求，可以访问任意 HTTP／HTTPS 地址，使用任意方法、正文、`Authorization` 等请求头以及调用方指定的浏览器凭据模式；它仍受所在运行时的 CORS 与 Cookie 策略约束。`networkHosts` 仅为兼容旧版保留，不是安全边界。需要无凭据读取跨域公开订阅或 API 时，显式选择 `transport: "public"` 即可；列出 `network` 和 `network:public` 仍有助于披露用途，但不是必需条件：

```json
{
  "permissions": ["network", "network:public"]
}
```

```ts
const response = await context.network.fetch("https://example.org/feed.xml", {
  transport: "public",
  headers: { Accept: "application/rss+xml" },
  redirect: "manual",
  signal: controller.signal,
});
const feed = await response.text(); // 插件自己解析。
```

公开模式允许访问任意公开域名，但仅支持 443 端口的 HTTPS GET／HEAD，不携带请求体和凭据；超时 20 秒，解码后的响应正文最多 2,000,000 字节。重定向只返回、不跟随（`redirect: "error"` 会拒绝），插件可以检查目标后再单独请求。来源的 403／429 保留为来源状态，不绕过平台访问限制。允许的请求头为 Accept、Accept-Language、If-None-Match、If-Modified-Since、Range；仅返回内容／缓存元数据、Location 和 Retry-After，不返回 Set-Cookie。响应在上限内缓冲，不是无限流式代理。

宿主在不改变插件 API 的前提下选择成本最低的安全传输。Web 先尝试浏览器请求：CORS 可读的响应完全留在客户端；只有浏览器以网络／CORS `TypeError` 拒绝时，才回退到已认证的后端中继。桌面端通过 Electron 主进程和用户本机网络请求，最多四路并发，不再把公开内容转发到 EdgeEver 后端。取消信号会传递到所有传输路径。

桌面端、自托管与云端驱动共用同一策略包。桌面端和 Bun 自托管会校验全部 DNS 结果，并把已校验地址直接交给 TLS；私网、特殊用途和混合公私地址全部拒绝。Cloudflare 回退使用 workerd 默认的仅公开 Internet 出口，不使用私网服务绑定。VPN／fake-IP DNS 返回的保留地址也会拒绝，不应禁用检查；非标准 workerd 部署须保留仅公开网络出口。Web 回退返回有大小限制的二进制正文，不再使用 Base64 JSON，避免 Base64 的额外传输体积。

插件能力声明用于说明意图；启用后的插件属于受信任 JavaScript，不是安全沙箱。插件可以读取笔记并通过网络发送。公开传输有意允许匿名读取任意公开 HTTPS 域名。后端仍独立要求用户认证并限制仅公开网络，避免共享的 EdgeEver 服务被用来访问私网；它不声称提供服务端证明的插件隔离。后端不接收来源枚举、搜索时间范围、证据结构或报告流程。
