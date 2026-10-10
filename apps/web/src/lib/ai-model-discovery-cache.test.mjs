import { describe, expect, test } from "bun:test";
import {
  AI_MODEL_DISCOVERY_FRESH_MS, modelDiscoveryStorageKey, nextModelDiscoveryRefresh,
  readModelDiscoveryCache, removeModelDiscoveryCache, writeModelDiscoveryCache,
} from "./ai-model-discovery-cache.ts";

const provider = { id: "provider-1", provider: "openai-compatible", baseUrl: "https://models.example/v1" };
const models = [{ modelId: "model-1", displayName: "Model One" }];
const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
};

describe("persistent model discovery cache", () => {
  test("separates accounts and instances and skips unidentified users", () => {
    const key = modelDiscoveryStorageKey("https://instance.example/", "owner", provider.id);
    expect(key).toBe(modelDiscoveryStorageKey("https://instance.example", "owner", provider.id));
    expect(key).not.toBe(modelDiscoveryStorageKey("https://instance.example", "member", provider.id));
    expect(key).not.toBe(modelDiscoveryStorageKey("https://other.example", "owner", provider.id));
    expect(modelDiscoveryStorageKey("https://instance.example", null, provider.id)).toBeNull();
    const storage = createStorage();
    writeModelDiscoveryCache(key, provider, models, storage);
    expect(readModelDiscoveryCache(modelDiscoveryStorageKey("https://instance.example", "member", provider.id), provider, storage)).toBeUndefined();
  });

  test("starts without a cache for existing installations, survives reload, and clears on connection changes", () => {
    const storage = createStorage();
    const key = modelDiscoveryStorageKey("https://instance.example", "owner", provider.id);
    expect(readModelDiscoveryCache(key, provider, storage)).toBeUndefined();
    writeModelDiscoveryCache(key, provider, models, storage);
    expect(readModelDiscoveryCache(key, { ...provider }, storage)?.models).toEqual(models);
    expect(readModelDiscoveryCache(key, { ...provider, baseUrl: "https://other.example" }, storage)).toBeUndefined();
    expect(readModelDiscoveryCache(key, { ...provider, provider: "google" }, storage)).toBeUndefined();
    removeModelDiscoveryCache(key, storage);
    expect(readModelDiscoveryCache(key, provider, storage)).toBeUndefined();
  });

  test("retains expired models for immediate display during a background refresh or failure", () => {
    const storage = createStorage();
    const key = "test";
    const updatedAt = Date.now() - AI_MODEL_DISCOVERY_FRESH_MS - 1;
    storage.setItem(key, JSON.stringify({ ...provider, models, updatedAt }));
    expect(readModelDiscoveryCache(key, provider, storage)).toEqual({ models, updatedAt });
    expect(nextModelDiscoveryRefresh(updatedAt, 0)).toBe(1_000);
  });

  test("ignores malformed caches and tolerates restricted or full storage", () => {
    const storage = createStorage();
    for (const value of ["not json", "null", JSON.stringify({ ...provider, models: [{}], updatedAt: Date.now() }), JSON.stringify({ ...provider, models, updatedAt: Date.now() + 60_000 })]) {
      storage.setItem("test", value);
      expect(readModelDiscoveryCache("test", provider, storage)).toBeUndefined();
    }
    const restricted = { getItem: () => { throw new Error("restricted"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("restricted"); } };
    expect(readModelDiscoveryCache("test", provider, restricted)).toBeUndefined();
    expect(() => writeModelDiscoveryCache("test", provider, models, restricted)).not.toThrow();
    expect(() => removeModelDiscoveryCache("test", restricted)).not.toThrow();
  });

  test("refreshes at daily expiry and backs off after failed background updates", () => {
    const now = Date.now();
    expect(nextModelDiscoveryRefresh(now, 0, now)).toBe(24 * 60 * 60_000);
    expect(nextModelDiscoveryRefresh(now - AI_MODEL_DISCOVERY_FRESH_MS + 5_000, 0, now)).toBe(5_000);
    expect(nextModelDiscoveryRefresh(now - AI_MODEL_DISCOVERY_FRESH_MS, now, now)).toBe(60 * 60_000);
  });
});
