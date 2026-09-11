# EdgeEver Plugin Development (P0 Preview)

EdgeEver's P0 extension API supports trusted client plugins and no-code theme packages. Users can install extensions from the verified marketplace, a public GitHub repository, or a manifest URL. Extensions are installed per device and run only while EdgeEver is open. On desktop, users can schedule a registered plugin command while EdgeEver is running. Webhooks, an always-on server background runtime, unrestricted TipTap extensions, and a hard JavaScript sandbox are not part of this preview.

## Security model

Theme packages contain only a validated manifest and documented design tokens. They do not execute JavaScript.

Client plugins use an Obsidian-style trusted-code model. Enabling a plugin trusts it with the full EdgeEver plugin context; declared capabilities are optional descriptive metadata and do not gate API calls. The plugin module runs in the client JavaScript environment, so users must install plugins only from developers they trust.

The first time a user enables a community client plugin on a device, EdgeEver presents a community-plugin trust confirmation. Once acknowledged, it is not shown for every plugin. Official plugins (publisher EdgeEver) do not trigger the confirmation. Theme packages also do not trigger it because they cannot execute JavaScript.

Plugins never receive EdgeEver's repository, IndexedDB database, Cloudflare bindings, or internal React state through the public API.

## Plugin manifest

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

The manifest and JavaScript module must be served with CORS headers that permit the EdgeEver origin. Relative `entry` paths resolve against the manifest URL.

## GitHub distribution

Developers can share a public GitHub repository URL directly with users. The default branch must contain the latest `manifest.json` at its root, and every version is published as a GitHub Release. The Release tag may be the manifest version or its `v`-prefixed form, such as `1.2.0` or `v1.2.0`.

Attach these files to the Release:

```text
manifest.json
main.js
styles.css (optional)
```

GitHub plugins must use `./main.js` as `entry`, and `main.js` must be a single-file bundle without relative module imports. EdgeEver reads the default-branch manifest, locates the matching Release, downloads assets in parallel, verifies GitHub's SHA-256 digest when present, and caches the verified package in device-local IndexedDB. Marketplace GitHub metadata and Release assets are fetched through the current EdgeEver instance, so the desktop or browser client does not need direct access to `api.github.com`. `main.js` is limited to 5 MB and `styles.css` to 1 MB.

EdgeEver checks for updates when the Plugin Marketplace opens, when the window regains focus, and every 30 minutes. Marketplace installs whose Registry entry declares `"publisher": "edgeever"` are official EdgeEver extensions. The bundled Registry version is the verified baseline; EdgeEver then resolves the live GitHub default-branch Release through the instance and auto-updates to that newer checksum-pinned version. Community Marketplace extensions and extensions installed directly from GitHub or a Manifest URL are never updated silently: the user must click Update and confirm. If a manually confirmed version changes declared capabilities or legacy network-host metadata, the confirmation lists those changes for review. For GitHub distribution, the Release `manifest.json` must exactly match the default-branch manifest used for the update prompt or installation is rejected.

Updates use a rollback-capable switch. Old and new package versions are cached separately. If the new version cannot activate, EdgeEver restores the previous manifest, enabled state, and package instead of leaving the plugin broken or disabled.

Users can freely install without marketplace admission by pasting this into the standalone Plugin Marketplace page:

```text
https://github.com/owner/edgeever-plugin
```

Only public GitHub repositories are supported for now; private-repository tokens are not exposed.

## Verified plugin marketplace

The official marketplace only lists free and open-source plugins. Complete human-readable source, an accepted open-source license, build information, and a traceable public source revision are required for every listed version. This requirement applies only to official marketplace admission; users remain free to install other plugins from GitHub or a Manifest URL. See the [Plugin Marketplace Submission Policy](plugin-marketplace-policy.md) for the complete requirements.

The marketplace is a verified Registry and does not take ownership of plugin files. For each version, the Registry pins the plugin ID, GitHub repository, version, and SHA-256 hashes for `manifest.json`, `main.js`, and optional `styles.css`. Installation still downloads from the developer's GitHub Release or registered public URL and verifies those hashes again. The optional `"publisher": "edgeever"` marker is reserved for Registry entries maintained by the EdgeEver project; it enables automatic updates and must not be used for community submissions.

Registry format:

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
        "manifestJson": "<64-character SHA-256>",
        "mainJs": "<64-character SHA-256>"
      }
    }
  }]
}
```

Marketplace installs display a Verified badge. GitHub and manifest sideloads clearly display their unverified source, but EdgeEver does not block them. Uninstalling also deletes all device-local cached package versions, ordinary plugin storage for the current workspace, and Secret Storage.

Optional capability declarations, retained for disclosure and compatibility:

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

Network access through `context.network.fetch()` is not restricted by capability declarations or a static host list. `networkHosts` remains accepted as legacy descriptive metadata and is not enforced. The anonymous, read-only `network:public` transport is available when a plugin needs a cross-origin public response without credentials.

## Plugin entry

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

For TypeScript projects, import contracts and helpers from `@edgeever/plugin-api`:

```ts
import { definePlugin } from "@edgeever/plugin-api";

export default definePlugin({
  activate(context) {
    // Register commands and event listeners here.
  }
});
```

Every registration returns a disposer. The host also disposes registered commands and events automatically when a plugin is disabled.

Commands appear on the plugin marketplace card by default. Set `listed: false` for editor-context or secondary commands that belong in the plugin toolbar menu instead of the install card:

```js
context.commands.register({
  id: "insert-task",
  title: "Insert task at cursor",
  listed: false,
  async run() {
    await context.editor.insertAtCursor("- [ ] ");
  }
});
```

Workflow and preview panels are also omitted from that card. Open them from a command, the toolbar menu, or another panel.

The plugin toolbar menu lists editor commands and dashboard or onboarding panels. It omits workflow or preview dialogs, and omits a command that only opens a dashboard already in the menu. Set `menu: false` when a command should appear on the marketplace card but not next to its dashboard panel:

```js
context.commands.register({
  id: "open-dashboard",
  title: "Open task dashboard",
  menu: false,
  run: () => context.ui.panels.open("tasks"),
});
```

## Schedules API

Desktop plugins can persistently schedule one of their own registered commands. Register the command first, then use a stable plugin-local key with `upsert()`:

```js
export default {
  async activate(context) {
    context.commands.register({
      id: "refresh-feeds",
      title: "Refresh feeds",
      async run() {
        // Long-running plugin work is allowed while the desktop app remains open.
      }
    });

    await context.schedules.upsert({
      key: "hourly-refresh",
      name: "Hourly feed refresh",
      commandId: "refresh-feeds",
      cronExpression: "0 * * * *",
      missedRunPolicy: "run-once"
    });
  }
};
```

`upsert()` is idempotent for the pair of plugin ID and schedule key, so calling it on every activation does not create duplicates. The first desktop device that creates the schedule remains its executor; activation on another device updates the same definition without stealing execution. Omitting `isEnabled` preserves the user's enabled/disabled choice. Plugins can inspect and remove their own schedules with `context.schedules.list()` and `context.schedules.remove(key)`.

The execution center retains scheduled-task run history for the most recent 30 days only. Expired records are removed immediately during upgrade and continue to be physically pruned when runs execute or history is viewed.

### SDK package

`@edgeever/plugin-api` is a publish-ready ESM package with generated JavaScript and TypeScript declarations. In the EdgeEver repository, rebuild it after changing public contracts:

```sh
bun run build:plugin-api
```

Maintainers can inspect the exact public package without publishing it:

```sh
cd packages/plugin-api
npm pack --dry-run
```

The package build contains only `dist/index.js`, `dist/index.d.ts`, its README, and package metadata. Plugin projects should bundle SDK runtime helpers into their single-file `main.js`; they must not leave a runtime import of `@edgeever/plugin-api` in the distributed bundle.

## Notes API

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

`notes.query()` returns lightweight summaries. Use `notes.queryContent()` when a plugin must scan Markdown across many notes, such as a Tasks index, Calendar, Kanban board, or Linter. Both APIs accept at most 200 notes per page; follow `nextOffset` until it is `null`. Prefer the summary query whenever full content is unnecessary.

All writes go through EdgeEver's shared repository/business layer, including offline queueing and desktop adapters. Plugins do not access a storage implementation directly.
`notes.update()` reads the current revision and returns the complete updated note.
`notes.editMarkdown()` performs optimistic concurrency checks with the `revision` and `contentHash` returned by `notes.get()`. It is intended for plugins such as task togglers, linters, and index maintainers that change only specific Markdown ranges:

```ts
const note = await context.notes.get(noteId);
await context.notes.editMarkdown(noteId, {
  expectedRevision: note.revision,
  expectedContentHash: note.contentHash,
  edits: [
    { from: 2, to: 3, insert: "x" },
    { from: note.contentMarkdown.length, to: note.contentMarkdown.length, insert: "\nAppended text" }
  ]
});
```

Edit ranges use JavaScript UTF-16 string offsets and half-open ranges `[from, to)`. Ranges in one call must not overlap, exceed the note, or split a Unicode surrogate pair. The host rejects writes with an error carrying `code: "NOTE_CONFLICT"` when the note baseline changed or the active editor has unsaved changes; plugins should reload and ask the user to retry. Invalid ranges use `code: "INVALID_MARKDOWN_EDIT"`. The SDK exports `PluginApiError` and `PluginApiErrorCode` for TypeScript error narrowing.
Enabled plugins can read and change notebooks and tags without capability gates.

Attachments flow through the same Web/Desktop repository adapters:

```ts
context.resources.list(noteId);
const blob = await context.resources.read(resourceId);
context.resources.upload(noteId, file);
context.resources.update(resourceId, { file, expectedContentHash });
context.resources.rename(resourceId, filename);
context.resources.delete(resourceId);
```

`resources.update()` uses the `contentHash` returned by `resources.list()` as an optimistic-concurrency baseline. A stale baseline throws `PluginApiError` with `code: "RESOURCE_CONFLICT"`. Replacements are currently limited to 100 MiB and require the resource to be synchronized and online. The host stores new bytes under a new object key and switches the database pointer conditionally, so a rejected update does not damage the previous object.

Enabled plugins may subscribe to `note.*`, `tag.changed`, `template.*`, `resource.*`, and sync-queue events without capability gates.

Successful note, tag, template, and resource changes made through EdgeEver's normal repository layer—including user actions and plugin actions—feed the same plugin event stream. `workspace.synced` reports completed repository sync passes. Failed mutations do not emit success events.

## Templates API

Templates are shared workspace data rather than plugin-local settings. Enabled plugins can read, create, update, delete, and apply them without capability gates:

```ts
const template = await context.templates.create({
  name: "Daily stand-up",
  contentMarkdown: "## Done\n\n## Next\n",
  tags: ["daily"]
});
await context.templates.update(template.id, { description: "Team check-in" });
const note = await context.templates.use(template.id, notebookId);
context.events.on("template.updated", ({ template }) => console.log(template.name));
```

`templates.create({ noteId })` can capture an existing note. Plugins can also call `templates.list()` and `templates.delete(templateId)`.

## Host-rendered settings

Plugins can declare settings that EdgeEver renders consistently on a dedicated Plugin settings page within plugin details. Installed plugin cards and the plugin toolbar menu link directly to this page. Plugins without settings fields have no settings entry, while disabled plugins remain configurable. Settings are stored on the current device only. Put defaults and credentials in settings, and use plugin commands or functional panels for actual operations; ordinary configuration does not need a separate custom panel. Supported field types are `text`, `secret`, `number`, `boolean`, and `select`. A field may also declare a read-only `list` of titles and optional descriptions; EdgeEver shows a small entry next to the field and opens the items in a host-rendered dialog.

Plugin API v2 requires `settingsUi: "host"`. The settings Schema is deliberately declarative: EdgeEver owns field layout, controls, spacing, validation, responsive behavior, accessibility, save states, and secret presentation. Presentation properties such as HTML, components, CSS classes, inline styles, colors, typography, or custom setting-page navigation are ignored. A plugin decides what can be configured, not how the settings page looks. Custom settings pages are rejected by the host. Use commands or a clearly named functional panel for workflows such as authorization, connectivity tests, migrations, and index rebuilding; do not recreate ordinary settings in a custom panel.

```json
{
  "settings": {
    "fields": [
      { "key": "endpoint", "type": "text", "label": "API endpoint", "required": true },
      { "key": "token", "type": "secret", "label": "API token", "required": true },
      { "key": "format", "type": "select", "label": "Format", "default": "md", "options": [
        { "value": "md", "label": "Markdown" },
        { "value": "html", "label": "HTML" }
      ] },
      {
        "key": "topics.ai",
        "type": "boolean",
        "label": "AI",
        "default": true,
        "list": {
          "title": "AI sources",
          "actionLabel": "View sources",
          "items": [
            { "title": "OpenAI News", "description": "openai.com" }
          ]
        }
      }
    ]
  }
}
```

Plugins read the validated values through `context.settings`. Secret values are encrypted in the device-local Secret Storage, are never embedded as Manifest defaults, and are not filled back into the settings form:

```ts
const endpoint = await context.settings.get("endpoint");
const token = await context.settings.get("token");
await context.settings.set("format", "html");
await context.settings.remove("token");
```

Plugins can listen for changes to their own settings and then read the host-validated value again. The event is delivered only to the plugin that owns the setting and does not include the value, keeping secrets and other configuration out of event payloads:

```ts
context.events.on("settings.changed", async ({ key }) => {
  if (key !== "format") return;
  const format = await context.settings.get("format");
  // Apply the updated format.
});
```

## Storage and network

Plugin storage is namespaced by EdgeEver workspace and plugin ID:

```ts
await context.storage.set("cursor", "next-page");
const cursor = await context.storage.get<string>("cursor");
```

Direct requests may use HTTP or HTTPS with arbitrary destinations, methods, headers, bodies, and browser credential modes. The Web runtime still follows the browser's CORS and cookie rules:

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

Use regular `storage` for cursors and preferences. Sensitive strings such as API keys belong in `secrets`:

```ts
await context.secrets.set("api-token", token);
const token = await context.secrets.get("api-token");
await context.secrets.remove("api-token");
```

The web host namespaces secrets by workspace and plugin ID, encrypts them with AES-GCM using a device-local, non-exportable WebCrypto key, and stores ciphertext in IndexedDB. This prevents plaintext storage, but P0 plugins are trusted same-page code and the mechanism cannot defend against a malicious plugin reading live data.

## Editor API

`editor:read` reads the active editor selection or full live document. `editor:write` replaces the selection, inserts Markdown at the cursor, or applies validated UTF-16 range edits to the live document:

```ts
const selection = await context.editor.getSelection();
if (selection && !selection.empty) {
  await context.editor.replaceSelection(selection.text.toUpperCase());
}
await context.editor.insertAtCursor("**Inserted by plugin**");

const document = await context.editor.getDocument();
if (document) {
  await context.editor.editMarkdown([
    { from: 0, to: 0, insert: "<!-- checked by linter -->\n" }
  ]);
}
```

Reading returns `null` when no editable note is open; writes throw an error. `editor.editMarkdown()` uses the same range validation as `notes.editMarkdown()`, but operates on the current in-memory document so it can safely include unsaved user changes. Plugin edits use normal editor transactions and the autosave flow.

### Plugin embeds

An enabled plugin can register a renderer for its own constrained, block-level embed type and insert it into the editor:

```ts
const disposeEmbed = context.editor.embeds.register({
  type: "drawing",
  async mount(container, embed) {
    const scene = await context.resources.read(embed.resourceId);
    // Render a framework-independent preview into container.
    return () => container.replaceChildren();
  }
});

await context.editor.insertEmbed({
  type: "drawing",
  resourceId: sceneResource.id,
  previewResourceId: previewResource.id,
  title: "Architecture",
  data: { mode: "view" }
});
```

The host assigns the embed ID and plugin ID, so a plugin cannot impersonate another renderer. Embed metadata is limited to JSON-compatible values and 64 KiB. EdgeEver persists the generic node as an `edgeever-plugin-embed` fenced block in Markdown. When the plugin is disabled or unavailable, Web and public-share views show a stable fallback, while native editors preserve the original node through their unsupported-content compatibility path. Plugins do not receive the raw TipTap editor or schema.

## Note navigation

An enabled plugin can open an existing note from a task, calendar, index, or search panel:

```ts
await context.ui.openNote(noteId, { search: "- [ ] Ship release" });
```

The host verifies that the note exists and is not deleted, then switches to its notebook and editor. When `search` is supplied, EdgeEver opens in-note search and reveals its first exact match. Plugins do not need and cannot access private routes or React state.

## Custom panels

Plugins can register framework-independent DOM panels. Users open them from the Plugin Marketplace's installed-plugin section; the host runs the disposer when the panel closes or the plugin is disabled or uninstalled:

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
      ? { title: "Unsaved drawing", message: "Close without saving?", confirmLabel: "Close drawing" }
      : true;
  }
});

await context.ui.panels.open("dashboard", { state: { resourceId } });
```

Every API v2 panel must declare one business purpose: `workflow`, `dashboard`, `preview`, or `onboarding`. A panel is not an alternative settings surface. Persistent booleans, text, numbers, secrets, and fixed-option selections belong in the Manifest settings Schema. Workspace-backed choices that are meaningful only while performing an operation may remain workflow controls until the host settings Schema supports them.

`presentation` accepts `dialog` (the default) or `fullscreen`. `panels.open()` can only open a panel registered by the calling plugin; its optional JSON state is limited to 64 KiB and is delivered through the mount context. `beforeClose()` may return `true` to close, `false` to stay open, or confirmation copy for a host-rendered dialog. The mount context's `requestClose()` follows the same guard.

### Panel chrome

Use `mount` context `shell.set()` for system chrome: title, description, header actions, search, tabs, selects, and empty states. EdgeEver renders those controls with the same components as the rest of the app. The `container` argument remains the plugin body — lists, canvases, and forms stay in plugin DOM.

```js
mount(container, { shell, requestClose }) {
  const list = document.createElement("div");
  container.append(list);
  const render = (query) => {
    const tasks = queryTasks(query);
    shell.set({
      header: {
        title: "Tasks",
        description: `${tasks.length} open`,
        actions: [{ id: "refresh", label: "Refresh" }],
      },
      toolbar: [
        { type: "tabs", key: "view", value: query.view, options: [
          { value: "open", label: "Open" },
          { value: "done", label: "Done" },
        ] },
        { type: "search", key: "q", placeholder: "Search tasks", value: query.q },
        { type: "select", key: "priority", label: "Priority", value: query.priority, options: [
          { value: "all", label: "All" },
          { value: "high", label: "High" },
        ] },
      ],
      empty: tasks.length ? null : { title: "No matching tasks" },
      onAction(id) { if (id === "refresh") render(query); },
      onChange(key, value) { render({ ...query, [key]: value }); },
    });
    list.replaceChildren(...tasks.map(renderRow));
  };
  render({ view: "open", q: "", priority: "all" });
}
```

Passing `header.description: null` hides the default “provided by a trusted plugin” line from the visible header (it remains available to assistive technology). Plugins that never call `shell.set()` keep the previous nested card layout. Chrome callbacks are in-memory only and are not stored in panel `state`.

## Desktop plugin entry

After a plugin is enabled, a unified puzzle button appears in the desktop workspace shortcuts on the left. Its menu groups commands and panels by plugin, keeps recently used actions at the top, and links directly to extension management. Individual plugins do not each consume a toolbar icon.

## Theme manifest

Themes are code-free extension packages:

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

Supported token names are exported as `THEME_TOKEN_NAMES` by `@edgeever/plugin-api`. Unknown tokens are rejected so themes do not depend on private DOM selectors.
Color tokens accept only `#RRGGBB` or `#RRGGBBAA`; font and size tokens also use restricted formats. Theme values cannot contain selectors, remote assets, or CSS functions.

## Bundled examples

When developing EdgeEver locally, install these URLs from the standalone **Plugin Marketplace** page:

- `/extensions/recent-notes/manifest.json`
- `/extensions/nord-emerald/manifest.json`

The first demonstrates note queries, selection replacement, commands, and a custom panel. The second demonstrates the code-free theme token API.

## Current limits

- Plugins are installed on one device and are not synchronized.
- Plugins run only while the app is open.
- Desktop plugins can persistently schedule their own registered commands, and users can manage those schedules and inspect paginated run history from the plugin page. A schedule is synced through the workspace, bound to one desktop device, and runs only while EdgeEver is open on that device. A missed occurrence can either be skipped or coalesced into one recovery run. This is not an always-on server background runtime.
- There is no webhook receiver, server background runtime, marketplace submission backend, or automated review pipeline.
- Capability declarations are optional descriptive metadata, not API authorization or a sandbox.
- Custom panels open from the unified desktop plugin menu or extension settings and cannot yet be pinned to the main navigation or editor sidebar.
- Secret storage is device-local and does not sync to other devices.

## Generic AI and public network capabilities (unreleased)

Enabled plugins may use the current workspace's default AI model. Declaring `ai:generate` is optional disclosure metadata. These calls take ordinary prompts; source parsing, business workflows and prompts belong to the plugin. Credentials stay in the host.

```ts
const status = await context.ai.status(); // { configured, modelName? }
const result = await context.ai.generate({
  system: "Translate the supplied text into English.",
  prompt: "用户提供的文本",
  maxOutputTokens: 1000,
  signal: controller.signal,
});
```

`system` is limited to 8,000 characters, `prompt` to 90,000, output to 5,000 tokens, and generation to 120 seconds. The backend requires an interactive user session, disables AI in public demo mode, and redacts provider errors. AI calls have a four-request per-workspace guard in each backend instance; this is not a distributed quota. Model charges follow the configured provider. Plugin deactivation aborts outstanding calls.

The default `network.fetch(url, init)` transport is a trusted browser request. It accepts arbitrary HTTP/HTTPS destinations, methods, bodies, request headers such as `Authorization`, and the requested browser credential mode. It remains subject to the runtime browser's CORS and cookie policy. `networkHosts` is legacy descriptive metadata and is not a security boundary. To read a cross-origin public feed or API without credentials, explicitly select `transport: "public"`; listing `network` and `network:public` remains useful disclosure but is optional.

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
const feed = await response.text(); // Parse inside the plugin.
```

Public mode supports any public HTTPS host on port 443 with GET/HEAD, no request body or credentials, a 20-second deadline, and at most 2,000,000 decoded response bytes. It always returns redirects without following them (`redirect: "error"` rejects them), so plugins can inspect a destination before requesting it separately. Upstream 403/429 remain upstream status codes; this transport does not bypass platform restrictions. Allowed request headers: Accept, Accept-Language, If-None-Match, If-Modified-Since, Range. Only content/cache metadata, Location and Retry-After are returned; Set-Cookie is excluded. The response is buffered within the size limit, not an unlimited streaming proxy.

The host selects the least expensive safe transport without changing the plugin API. Web first tries browser fetch; a readable CORS response stays entirely client-side, while a browser network/CORS `TypeError` falls back to the authenticated backend relay. Desktop uses its Electron main process and the user's own network, capped at four concurrent requests. It does not relay public content through the EdgeEver backend. Cancellation propagates to every transport.

All native/server drivers share one policy package. Desktop and self-hosted Bun validate every DNS answer and pass the validated address directly to TLS; private, special-use and mixed public/private answers are rejected. Cloudflare fallback uses workerd's default public-only Internet egress and no private-service bindings. Synthetic VPN/fake-IP DNS answers in reserved ranges are rejected; do not disable this check. Nonstandard workerd deployments must preserve public-only global egress. The Web fallback returns bounded binary bytes rather than Base64 JSON, avoiding Base64's transfer expansion.

Plugin capability declarations communicate intent; enabled plugins are trusted JavaScript, not a security sandbox. A plugin can read notes and transmit them over the network. The public transport intentionally grants anonymous read access to arbitrary public HTTPS hosts. Backend routes independently require user authentication and enforce public-only egress so the shared EdgeEver service cannot be used to reach private networks; they do not claim server-attested per-plugin isolation. The backend never receives a source enum, search window, evidence schema or report workflow.
