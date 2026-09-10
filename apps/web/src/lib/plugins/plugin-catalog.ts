import type { MarketplaceEntry } from "@edgeever/plugin-api";
import type { InstalledExtension } from "./plugin-host";

export interface PluginCatalogItem {
  id: string;
  marketplaceEntry?: MarketplaceEntry;
  extension?: InstalledExtension;
}

export type PluginCatalogSourceKey = "official" | "verified" | "github" | "manifest" | "marketplace";

export const buildPluginCatalogItems = (
  marketplaceEntries: readonly MarketplaceEntry[],
  extensions: readonly InstalledExtension[],
): PluginCatalogItem[] => {
  const extensionsById = new Map(extensions.map((extension) => [extension.manifest.id, extension]));
  const items: PluginCatalogItem[] = marketplaceEntries.map((marketplaceEntry) => ({
    id: marketplaceEntry.id,
    marketplaceEntry,
    extension: extensionsById.get(marketplaceEntry.id),
  }));
  const marketplaceIds = new Set(marketplaceEntries.map((entry) => entry.id));
  for (const extension of extensions) {
    if (!marketplaceIds.has(extension.manifest.id)) {
      items.push({ id: extension.manifest.id, extension });
    }
  }
  return items;
};

export const getPluginCatalogSourceKey = (item: PluginCatalogItem): PluginCatalogSourceKey | null => {
  if (item.marketplaceEntry?.publisher === "edgeever") return "official";
  if (item.marketplaceEntry || item.extension?.source.verified) return "verified";
  return item.extension?.source.kind ?? null;
};

export const getPluginCatalogName = (item: PluginCatalogItem) =>
  item.extension?.manifest.name ?? item.marketplaceEntry?.name ?? item.id;

export const getPluginCatalogDescription = (item: PluginCatalogItem) =>
  item.extension?.manifest.description ?? item.marketplaceEntry?.description ?? "";

export const getPluginCatalogRepositoryUrl = (item: PluginCatalogItem) =>
  item.extension?.source.repositoryUrl ?? item.marketplaceEntry?.repositoryUrl;

export const getPluginCatalogVersion = (item: PluginCatalogItem) =>
  item.extension?.manifest.version ?? item.marketplaceEntry?.verification.version;

export const canReplaceWithVerifiedMarketplace = (item: PluginCatalogItem) =>
  Boolean(item.extension && item.marketplaceEntry && item.extension.source.kind !== "marketplace");
