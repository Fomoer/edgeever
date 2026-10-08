import type { ExtensionLocales, LocalizedExtensionMetadata, MarketplaceEntry } from "@edgeever/plugin-api";
import type { InstalledExtension } from "./plugin-host";

export interface PluginCatalogItem {
  id: string;
  marketplaceEntry?: MarketplaceEntry;
  extension?: InstalledExtension;
}

export type PluginCatalogSourceKey = "official" | "community" | "verified" | "github" | "manifest" | "marketplace";

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
  if (item.marketplaceEntry?.listing === "community") return "community";
  if (item.marketplaceEntry || item.extension?.source.verified) return "verified";
  return item.extension?.source.kind ?? null;
};

const normalizeLocale = (locale: string) => locale.trim().replaceAll("_", "-").toLocaleLowerCase();

const getLocalizedMetadata = (locales: ExtensionLocales | undefined, locale: string | undefined): LocalizedExtensionMetadata | undefined => {
  if (!locales || !locale) return undefined;
  const normalizedLocale = normalizeLocale(locale);
  const entries = Object.entries(locales);
  const exact = entries.find(([candidate]) => normalizeLocale(candidate) === normalizedLocale)?.[1];
  if (exact) return exact;
  const language = normalizedLocale.split("-")[0];
  return entries.find(([candidate]) => normalizeLocale(candidate).split("-")[0] === language)?.[1];
};

export const getPluginCatalogName = (item: PluginCatalogItem, locale?: string) =>
  getLocalizedMetadata(item.extension?.manifest.locales, locale)?.name
  ?? getLocalizedMetadata(item.marketplaceEntry?.locales, locale)?.name
  ?? item.extension?.manifest.name
  ?? item.marketplaceEntry?.name
  ?? item.id;

export const getPluginCatalogDescription = (item: PluginCatalogItem, locale?: string) =>
  getLocalizedMetadata(item.extension?.manifest.locales, locale)?.description
  ?? getLocalizedMetadata(item.marketplaceEntry?.locales, locale)?.description
  ?? item.extension?.manifest.description
  ?? item.marketplaceEntry?.description
  ?? "";

export const getPluginCatalogRepositoryUrl = (item: PluginCatalogItem) =>
  item.extension?.source.repositoryUrl ?? item.marketplaceEntry?.repositoryUrl;

export const getPluginCatalogVersion = (item: PluginCatalogItem) =>
  item.extension?.manifest.version ?? item.marketplaceEntry?.verification.version;

export const canReplaceWithVerifiedMarketplace = (item: PluginCatalogItem) =>
  Boolean(item.extension && item.marketplaceEntry && item.extension.source.kind !== "marketplace");
