import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./SystemInfoPanel.tsx", import.meta.url), "utf8");

describe("system information client/instance version hint", () => {
  test("warns in system info when the client is ahead of the connected instance", () => {
    expect(source).toContain("isClientAheadOfInstance");
    expect(source).toContain("clientRuntimeQuery.data?.appVersion ?? __EDGEEVER_APP_VERSION__");
    expect(source).toContain("release?.version");
    expect(source).toContain("clientAheadOfInstanceByPlatform");
    expect(source).toContain("resolveDeploymentPlatform(healthQuery.data?.health?.runtime)");
    expect(source).toContain("clientAheadOfInstance");
  });
});
