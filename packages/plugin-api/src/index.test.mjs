import { describe, expect, test } from "bun:test";
import { parseExtensionManifest, parseMarketplaceRegistry } from "./index.ts";

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
            default: "https://example.com",
            className: "plugin-owned-layout",
            style: { color: "red" },
            html: "<script>alert(1)</script>",
          },
          { key: "token", type: "secret", label: "Token", required: true },
          { key: "limit", type: "number", label: "Limit", default: 10, min: 1, max: 100 },
          { key: "enabled", type: "boolean", label: "Enabled", default: true },
          { key: "format", type: "select", label: "Format", options: [{ value: "md", label: "Markdown" }] },
        ],
      },
    });

    expect(manifest.type).toBe("plugin");
    expect(manifest.settings?.fields).toHaveLength(5);
    expect(manifest.settings?.fields[0]).toMatchObject({ key: "endpoint", default: "https://example.com" });
    expect(manifest.settings?.fields[0]).not.toHaveProperty("className");
    expect(manifest.settings?.fields[0]).not.toHaveProperty("style");
    expect(manifest.settings?.fields[0]).not.toHaveProperty("html");
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
        author: "EdgeEver",
        publisher: "edgeever",
        category: "Productivity",
        repositoryUrl: "https://github.com/edgeever/example",
        distribution: { type: "github", repositoryUrl: "https://github.com/edgeever/example" },
        verification: { version: "1.0.0", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
      }],
    }).entries[0]).toMatchObject({ id: "org.edgeever.example", publisher: "edgeever", verification: { version: "1.0.0" } });
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
});
