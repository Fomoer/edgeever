import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkInstalledExtensionUpdate, checkPluginUpdates, updateOfficialMarketplacePlugins } from "./plugin-updates.ts";

const pluginManifest = {
  type: "plugin",
  id: "org.edgeever.update-test",
  name: "Update Test",
  version: "1.0.0",
  apiVersion: "2",
  settingsUi: "host",
  entry: "./main.js",
  permissions: ["ui:notices"],
};

const installed = (overrides = {}) => ({
  manifestUrl: "https://example.com/plugin/manifest.json",
  manifest: pluginManifest,
  enabled: true,
  installedAt: "2026-08-16T00:00:00.000Z",
  error: null,
  source: { kind: "manifest", verified: false },
  ...overrides,
});

describe("plugin update checks", () => {
  test("detects a manifest update and reports added access", async () => {
    const request = async () => Response.json({
      ...pluginManifest,
      version: "1.1.0",
      permissions: ["ui:notices", "network"],
      networkHosts: ["api.example.com"],
    });

    const update = await checkInstalledExtensionUpdate(installed(), [], request);

    expect(update?.latestVersion).toBe("1.1.0");
    expect(update?.addedPermissions).toEqual(["network"]);
    expect(update?.addedNetworkHosts).toEqual(["api.example.com"]);
  });

  test("uses the verified registry version for marketplace installs", async () => {
    const entry = {
      id: pluginManifest.id,
      name: pluginManifest.name,
      description: "Verified plugin",
      author: "EdgeEver",
      category: "Productivity",
      repositoryUrl: "https://github.com/example/plugin",
      distribution: { type: "manifest", manifestUrl: "https://example.com/verified/manifest.json" },
      verification: { version: "1.2.0" },
    };
    const request = async () => Response.json({ ...pluginManifest, version: "1.2.0" });

    const update = await checkInstalledExtensionUpdate(installed({ source: { kind: "marketplace", verified: true } }), [entry], request);

    expect(update?.latestVersion).toBe("1.2.0");
    expect(update?.marketplaceEntry).toEqual(entry);
  });

  test("checks GitHub-installed plugins from the latest Release without using the REST API", async () => {
    const calls = [];
    const request = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("api.github.com")) throw new Error(`should not use GitHub REST: ${url}`);
      if (url.endsWith("/releases/latest/download/manifest.json")) {
        return new Response(JSON.stringify({ ...pluginManifest, version: "1.2.0" }));
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const update = await checkInstalledExtensionUpdate(
      installed({
        source: { kind: "github", verified: false, repositoryUrl: "https://github.com/example/plugin" },
      }),
      [],
      request,
    );

    expect(update?.latestVersion).toBe("1.2.0");
    expect(calls.some((url) => url.includes("api.github.com"))).toBe(false);
  });

  test("does not offer the same or an older version", async () => {
    const request = async () => Response.json(pluginManifest);
    expect(await checkInstalledExtensionUpdate(installed(), [], request)).toBeNull();
  });

  test("isolates a failed source while checking other extensions", async () => {
    const broken = installed({ manifest: { ...pluginManifest, id: "org.edgeever.broken" }, manifestUrl: "https://broken.example/manifest.json" });
    const request = async (input) => String(input).includes("broken")
      ? new Response(null, { status: 503 })
      : Response.json({ ...pluginManifest, version: "2.0.0" });

    const result = await checkPluginUpdates([broken, installed()], [], request);

    expect(result.updates.map((update) => update.pluginId)).toEqual([pluginManifest.id]);
    expect(result.errors["org.edgeever.broken"]).toContain("503");
  });

  test("automatically applies only checksum-pinned official marketplace updates", async () => {
    const communityManifest = { ...pluginManifest, id: "org.edgeever.community-test" };
    const extensions = [
      installed({ source: { kind: "marketplace", verified: true } }),
      installed({ manifest: communityManifest, source: { kind: "marketplace", verified: true } }),
    ];
    const entries = [
      {
        id: pluginManifest.id,
        name: pluginManifest.name,
        description: "Official plugin",
        author: "EdgeEver",
        publisher: "edgeever",
        category: "Productivity",
        repositoryUrl: "https://github.com/example/official-plugin",
        distribution: { type: "manifest", manifestUrl: "https://example.com/official/manifest.json" },
        verification: { version: "1.2.0", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
      },
      {
        id: communityManifest.id,
        name: communityManifest.name,
        description: "Community plugin",
        author: "Community",
        category: "Productivity",
        repositoryUrl: "https://github.com/example/community-plugin",
        distribution: { type: "manifest", manifestUrl: "https://example.com/community/manifest.json" },
        verification: { version: "1.2.0", checksums: { manifestJson: "c".repeat(64), mainJs: "d".repeat(64) } },
      },
    ];
    const installedIds = [];
    const host = {
      getSnapshot: () => ({ extensions }),
      installMarketplaceEntry: async (entry) => { installedIds.push(entry.id); },
      installFromGithubRepository: async () => { throw new Error("unexpected GitHub install"); },
      installFromManifestUrl: async () => { throw new Error("unexpected manifest install"); },
    };
    const request = async (input) => Response.json({
      ...(String(input).includes("community") ? communityManifest : pluginManifest),
      version: "1.2.0",
    });

    const result = await updateOfficialMarketplacePlugins(host, entries, request);

    expect(installedIds).toEqual([pluginManifest.id]);
    expect(result.updated.map((update) => update.pluginId)).toEqual([pluginManifest.id]);
  });
});

describe("official plugin auto-update workspace notice", () => {
  test("updates silently without interrupting the workspace", () => {
    const workspace = readFileSync(new URL("../../components/WorkspaceApp.tsx", import.meta.url), "utf8");
    expect(workspace).toContain("updateOfficialMarketplacePlugins");
    expect(workspace).not.toContain("officialAutoUpdated");
    expect(workspace).not.toContain("result.updated.length");
  });
});
