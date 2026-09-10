import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./DesktopSyncIssuesDialog.tsx", import.meta.url), "utf8");

describe("desktop sync issue reporting", () => {
  test("collects connected-instance and desktop runtime diagnostics before opening GitHub", () => {
    expect(source).toContain('queryKey: ["instance-health", instanceUrl]');
    expect(source).toContain('queryKey: ["instance-release", instanceUrl]');
    expect(source).toContain('queryKey: ["system-info-client-runtime"]');
    expect(source).toContain("queryFn: getClientRuntimeDiagnostics");
    expect(source).toContain("clientRuntime: clientRuntimeQuery.data");
    expect(source).toContain("instance: healthQuery.data?.health");
    expect(source).toContain("instanceVersion: releaseQuery.data?.version");
    expect(source).toContain("&& !collectingSystemInfo");
    expect(source).toContain("asChild={canReportIssue}");
  });
});
