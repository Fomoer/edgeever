import { describe, expect, test } from "bun:test";
import {
  buildPluginCatalogItems,
  canReplaceWithVerifiedMarketplace,
  getPluginCatalogDescription,
  getPluginCatalogName,
  getPluginCatalogRepositoryUrl,
  getPluginCatalogSourceKey,
  getPluginCatalogVersion,
} from "./plugin-catalog.ts";

const marketplaceEntry = (overrides = {}) => ({
  id: "org.edgeever.plugins.ai-rss",
  name: "EdgeEver AI RSS",
  description: "Official RSS digest",
  author: "EdgeEver",
  publisher: "edgeever",
  category: "News & AI",
  repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
  distribution: { type: "github", repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
  verification: { version: "0.5.3" },
  ...overrides,
});

const extension = (overrides = {}) => {
  const { manifest, source, ...rest } = overrides;
  return {
    manifestUrl: "https://example.com/manifest.json",
    manifest: {
      type: "plugin",
      id: "org.edgeever.plugins.ai-rss",
      name: "EdgeEver AI RSS",
      version: "0.5.3",
      description: "Installed RSS digest",
      ...manifest,
    },
    enabled: true,
    installedAt: "2026-09-01T00:00:00.000Z",
    error: null,
    source: {
      kind: "marketplace",
      verified: true,
      repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss",
      ...source,
    },
    ...rest,
  };
};

describe("plugin catalog items", () => {
  test("keeps marketplace order, attaches installs, and appends sideloaded plugins once", () => {
    const official = marketplaceEntry();
    const community = marketplaceEntry({
      id: "com.example.tasks",
      name: "Tasks",
      publisher: undefined,
      repositoryUrl: "https://github.com/example/tasks",
    });
    const installedOfficial = extension();
    const sideloaded = extension({
      manifest: { id: "com.example.calendar", name: "Calendar", version: "1.0.0" },
      source: { kind: "github", verified: false, repositoryUrl: "https://github.com/example/calendar" },
    });

    const items = buildPluginCatalogItems([official, community], [installedOfficial, sideloaded]);

    expect(items.map((item) => item.id)).toEqual([official.id, community.id, sideloaded.manifest.id]);
    expect(items[0]?.extension).toBe(installedOfficial);
    expect(items[1]?.extension).toBeUndefined();
    expect(items[2]?.marketplaceEntry).toBeUndefined();
  });

  test("does not duplicate an installed marketplace plugin", () => {
    const official = marketplaceEntry();
    const items = buildPluginCatalogItems([official], [extension()]);
    expect(items).toHaveLength(1);
    expect(items[0]?.marketplaceEntry).toBe(official);
    expect(items[0]?.extension?.manifest.id).toBe(official.id);
  });

  test("treats official publisher as a badge, not a separate catalog group", () => {
    const official = { id: "official", marketplaceEntry: marketplaceEntry() };
    const community = {
      id: "community",
      marketplaceEntry: marketplaceEntry({ id: "com.example.tasks", publisher: undefined }),
    };
    const github = {
      id: "github",
      extension: extension({
        manifest: { id: "com.example.calendar" },
        source: { kind: "github", verified: false },
      }),
    };

    expect(getPluginCatalogSourceKey(official)).toBe("official");
    expect(getPluginCatalogSourceKey(community)).toBe("verified");
    expect(getPluginCatalogSourceKey(github)).toBe("github");
  });

  test("offers replace-with-verified only for sideloaded installs listed in the marketplace", () => {
    const marketplaceInstall = {
      id: "org.edgeever.plugins.ai-rss",
      marketplaceEntry: marketplaceEntry(),
      extension: extension(),
    };
    const sideloadedListed = {
      id: "org.edgeever.plugins.ai-rss",
      marketplaceEntry: marketplaceEntry(),
      extension: extension({ source: { kind: "github", verified: false } }),
    };
    const uninstalled = { id: "org.edgeever.plugins.ai-rss", marketplaceEntry: marketplaceEntry() };

    expect(canReplaceWithVerifiedMarketplace(marketplaceInstall)).toBe(false);
    expect(canReplaceWithVerifiedMarketplace(sideloadedListed)).toBe(true);
    expect(canReplaceWithVerifiedMarketplace(uninstalled)).toBe(false);
  });

  test("prefers installed metadata when a marketplace plugin is already present", () => {
    const item = {
      id: "org.edgeever.plugins.ai-rss",
      marketplaceEntry: marketplaceEntry({ name: "Market name", description: "Market copy", verification: { version: "0.5.2" } }),
      extension: extension({
        manifest: { name: "Installed name", description: "Installed copy", version: "0.5.3" },
        source: { repositoryUrl: "https://github.com/tianma-if/edgeever-ai-rss" },
      }),
    };

    expect(getPluginCatalogName(item)).toBe("Installed name");
    expect(getPluginCatalogDescription(item)).toBe("Installed copy");
    expect(getPluginCatalogVersion(item)).toBe("0.5.3");
    expect(getPluginCatalogRepositoryUrl(item)).toBe("https://github.com/tianma-if/edgeever-ai-rss");
  });
});
