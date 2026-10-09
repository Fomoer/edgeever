# EdgeEver Plugin Development Guide

[简体中文](plugin-development.zh-CN.md)

EdgeEver provides client plugin and no-code theme extension capabilities. Users can install extensions from the official marketplace, public GitHub repositories, or manifest URLs. Installed extensions sync across Web and desktop platforms with the current workspace and run while EdgeEver is open; Android and iOS native apps do not run plugins.

> [!NOTE]
> **Security Model**: Client plugins use a trusted-code model (similar to Obsidian). Enabling a plugin grants it trust to run within the client JavaScript environment and invoke plugin APIs. Capability declarations (`permissions`) in the manifest disclose the functional scope to users and do not enforce a hard sandbox. Theme packages are purely declarative JSON and execute no JavaScript.

---

## Table of Contents

- [Plugin Manifest](#plugin-manifest)
  - [Fields](#fields)
  - [Available Permissions](#available-permissions)
- [Plugin Entry & Lifecycle](#plugin-entry--lifecycle)
- [API Reference](#api-reference)
  - [API Namespace Quick Reference](#api-namespace-quick-reference)
  - [1. Notes & Notebooks](#1-notes--notebooks)
  - [2. Templates](#2-templates)
  - [3. Resources & Attachments](#3-resources--attachments)
  - [4. Editor & Embeds](#4-editor--embeds)
  - [5. UI, Commands & Panels](#5-ui-commands--panels)
  - [6. Settings](#6-settings)
  - [7. Storage & Secrets](#7-storage--secrets)
  - [8. Network Requests](#8-network-requests)
  - [9. Schedules (Desktop Only)](#9-schedules-desktop-only)
  - [10. Events](#10-events)
  - [11. AI Capabilities](#11-ai-capabilities)
- [Themes (No-Code Extensions)](#themes-no-code-extensions)
- [Packaging, Distribution & Local Testing](#packaging-distribution--local-testing)
  - [Packaging Rules](#packaging-rules)
  - [GitHub Distribution](#github-distribution)
  - [Local Testing](#local-testing)

---

## Plugin Manifest

Every plugin must supply a `manifest.json` at its root:

```json
{
  "type": "plugin",
  "id": "com.example.recent-notes",
  "name": "Recent Notes",
  "version": "1.0.0",
  "apiVersion": "2",
  "settingsUi": "host",
  "description": "Shows recently updated notes.",
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

### Fields

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `type` | `"plugin"` | Yes | Fixed value: `"plugin"`. |
| `id` | `string` | Yes | Globally unique plugin ID. Reverse-domain format recommended (e.g. `com.example.plugin`). |
| `name` | `string` | Yes | Default display name. |
| `version` | `string` | Yes | SemVer-compliant version string (e.g. `1.0.0`). |
| `apiVersion` | `"2"` | Yes | Plugin API version; currently `"2"`. |
| `settingsUi` | `"host"` | Yes | Settings UI renderer; currently `"host"` (rendered by host). |
| `entry` | `string` | Yes | Entry script path; fixed to `./main.js` for GitHub distribution. |
| `description` | `string` | No | Default description. |
| `locales` | `object` | No | Localized metadata keyed by BCP 47 language tags (e.g. `zh-CN`, `en-US`), overriding `name` and `description`. |
| `platforms` | `string[]` | No | Supported platforms: `"web"`, `"desktop"`. |
| `permissions` | `string[]` | No | Declared capabilities disclosed to users during install and update. |
| `settings` | `object` | No | Declarative settings schema rendered by host (detailed below). |

### Available Permissions

Permissions are declared to transparently inform users of plugin capabilities:
- **Notes & Content**: `notes:read`, `notes:write`, `notes:delete`, `templates:read`, `templates:write`, `metadata:read`, `metadata:write`, `resources:read`, `resources:write`
- **Editor**: `editor:read`, `editor:write`
- **UI & Interaction**: `ui:commands`, `ui:navigation`, `ui:notices`, `ui:panels`, `ui:embeds`
- **Storage & System**: `storage`, `secrets`, `network`, `network:public`, `schedules`
- **AI Capabilities**: `ai:generate`

---

## Plugin Entry & Lifecycle

The plugin entry script (`main.js`) exports a default object containing an `activate` lifecycle function:

```js
export default {
  activate(context) {
    // Register commands
    const disposeCommand = context.commands.register({
      id: "hello-world",
      title: "Say Hello",
      run() {
        context.ui.showNotice("Hello from EdgeEver Plugin!");
      }
    });

    // Return cleanup callback (invoked on deactivation)
    return () => {
      disposeCommand();
    };
  }
};
```

TypeScript projects can use `@edgeever/plugin-api`:

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
> Registration methods (commands, panels, events) return cleanup functions. When a plugin is deactivated, the host also automatically cleans up registered commands and event listeners.

---

## API Reference

### API Namespace Quick Reference

The plugin context object (`context`) exposes these capability interfaces:

| Namespace | Permission (Disclosure) | Core Methods | Description |
| :--- | :--- | :--- | :--- |
| **`context.notes`** | `notes:read`<br>`notes:write`<br>`notes:delete` | `query()`, `queryContent()`, `get()`, `create()`, `update()`, `editMarkdown()`, `delete()`, `move()`, `pin()`, `restore()`, `revisions` | Query notes, retrieve bodies, optimistic concurrent edits, and revision history |
| **`context.notebooks`** | `metadata:read`<br>`metadata:write` | `list()`, `create()`, `update()`, `delete()` | Manage notebook trees, hierarchy, and CRUD operations |
| **`context.tags`** | `metadata:read`<br>`metadata:write` | `list()`, `rename()`, `delete()` | Global tag listing, renaming, and removal |
| **`context.templates`** | `templates:read`<br>`templates:write` | `list()`, `create()`, `update()`, `delete()`, `use()` | Template management and one-click note creation |
| **`context.resources`** | `resources:read`<br>`resources:write` | `list()`, `read()`, `upload()`, `update()`, `rename()`, `delete()` | Upload, read, update, and manage note media/file attachments |
| **`context.editor`** | `editor:read`<br>`editor:write`<br>`ui:embeds` | `getSelection()`, `replaceSelection()`, `insertAtCursor()`, `getDocument()`, `editMarkdown()`, `insertEmbed()`, `embeds.register()` | Active editor manipulation, live document edits, and custom block embeds |
| **`context.ui`** | `ui:navigation`<br>`ui:notices`<br>`ui:panels` | `showNotice()`, `openNote()`, `panels.register()`, `panels.open()` | Host notifications, precise note navigation, and custom DOM panels |
| **`context.commands`** | `ui:commands` | `register()` | Register global or editor commands for command palette and menus |
| **`context.settings`** | *(None)* | `get()`, `set()`, `remove()` | Read and update the plugin's host-rendered settings |
| **`context.storage`** | `storage` | `get()`, `set()`, `remove()` | Device-local lightweight key-value storage (per workspace & plugin) |
| **`context.secrets`** | `secrets` | `get()`, `set()`, `remove()` | Device-local encrypted secret storage (API keys, tokens) |
| **`context.network`** | `network`<br>`network:public` | `fetch(url, options)` | Network requests (standard requests or public anonymous read-only) |
| **`context.schedules`** | `schedules` | `upsert()`, `list()`, `remove()` | Desktop-only persistent scheduled tasks running while EdgeEver is open |
| **`context.events`** | *(None)* | `on(event, handler)` | Subscribe to workspace note, tag, template, and sync completion events |
| **`context.ai`** | `ai:generate` | `status()`, `generate()`, `transcribeResource()`, `transcribeMedia()` | Invoke workspace-configured AI models for text generation & media transcription |

---

### 1. Notes & Notebooks

#### Querying Notes

```ts
// 1. Lightweight summaries (ideal for lists and sidebars; max 200 items per page)
const result = await context.notes.query({
  notebookId: "optional-notebook-id",
  text: "keyword",
  tags: ["todo"],
  sort: "updated-desc", // "updated-desc" | "created-desc" | "title-asc"
  limit: 50,
  offset: 0
});
// Returns { notes: PluginNoteSummary[], totalCount: number, nextOffset: number | null }

// 2. Query notes with full Markdown content (for linters, indexers, etc.)
const fullNotes = await context.notes.queryContent({
  tags: ["task"],
  limit: 20
});
```

#### Note Operations

```ts
// Get single note details
const note = await context.notes.get(noteId);

// Create note
const newNote = await context.notes.create({
  notebookId: "target-notebook-id",
  title: "New Note",
  contentMarkdown: "# Title\nBody text",
  tags: ["tag1"]
});

// Update entire note
await context.notes.update(noteId, {
  title: "Updated Title",
  contentMarkdown: "New body",
  tags: ["updated"]
});

// Partial optimistic edit with concurrency check (revision & contentHash)
await context.notes.editMarkdown(noteId, {
  expectedRevision: note.revision,
  expectedContentHash: note.contentHash,
  edits: [
    { from: 0, to: 0, insert: "> Prepend quote\n\n" } // UTF-16 offsets, half-open interval [from, to)
  ]
});

// Move, pin, and delete
await context.notes.move([noteId], targetNotebookId);
await context.notes.pin([noteId], true);
await context.notes.delete(noteId, { permanent: false }); // Move to trash
await context.notes.restore(noteId); // Restore from trash

// Note revisions
const revisions = await context.notes.revisions.list(noteId);
await context.notes.revisions.restore(noteId, revisionId);
```

#### Notebooks & Tags

```ts
// Notebooks
const notebooks = await context.notebooks.list();
const nb = await context.notebooks.create({ name: "New Notebook", parentId: null });
await context.notebooks.update(nb.id, { name: "New Name" });
await context.notebooks.delete(nb.id);

// Tags
const tags = await context.tags.list();
await context.tags.rename("old-tag", "new-tag");
await context.tags.delete("unused-tag");
```

---

### 2. Templates

Manage workspace-shared templates and apply them to create new notes:

```ts
// List all available templates
const templates = await context.templates.list();

// Create a template (directly or from an existing noteId)
const template = await context.templates.create({
  name: "Meeting Notes",
  description: "Standard team sync meeting template",
  contentMarkdown: "## Attendees\n\n## Agenda\n\n## Action Items\n",
  tags: ["meeting"]
});

// Update a template
await context.templates.update(template.id, {
  name: "Weekly Sync",
  description: "Weekly team sync notes"
});

// Apply template to create a new note in target notebook
const note = await context.templates.use(template.id, targetNotebookId);

// Delete template
await context.templates.delete(template.id);
```

---

### 3. Resources & Attachments

Manage images and file attachments associated with notes:

```ts
// List note attachments
const resources = await context.resources.list(noteId);

// Read attachment Blob
const blob = await context.resources.read(resourceId);

// Upload new attachment
const uploaded = await context.resources.upload(noteId, file);

// Concurrency-checked update (file limit: 100 MiB)
await context.resources.update(resourceId, {
  file: newFile,
  expectedContentHash: currentResource.contentHash
});

// Rename and delete
await context.resources.rename(resourceId, "document.pdf");
await context.resources.delete(resourceId);
```

---

### 4. Editor & Embeds

Interact with active editor sessions:

```ts
// Get and replace selection
const selection = await context.editor.getSelection();
if (selection && !selection.empty) {
  await context.editor.replaceSelection(selection.text.toUpperCase());
}

// Insert at cursor
await context.editor.insertAtCursor("- [ ] New task\n");

// Live edit in-memory document without losing unsaved changes
const doc = await context.editor.getDocument();
if (doc) {
  await context.editor.editMarkdown([
    { from: 0, to: 0, insert: "<!-- inserted header -->\n" }
  ]);
}
```

#### Custom Block Embeds

Register custom block-level embed renderers (serialized in Markdown as `edgeever-plugin-embed` code fences):

```ts
// 1. Register embed renderer
context.editor.embeds.register({
  type: "my-diagram",
  async mount(container, embed) {
    const data = embed.data;
    container.innerHTML = `<div>Diagram: ${data.title}</div>`;
    return () => container.replaceChildren(); // Cleanup on unmount
  }
});

// 2. Insert embed into document
await context.editor.insertEmbed({
  type: "my-diagram",
  title: "Architecture",
  data: { mode: "preview", version: 1 } // JSON-compatible object, max 64 KiB
});
```

---

### 5. UI, Commands & Panels

#### Commands

```ts
context.commands.register({
  id: "quick-action",
  title: "Quick Action",
  listed: true, // Display on marketplace card (default: true; false for contextual commands)
  menu: true,   // Show in desktop shortcut menu (default: true)
  async run() {
    context.ui.showNotice("Action executed");
  }
});
```

#### Note Navigation

```ts
// Open note and optionally jump to exact search term
await context.ui.openNote(noteId, { search: "search term" });
```

#### Custom DOM Panels

Register native DOM panels presented as dialogs or full-screen views:

```ts
context.ui.panels.register({
  id: "task-dashboard",
  title: "Task Dashboard",
  purpose: "dashboard", // "workflow" | "dashboard" | "preview" | "onboarding"
  presentation: "dialog", // "dialog" | "fullscreen"
  mount(container, { shell, requestClose, state }) {
    // 1. Use standard host shell controls (header, toolbar, search, tabs)
    shell.set({
      header: {
        title: "Tasks",
        description: "View pending and active tasks",
        actions: [{ id: "refresh", label: "Refresh" }]
      },
      toolbar: [
        {
          type: "tabs",
          key: "filter",
          value: "all",
          options: [{ value: "all", label: "All" }, { value: "done", label: "Done" }]
        },
        { type: "search", key: "q", placeholder: "Search tasks" }
      ],
      onAction(actionId) { /* Handle action button clicks */ },
      onChange(key, value) { /* Handle filter / search changes */ }
    });

    // 2. Render custom DOM
    const content = document.createElement("div");
    content.textContent = "Dashboard content";
    container.append(content);

    return () => content.remove(); // Cleanup
  },
  beforeClose() {
    // Guard unsaved state: return true to close, false to keep open, or confirmation options
    return true;
  }
});

// Open panel
await context.ui.panels.open("task-dashboard", { state: { initialTab: "all" } });
```

---

### 6. Settings

Declare settings fields in `manifest.json`; EdgeEver renders the settings UI automatically:

```json
{
  "settings": {
    "fields": [
      { "key": "endpoint", "type": "text", "label": "API Endpoint", "required": true },
      { "key": "token", "type": "secret", "label": "API Token", "required": true },
      { "key": "autoSync", "type": "boolean", "label": "Auto Sync", "default": true },
      {
        "key": "mode",
        "type": "select",
        "label": "Sync Mode",
        "default": "fast",
        "options": [
          { "value": "fast", "label": "Fast" },
          { "value": "full", "label": "Full" }
        ]
      }
    ]
  }
}
```

#### Accessing and Listening to Settings

```ts
// Read setting values
const endpoint = await context.settings.get<string>("endpoint");
const token = await context.settings.get<string>("token");

// Listen for setting changes
context.events.on("settings.changed", async ({ key }) => {
  if (key === "autoSync") {
    const autoSync = await context.settings.get<boolean>("autoSync");
    // Update logic
  }
});
```

> [!NOTE]
> `type: "secret"` values are encrypted locally and never echoed back into form markup. Settings are stored locally per device and do not sync across devices.

---

### 7. Storage & Secrets

Isolated per workspace and plugin ID on the current device:

```ts
// Ordinary key-value store (ideal for cursors and caches)
await context.storage.set("last_sync_time", Date.now());
const lastSync = await context.storage.get<number>("last_sync_time");
await context.storage.remove("last_sync_time");

// Secret storage (API keys, tokens; encrypted locally)
await context.secrets.set("api_key", "sk-xxx");
const apiKey = await context.secrets.get("api_key");
await context.secrets.remove("api_key");
```

---

### 8. Network Requests

```ts
// 1. Standard request (arbitrary HTTP/HTTPS; subject to host CORS policies)
const response = await context.network.fetch("https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "example" })
});
const data = await response.json();

// 2. Public read-only request (anonymous, read-only cross-origin GET/HEAD on port 443)
const publicRes = await context.network.fetch("https://example.org/feed.xml", {
  transport: "public",
  headers: { Accept: "application/rss+xml" }
});
const xml = await publicRes.text();
```

---

### 9. Schedules (Desktop Only)

Desktop plugins can persist scheduled execution of registered commands while EdgeEver is running:

```ts
// Register command
context.commands.register({
  id: "sync-feed",
  title: "Sync Feeds",
  run: async () => { /* Long-running sync task */ }
});

// Configure schedule (idempotent; keyed by "pluginId + key")
await context.schedules.upsert({
  key: "hourly-sync",
  name: "Hourly Feed Sync",
  commandId: "sync-feed",
  cronExpression: "0 * * * *",
  missedRunPolicy: "run-once" // "run-once" | "skip"
});

// List or remove
const schedules = await context.schedules.list();
await context.schedules.remove("hourly-sync");
```

---

### 10. Events

Subscribe to workspace data changes:

```ts
// Note events
context.events.on("note.created", ({ note }) => console.log("Created", note.id));
context.events.on("note.updated", ({ note }) => console.log("Updated", note.id));
context.events.on("note.deleted", ({ noteId }) => console.log("Deleted", noteId));

// Other events
context.events.on("tag.changed", () => { /* Tag updated */ });
context.events.on("workspace.synced", () => { /* Workspace sync completed */ });
```

---

### 11. AI Capabilities

Invoke workspace-configured AI models for text generation and media transcription (credentials are managed securely by the host; plugins never touch user API keys):

```ts
// 1. Check AI configuration status
const status = await context.ai.status();
// { configured: boolean, modelName?: string }

if (status.configured) {
  // 2. Text generation
  const result = await context.ai.generate({
    system: "You are a writing assistant.",
    prompt: "Refine this paragraph: ...",
    maxOutputTokens: 2000,
    signal: abortController.signal
  });
  console.log("Output:", result.text);

  // 3. Transcribe audio/video attachments already in the note
  const transcript = await context.ai.transcribeResource(noteId, resourceId);
  // { text: string, resourceId: string, filename: string }

  // 4. Transcribe standalone Blob / File held by the plugin
  const ownMedia = new File([audioBytes], "recording.mp3", { type: "audio/mpeg" });
  const mediaTranscript = await context.ai.transcribeMedia(ownMedia, {
    signal: abortController.signal
  });
  console.log("Transcription:", mediaTranscript.text);
}
```

---

## Themes (No-Code Extensions)

Themes are declarative extensions requiring only a `manifest.json`:

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

Supported tokens:
- Colors: `color.background`, `color.surface`, `color.surfaceMuted`, `color.text`, `color.textMuted`, `color.border`, `color.accent`, `color.accentForeground`, `color.success`, `color.warning`, `color.danger` (format: `#RRGGBB` or `#RRGGBBAA`)
- Typography & Layout: `font.body`, `font.mono`, `font.size`, `lineHeight.body`, `radius.medium`, `density.scale`, `editor.contentWidth`

---

## Packaging, Distribution & Local Testing

### Packaging Rules

A plugin distribution bundle must be self-contained:
- `manifest.json`: Plugin manifest
- `main.js`: Single-file JavaScript bundle (max 5 MB)
- `styles.css`: Optional stylesheet (max 1 MB)

If using `@edgeever/plugin-api`, inline it into `main.js` during build.

### GitHub Distribution

1. Host a repository containing `manifest.json` on GitHub (public repository).
2. Create a GitHub Release with a tag matching the manifest version (e.g. `1.0.0` or `v1.0.0`).
3. Attach `manifest.json`, `main.js`, and optional `styles.css` as Release assets.
4. Users install it directly via the Plugin Marketplace page:
   ```text
   https://github.com/owner/edgeever-plugin
   ```

### Local Testing

While developing EdgeEver, install local extension manifests in the Plugin Marketplace:
- `/extensions/recent-notes/manifest.json` (Official example plugin)
- `/extensions/nord-emerald/manifest.json` (Official example theme)

To submit to the official verified marketplace, see the [Plugin Marketplace Policy](plugin-marketplace-policy.md).
