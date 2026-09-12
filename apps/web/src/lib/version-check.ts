const DESKTOP_ASSET_PATTERN = /^EdgeEver-(\d+\.\d+\.\d+)-mac-(arm64|x64)\.dmg$/;

export const findDesktopReleaseVersion = (assetNames: string[]) => {
  const versions = new Map<string, string>();
  for (const name of assetNames) {
    const match = DESKTOP_ASSET_PATTERN.exec(name);
    if (!match) continue;
    if (versions.has(match[2])) return null;
    versions.set(match[2], match[1]);
  }
  return (
    versions.size === 2 &&
    versions.get("arm64") === versions.get("x64")
  )
    ? versions.get("arm64")!
    : null;
};

export { isClientAheadOfInstance, isVersionOutdated } from "@edgeever/shared";

export const getReleaseTagForVersion = (version: string) => {
  const match = version.match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?$/i);
  return match ? `v${match[1]}` : null;
};

const normalizeLocale = (locale: string) => locale.trim().replaceAll("_", "-").toLowerCase();

export const resolveLocalizedReleaseChanges = (
  changes: Record<string, readonly string[]>,
  language: string,
  fallbackLanguage = "en-US"
) => {
  const locales = Object.keys(changes);
  const normalizedLanguage = normalizeLocale(language);
  const exactLocale = locales.find((locale) => normalizeLocale(locale) === normalizedLanguage);
  if (exactLocale) return changes[exactLocale];

  const baseLanguage = normalizedLanguage.split("-")[0];
  const relatedLocale = locales.find((locale) => normalizeLocale(locale).split("-")[0] === baseLanguage);
  if (relatedLocale) return changes[relatedLocale];

  const normalizedFallback = normalizeLocale(fallbackLanguage);
  const fallbackLocale = locales.find((locale) => normalizeLocale(locale) === normalizedFallback);
  return fallbackLocale ? changes[fallbackLocale] : [];
};
