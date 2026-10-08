import { describe, expect, test } from "bun:test";
import {
  mergeCommunityMarketplace,
  normalizePluginPanelChrome,
  parseExtensionManifest,
  parseMarketplaceRegistry,
  rememberMarketplaceRevocations,
} from "./index.ts";

describe("extension manifests", () => {
  test("normalizes a plugin manifest", () => {
    expect(parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.example",
      name: "Example",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: ["notes:read", "notes:read", "templates:read", "templates:write", "schedules", "ui:commands", "ui:navigation", "ui:embeds"],
    })).toMatchObject({ permissions: ["notes:read", "templates:read", "templates:write", "schedules", "ui:commands", "ui:navigation", "ui:embeds"] });
  });

  test("normalizes localized plugin metadata", () => {
    const manifest = parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.localized",
      name: "Localized",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      description: "English description",
      locales: {
        zh_CN: { name: "本地化插件", description: " 中文说明 " },
        ja: { description: "日本語の説明", html: "<script>" },
      },
      entry: "./main.js",
      permissions: [],
    });

    expect(manifest.locales).toEqual({
      "zh-CN": { name: "本地化插件", description: "中文说明" },
      ja: { description: "日本語の説明" },
    });
  });

  test("rejects invalid localized plugin metadata", () => {
    const base = {
      type: "plugin",
      id: "org.edgeever.localized",
      name: "Localized",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: [],
    };
    expect(() => parseExtensionManifest({ ...base, locales: { invalid_locale_tag: { description: "Bad" } } })).toThrow("BCP 47");
    expect(() => parseExtensionManifest({ ...base, locales: { "zh-CN": {} } })).toThrow("name or description");
  });

  test("rejects unsupported capability metadata", () => {
    expect(() => parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.bad",
      name: "Bad",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: ["database:raw"],
    })).toThrow("Unsupported plugin permission");
  });

  test("requires API v2 plugins to use host-rendered settings", () => {
    const base = {
      type: "plugin",
      id: "org.edgeever.policy",
      name: "Policy",
      version: "1.0.0",
      entry: "./main.js",
      permissions: [],
    };
    expect(() => parseExtensionManifest({ ...base, apiVersion: "1", settingsUi: "host" })).toThrow("Unsupported plugin API version");
    expect(() => parseExtensionManifest({ ...base, apiVersion: "2" })).toThrow('settingsUi to be "host"');
    expect(() => parseExtensionManifest({ ...base, apiVersion: "2", settingsUi: "custom" })).toThrow('settingsUi to be "host"');
  });

  test("rejects unknown theme tokens", () => {
    expect(() => parseExtensionManifest({
      type: "theme",
      id: "org.edgeever.theme",
      name: "Theme",
      version: "1.0.0",
      themeApiVersion: "1",
      modes: ["light"],
      light: { "unsafe.selector": "body" },
    })).toThrow("Unsupported theme token");
  });

  test("rejects CSS injection through theme values", () => {
    expect(() => parseExtensionManifest({
      type: "theme",
      id: "org.edgeever.remote-theme",
      name: "Remote Theme",
      version: "1.0.0",
      themeApiVersion: "1",
      modes: ["light"],
      light: { "color.background": "url(https://example.com/track)" },
    })).toThrow("must use #RRGGBB");
  });

  test("allows direct network plugins without a static host list", () => {
    expect(parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.network",
      name: "Network",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: ["network"],
    })).toMatchObject({ permissions: ["network"] });
  });

  test("normalizes an Obsidian-style trusted plugin without capability declarations", () => {
    expect(parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.trusted",
      name: "Trusted",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
    })).toMatchObject({ permissions: [] });
  });

  test("allows public read-only network plugins without a static host list", () => {
    expect(parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.public-network",
      name: "Public network",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: ["network", "network:public"],
    })).toMatchObject({ permissions: ["network", "network:public"] });
  });

  test("normalizes a host-rendered plugin settings schema", () => {
    const manifest = parseExtensionManifest({
      type: "plugin",
      id: "org.edgeever.settings",
      name: "Settings",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: [],
      settings: {
        fields: [
          {
            key: "endpoint",
            type: "text",
            label: "Endpoint",
            locales: { "zh-CN": { label: "服务地址", description: "连接地址", placeholder: "请输入地址" } },
            default: "https://example.com",
            className: "plugin-owned-layout",
            style: { color: "red" },
            html: "<script>alert(1)</script>",
          },
          { key: "token", type: "secret", label: "Token", required: true },
          { key: "limit", type: "number", label: "Limit", default: 10, min: 1, max: 100 },
          { key: "enabled", type: "boolean", label: "Enabled", default: true },
          { key: "format", type: "select", label: "Format", options: [{ value: "md", label: "Markdown" }], locales: { ja: { label: "形式", options: { md: "マークダウン" } } } },
          {
            key: "topics.ai",
            type: "boolean",
            label: "AI",
            default: true,
            className: "plugin-owned-layout",
            list: {
              title: "AI sources",
              actionLabel: "View sources",
              className: "ignored",
              items: [
                { title: "OpenAI News", description: "openai.com", html: "<script>" },
                { title: "Google AI" },
              ],
            },
          },
        ],
      },
    });

    expect(manifest.type).toBe("plugin");
    expect(manifest.settings?.fields).toHaveLength(6);
    expect(manifest.settings?.fields[0]).toMatchObject({ key: "endpoint", default: "https://example.com" });
    expect(manifest.settings?.fields[0].locales?.["zh-CN"]).toEqual({ label: "服务地址", description: "连接地址", placeholder: "请输入地址" });
    expect(manifest.settings?.fields[4].locales?.ja?.options).toEqual({ md: "マークダウン" });
    expect(manifest.settings?.fields[0]).not.toHaveProperty("className");
    expect(manifest.settings?.fields[0]).not.toHaveProperty("style");
    expect(manifest.settings?.fields[0]).not.toHaveProperty("html");
    expect(manifest.settings?.fields[5]).toMatchObject({
      key: "topics.ai",
      list: {
        title: "AI sources",
        actionLabel: "View sources",
        items: [{ title: "OpenAI News", description: "openai.com" }, { title: "Google AI" }],
      },
    });
    expect(manifest.settings?.fields[5].list).not.toHaveProperty("className");
    expect(manifest.settings?.fields[5].list.items[0]).not.toHaveProperty("html");
  });

  test("rejects unsafe or ambiguous plugin settings", () => {
    const base = {
      type: "plugin",
      id: "org.edgeever.settings-invalid",
      name: "Settings",
      version: "1.0.0",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: [],
    };
    expect(() => parseExtensionManifest({
      ...base,
      settings: { fields: [{ key: "token", type: "secret", label: "Token", default: "plaintext" }] },
    })).toThrow("cannot declare a default");
    expect(() => parseExtensionManifest({
      ...base,
      settings: { fields: [{ key: "mode", type: "select", label: "Mode", options: [{ value: "a", label: "A" }, { value: "a", label: "Again" }] }] },
    })).toThrow("duplicate select value");
    expect(() => parseExtensionManifest({
      ...base,
      settings: { fields: [{ key: "topics.ai", type: "boolean", label: "AI", list: { items: [] } }] },
    })).toThrow("between 1 and 100 items");
    expect(() => parseExtensionManifest({
      ...base,
      settings: { fields: [{ key: "mode", type: "select", label: "Mode", options: [{ value: "a", label: "A" }], locales: { ja: { options: { missing: "不明" } } } }] },
    })).toThrow("invalid options");
  });
});

describe("marketplace registry", () => {
  test("accepts a verified GitHub entry", () => {
    expect(parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-08-16T00:00:00.000Z",
      entries: [{
        id: "org.edgeever.example",
        name: "Example",
        description: "Example plugin",
        locales: { "zh-CN": { description: "示例插件" } },
        author: "EdgeEver",
        publisher: "edgeever",
        category: "Productivity",
        repositoryUrl: "https://github.com/edgeever/example",
        distribution: { type: "github", repositoryUrl: "https://github.com/edgeever/example" },
        verification: { version: "1.0.0", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
      }],
    }).entries[0]).toMatchObject({
      id: "org.edgeever.example",
      publisher: "edgeever",
      locales: { "zh-CN": { description: "示例插件" } },
      verification: { version: "1.0.0" },
    });
  });

  test("rejects unknown automatic-update publishers", () => {
    expect(() => parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-08-16T00:00:00.000Z",
      entries: [{
        id: "org.edgeever.example",
        name: "Example",
        description: "Example plugin",
        author: "Example",
        publisher: "third-party",
        category: "Productivity",
        repositoryUrl: "https://github.com/example/plugin",
        distribution: { type: "github", repositoryUrl: "https://github.com/example/plugin" },
        verification: { version: "1.0.0", checksums: { manifestJson: "a".repeat(64) } },
      }],
    })).toThrow("invalid publisher");
  });

  test("rejects duplicate plugin ids", () => {
    const entry = {
      id: "org.edgeever.example",
      name: "Example",
      description: "Example plugin",
      author: "EdgeEver",
      category: "Productivity",
      repositoryUrl: "https://github.com/edgeever/example",
      distribution: { type: "github", repositoryUrl: "https://github.com/edgeever/example" },
      verification: { version: "1.0.0", checksums: { manifestJson: "a".repeat(64) } },
    };
    expect(() => parseMarketplaceRegistry({ registryVersion: "1", updatedAt: "2026-08-16T00:00:00Z", entries: [entry, entry] })).toThrow("Duplicate");
  });

  test("keeps community admission fields and ignores a remote listing claim", () => {
    const registry = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-10-05T00:00:00.000Z",
      entries: [{
        id: "com.example.readwise",
        name: "Readwise",
        description: "Imports highlights.",
        author: "Example",
        category: "Import",
        repositoryUrl: "https://github.com/example/readwise",
        distribution: { type: "github", repositoryUrl: "https://github.com/example/readwise" },
        verification: { version: "1.2.0", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
        licenseSpdx: "MIT",
        sourceRevision: "a".repeat(40),
        apiVersion: "2",
        admitted: { permissions: ["notes:write"], networkHosts: ["readwise.io"] },
        listing: "community",
        publisher: undefined,
      }],
      revocations: [{ id: "com.example.old", reason: "仓库已转为私有", revokedAt: "2026-10-05T00:00:00.000Z" }],
    });

    expect(registry.entries[0]).toMatchObject({
      licenseSpdx: "MIT",
      sourceRevision: "a".repeat(40),
      apiVersion: "2",
      admitted: { permissions: ["notes:write"], networkHosts: ["readwise.io"] },
    });
    expect(registry.entries[0]).not.toHaveProperty("listing");
    expect(registry.entries[0]).not.toHaveProperty("publisher");
    expect(registry.revocations).toEqual([
      { id: "com.example.old", reason: "仓库已转为私有", revokedAt: "2026-10-05T00:00:00.000Z" },
    ]);
  });
});

describe("community marketplace merge", () => {
  const bundledEntry = {
    id: "org.edgeever.tasks",
    name: "Tasks",
    description: "Official tasks",
    author: "EdgeEver",
    publisher: "edgeever",
    category: "Productivity",
    repositoryUrl: "https://github.com/tianma-if/edgeever-tasks",
    distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-tasks" },
    verification: { version: "0.6.4", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
  };
  const communityEntry = {
    id: "com.example.readwise",
    name: "Readwise",
    description: "Imports highlights.",
    author: "Example",
    category: "Import",
    repositoryUrl: "https://github.com/example/readwise",
    distribution: { type: "github", repositoryUrl: "https://github.com/example/readwise" },
    verification: { version: "1.2.0", checksums: { manifestJson: "c".repeat(64), mainJs: "d".repeat(64) } },
    apiVersion: "2",
    licenseSpdx: "MIT",
  };
  const bundled = parseMarketplaceRegistry({
    registryVersion: "1",
    updatedAt: "2026-10-01T00:00:00.000Z",
    entries: [bundledEntry],
  });

  test("keeps the bundled entry when a signed file repeats its id or claims the official publisher", () => {
    const community = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-10-05T00:00:00.000Z",
      entries: [
        communityEntry,
        { ...communityEntry, id: "org.edgeever.tasks", apiVersion: "2" },
        { ...communityEntry, id: "com.example.official", publisher: "edgeever", apiVersion: "2" },
        { ...communityEntry, id: "org.edgeever.plugins.extra", apiVersion: "2" },
        { ...communityEntry, id: "com.example.future", apiVersion: "9" },
        {
          ...communityEntry,
          id: "com.example.manifest",
          distribution: { type: "manifest", manifestUrl: "https://example.com/manifest.json" },
        },
      ],
    });

    const merged = mergeCommunityMarketplace(bundled, community, new Set());

    expect(merged.entries.map((entry) => entry.id)).toEqual(["org.edgeever.tasks", "com.example.readwise"]);
    expect(merged.entries[0]).toMatchObject({ publisher: "edgeever", repositoryUrl: bundledEntry.repositoryUrl });
    expect(merged.entries[1]).toMatchObject({ listing: "community", licenseSpdx: "MIT" });
    expect(merged.entries[1]).not.toHaveProperty("publisher");
  });

  test("hides revoked ids and remembers them after a later file omits the revocation", () => {
    const community = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-10-05T00:00:00.000Z",
      entries: [communityEntry],
      revocations: [{ id: "com.example.readwise", reason: "仓库已转为私有", revokedAt: "2026-10-05T00:00:00.000Z" }],
    });
    const remembered = rememberMarketplaceRevocations([], community.revocations);
    const merged = mergeCommunityMarketplace(bundled, community, new Set(remembered.map((item) => item.id)));
    const later = rememberMarketplaceRevocations(remembered, []);

    expect(merged.entries.map((entry) => entry.id)).toEqual(["org.edgeever.tasks"]);
    expect(later.map((item) => item.id)).toEqual(["com.example.readwise"]);
  });
});

describe("panel chrome", () => {
  test("keeps known chrome fields and drops unknown toolbar items", () => {
    const onAction = () => {};
    const chrome = normalizePluginPanelChrome({
      header: { title: "Tasks", description: null, actions: [{ id: "refresh", label: "Refresh", variant: "primary" }] },
      toolbar: [
        { type: "search", key: "q", placeholder: "Search", value: "ship" },
        { type: "tabs", key: "view", value: "open", options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }] },
        { type: "weird", key: "nope" },
      ],
      empty: { title: "Nothing here", description: "Create a task" },
      onAction,
    });
    expect(chrome.header).toEqual({ title: "Tasks", description: null, actions: [{ id: "refresh", label: "Refresh", variant: "primary" }] });
    expect(chrome.toolbar).toEqual([
      { type: "search", key: "q", placeholder: "Search", value: "ship" },
      { type: "tabs", key: "view", value: "open", options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }] },
    ]);
    expect(chrome.empty).toEqual({ title: "Nothing here", description: "Create a task" });
    expect(chrome.onAction).toBe(onAction);
  });

  test("falls back to the first tab option when the value is unknown", () => {
    expect(normalizePluginPanelChrome({
      toolbar: [{ type: "tabs", key: "view", value: "missing", options: [{ value: "open", label: "Open" }] }],
    }).toolbar).toEqual([{ type: "tabs", key: "view", value: "open", options: [{ value: "open", label: "Open" }] }]);
  });
});
