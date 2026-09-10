import { describe, expect, test } from "bun:test";
import { parseMarketplaceRegistry } from "@edgeever/plugin-api";
import { sha256Hex } from "./github-plugin-distribution.ts";
import { loadPluginMarketplace, resolveOfficialPluginMarketplace } from "./plugin-marketplace.ts";

describe("bundled plugin marketplace", () => {
  test("loads the registry beside the packaged desktop renderer", async () => {
    let requestedUrl = null;
    const request = async (input) => {
      requestedUrl = String(input);
      return Response.json({ registryVersion: "1", updatedAt: "2026-09-08T00:00:00.000Z", entries: [] });
    };

    await loadPluginMarketplace(
      "/extensions/registry.json",
      request,
      "./",
      "file:///Applications/EdgeEver.app/Contents/Resources/web/index.html",
    );

    expect(requestedUrl).toBe("file:///Applications/EdgeEver.app/Contents/Resources/web/extensions/registry.json");
  });

  test("keeps verified checksums aligned with bundled extension files", async () => {
    const registry = parseMarketplaceRegistry(await Bun.file(new URL("../../../public/extensions/registry.json", import.meta.url)).json());
    expect(registry.entries.map((entry) => entry.id)).not.toContain("org.edgeever.examples.recent-notes");
    expect(registry.entries.map((entry) => entry.id)).not.toContain("org.edgeever.themes.nord-emerald");
    for (const entry of registry.entries) {
      if (entry.distribution.type !== "manifest") continue;
      const relativeManifestPath = entry.distribution.manifestUrl.replace(/^\/extensions\//, "");
      const manifestFileUrl = new URL(`../../../public/extensions/${relativeManifestPath}`, import.meta.url);
      const manifestFile = Bun.file(manifestFileUrl);
      expect(await sha256Hex(await manifestFile.text())).toBe(entry.verification.checksums?.manifestJson);
      if (entry.verification.checksums?.mainJs) {
        const mainFile = Bun.file(new URL("./main.js", manifestFileUrl));
        expect(await sha256Hex(await mainFile.text())).toBe(entry.verification.checksums.mainJs);
      }
    }
  });

  test("pins the official AI RSS release and all distributed assets", async () => {
    const registry = parseMarketplaceRegistry(await Bun.file(new URL("../../../public/extensions/registry.json", import.meta.url)).json());
    const entry = registry.entries.find((candidate) => candidate.id === "org.edgeever.plugins.ai-rss");

    expect(entry).toMatchObject({
      publisher: "edgeever",
      repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
      distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
      verification: {
        version: "0.5.3",
        checksums: {
          manifestJson: "b164bf6ab199f0ef4282319dd87294a876ef3e7701962bae35a7b65c4e3c1156",
          mainJs: "7828d256ad758f85bd736742a72cac62ba46db6a2108c3a974bf9f429fcc3be4",
          stylesCss: "05cd135a1fe70c3f38d34850a2e9abf6b0c0530b09477960036f567375b2082e",
        },
      },
    });
  });

  test("resolves a newer official GitHub release with verified asset checksums", async () => {
    const registry = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      entries: [{
        id: "org.edgeever.plugins.ai-rss",
        name: "EdgeEver AI RSS",
        description: "RSS",
        author: "EdgeEver",
        publisher: "edgeever",
        category: "News & AI",
        repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
        distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
        verification: { version: "0.5.2", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
      }],
    });
    const manifest = {
      type: "plugin",
      id: "org.edgeever.plugins.ai-rss",
      name: "EdgeEver AI RSS",
      version: "0.5.3",
      apiVersion: "2",
      settingsUi: "host",
      entry: "./main.js",
      permissions: ["ui:notices"],
    };
    const manifestText = JSON.stringify(manifest);
    const assets = {
      "manifest.json": new TextEncoder().encode(manifestText).buffer,
      "main.js": new TextEncoder().encode("export default {};").buffer,
    };
    const request = async (input) => {
      const url = String(input);
      if (url.includes("/releases/latest/download/manifest.json") || url.includes("/contents/manifest.json")) {
        return new Response(manifestText);
      }
      if (url.includes("/releases/tags/")) return Response.json({
        tag_name: "v0.5.3",
        draft: false,
        assets: Object.entries(assets).map(([name, buffer], index) => ({
          id: index + 1,
          name,
          size: buffer.byteLength,
          url: `https://api.github.test/assets/${index + 1}`,
          browser_download_url: `https://github.test/v0.5.3/${name}`,
        })),
      });
      throw new Error(`Unexpected request: ${url}`);
    };
    const download = async (_coordinates, _releaseTag, asset) => assets[asset.name];

    const resolved = await resolveOfficialPluginMarketplace(registry, request, download);

    expect(resolved.resolutionErrors).toEqual({});
    expect(resolved.entries[0].verification).toEqual({
      version: "0.5.3",
      checksums: {
        manifestJson: await sha256Hex(assets["manifest.json"]),
        mainJs: await sha256Hex(assets["main.js"]),
      },
    });
  });

  test("does not download official plugin packages when the live version already matches", async () => {
    const checksums = { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) };
    const registry = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      entries: [{
        id: "org.edgeever.plugins.ai-rss",
        name: "EdgeEver AI RSS",
        description: "RSS",
        author: "EdgeEver",
        publisher: "edgeever",
        category: "News & AI",
        repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
        distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
        verification: { version: "0.5.5", checksums },
      }],
    });
    const calls = [];
    const request = async (input) => {
      calls.push(String(input));
      if (String(input).includes("/releases/latest/download/manifest.json")) {
        return new Response(JSON.stringify({
          type: "plugin",
          id: "org.edgeever.plugins.ai-rss",
          name: "EdgeEver AI RSS",
          version: "0.5.5",
          apiVersion: "2",
          settingsUi: "host",
          entry: "./main.js",
          permissions: ["ui:notices"],
        }));
      }
      throw new Error(`Unexpected request: ${input}`);
    };

    const resolved = await resolveOfficialPluginMarketplace(registry, request, async () => {
      throw new Error("should not download plugin assets");
    });

    expect(resolved.resolutionErrors).toEqual({});
    expect(resolved.entries[0].verification).toEqual({ version: "0.5.5", checksums });
    expect(calls).toHaveLength(1);
  });

  test("keeps the pinned release and reports an error when live resolution fails", async () => {
    const registry = parseMarketplaceRegistry({
      registryVersion: "1",
      updatedAt: "2026-09-08T00:00:00.000Z",
      entries: [{
        id: "org.edgeever.plugins.ai-rss",
        name: "EdgeEver AI RSS",
        description: "RSS",
        author: "EdgeEver",
        publisher: "edgeever",
        category: "News & AI",
        repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
        distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
        verification: { version: "0.5.3", checksums: { manifestJson: "a".repeat(64), mainJs: "b".repeat(64) } },
      }],
    });

    const resolved = await resolveOfficialPluginMarketplace(
      registry,
      async () => new Response(null, { status: 503 }),
    );

    expect(resolved.entries[0]).toEqual(registry.entries[0]);
    expect(resolved.resolutionErrors[registry.entries[0].id]).toContain("503");
  });
});
