import type { AiDiscoveredModel, AiProviderConfig } from "@edgeever/shared";

export const AI_MODEL_DISCOVERY_FRESH_MS = 24 * 60 * 60_000;
const RETRY_DELAY_MS = 60 * 60_000;
const CACHE_PREFIX = "edgeever.ai-model-discovery.v1:";
type ProviderIdentity = Pick<AiProviderConfig, "id" | "provider" | "baseUrl">;
export type DiscoveryCache = { models: AiDiscoveredModel[]; updatedAt: number };
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const modelDiscoveryStorageKey = (instanceUrl: string, userId: string | null, providerId: string) =>
  userId ? `${CACHE_PREFIX}${JSON.stringify([instanceUrl.replace(/\/$/, ""), userId, providerId])}` : null;

const browserStorage = (): CacheStorage | undefined => {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
};

export const readModelDiscoveryCache = (
  key: string | null,
  provider: ProviderIdentity,
  storage = browserStorage(),
): DiscoveryCache | undefined => {
  if (!key || !storage) return;
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached.provider !== provider.provider || cached.baseUrl !== provider.baseUrl
      || !Number.isFinite(cached.updatedAt) || cached.updatedAt <= 0 || cached.updatedAt > Date.now()
      || !Array.isArray(cached.models)
      || !cached.models.every((model: AiDiscoveredModel) => model && typeof model.modelId === "string" && typeof model.displayName === "string")) return;
    return { models: cached.models, updatedAt: cached.updatedAt };
  } catch { return; }
};

export const writeModelDiscoveryCache = (
  key: string | null,
  provider: ProviderIdentity,
  models: AiDiscoveredModel[],
  storage = browserStorage(),
) => {
  if (!key || !storage) return;
  try {
    // Store model metadata only; credentials are never part of the cache.
    storage.setItem(key, JSON.stringify({ provider: provider.provider, baseUrl: provider.baseUrl, models, updatedAt: Date.now() }));
  } catch { /* A full or restricted cache must not prevent model selection. */ }
};

export const removeModelDiscoveryCache = (key: string | null, storage = browserStorage()) => {
  if (!key || !storage) return;
  try { storage.removeItem(key); } catch { /* Cache removal is best effort. */ }
};

export const nextModelDiscoveryRefresh = (updatedAt: number, errorUpdatedAt: number, now = Date.now()) =>
  Math.max(1_000, errorUpdatedAt > updatedAt
    ? errorUpdatedAt + RETRY_DELAY_MS - now
    : (updatedAt ? updatedAt + AI_MODEL_DISCOVERY_FRESH_MS : now + RETRY_DELAY_MS) - now);
