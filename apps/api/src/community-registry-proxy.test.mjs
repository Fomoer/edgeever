import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { fetchCommunityRegistryRelease, resolveCommunityRegistryUrl } from "./community-registry-proxy.ts";
import { registerPluginDistributionRoutes } from "./plugin-distribution-routes.ts";

const registryText = JSON.stringify({ registryVersion: "1", updatedAt: "2026-10-05T00:00:00.000Z", entries: [] });
const signature = Buffer.alloc(64, 7).toString("base64");

describe("community registry proxy", () => {
  test("stays disabled until the instance sets a registry URL", () => {
    expect(resolveCommunityRegistryUrl(undefined)).toBeNull();
    expect(resolveCommunityRegistryUrl("  ")).toBeNull();
    expect(() => resolveCommunityRegistryUrl("http://plugins.example/community-registry.json")).toThrow("HTTPS");
    expect(resolveCommunityRegistryUrl("https://plugins.example/community-registry.json")?.href)
      .toBe("https://plugins.example/community-registry.json");
  });

  test("returns the configured bytes and does not follow redirects or caller URLs", async () => {
    const calls = [];
    const app = new Hono();
    registerPluginDistributionRoutes(app);
    const response = await app.request("/api/v1/plugins/community-registry?url=https://evil.example/community-registry.json", {}, {
      EDGE_EVER_COMMUNITY_REGISTRY_URL: "https://plugins.example/community-registry.json",
      publicNetworkFetch: async (url) => {
        calls.push(String(url));
        if (String(url).endsWith(".json.sig")) return new Response(signature);
        return new Response(registryText, { headers: { "content-type": "application/json" } });
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(registryText);
    expect(response.headers.get("x-edgeever-community-registry-signature")).toBe(signature);
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(calls).toEqual([
      "https://plugins.example/community-registry.json",
      "https://plugins.example/community-registry.json.sig",
    ]);

    const missing = await app.request("/api/v1/plugins/community-registry", {}, {});
    expect(missing.status).toBe(404);
  });

  test("rejects a redirect instead of fetching the target", async () => {
    await expect(fetchCommunityRegistryRelease({
      registryUrl: "https://plugins.example/community-registry.json",
      request: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/community-registry.json" } }),
    })).rejects.toThrow("redirects are not followed");
  });
});
