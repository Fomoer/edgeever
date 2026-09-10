const normalizePageName = (pageName: string) => pageName.replace(/^\/+/, "");

export const getAppAssetPath = (assetPath: string, baseUrl: string) =>
  `${baseUrl}${normalizePageName(assetPath)}`;

export const getAppPagePath = (pageName: string, baseUrl: string) =>
  getAppAssetPath(pageName, baseUrl);

export const resolveAppAssetUrl = (assetPath: string, baseUrl: string, locationHref: string) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return new URL(assetPath).href;
  return new URL(getAppAssetPath(assetPath, baseUrl), locationHref).href;
};

export const getAppEntryPath = (baseUrl: string) =>
  baseUrl.startsWith(".") ? `${baseUrl}index.html` : baseUrl;

export const getMessageTargetOrigin = (origin: string) =>
  origin === "null" ? "*" : origin;

export const getPersistentDataScopeOrigin = (origin: string) =>
  origin === "edgeever-app://app" ? "null" : origin;
