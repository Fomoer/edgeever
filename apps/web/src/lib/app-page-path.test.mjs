import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  getAppAssetPath,
  getAppEntryPath,
  getAppPagePath,
  getMessageTargetOrigin,
  getPersistentDataScopeOrigin,
  resolveAppAssetUrl,
} from "./app-page-path.ts";

describe("app page paths", () => {
  test("uses root paths for web builds", () => {
    expect(getAppAssetPath("extensions/registry.json", "/")).toBe("/extensions/registry.json");
    expect(getAppPagePath("note-print.html", "/")).toBe("/note-print.html");
    expect(getAppPagePath("/mobile-edit.html", "/")).toBe("/mobile-edit.html");
    expect(getAppEntryPath("/")).toBe("/");
  });

  test("uses sibling files for packaged desktop builds", () => {
    expect(getAppAssetPath("/extensions/registry.json", "./")).toBe("./extensions/registry.json");
    expect(getAppPagePath("note-print.html", "./")).toBe("./note-print.html");
    expect(getAppPagePath("/mobile-edit.html", "./")).toBe("./mobile-edit.html");
    expect(getAppEntryPath("./")).toBe("./index.html");
  });

  test("resolves bundled assets against the correct web or desktop base", () => {
    expect(resolveAppAssetUrl("/extensions/registry.json", "/", "https://notes.example.com/plugins")).toBe(
      "https://notes.example.com/extensions/registry.json",
    );
    expect(resolveAppAssetUrl("/extensions/registry.json", "./", "file:///Applications/EdgeEver.app/Contents/Resources/web/index.html")).toBe(
      "file:///Applications/EdgeEver.app/Contents/Resources/web/extensions/registry.json",
    );
    expect(resolveAppAssetUrl("https://cdn.example.com/registry.json", "./", "file:///app/index.html")).toBe(
      "https://cdn.example.com/registry.json",
    );
  });

  test("forbids root-relative bundled asset literals in application source", async () => {
    const sourceDirectory = fileURLToPath(new URL("../", import.meta.url));
    const sourceGlob = new Bun.Glob("**/*.{ts,tsx}");
    const forbidden = /["'`]\/(?:extensions|assets|icons)\/|(?:src|href)=["']\/(?:favicon|apple-touch-icon|manifest\.webmanifest)/;
    const violations = [];
    for (const relativePath of sourceGlob.scanSync({ cwd: sourceDirectory })) {
      if (relativePath.includes(".test.")) continue;
      const source = await Bun.file(`${sourceDirectory}/${relativePath}`).text();
      if (forbidden.test(source)) violations.push(relativePath);
    }
    expect(violations).toEqual([]);
  });

  test("uses a wildcard target only for opaque file origins", () => {
    expect(getMessageTargetOrigin("https://notes.example.com")).toBe("https://notes.example.com");
    expect(getMessageTargetOrigin("null")).toBe("*");
  });

  test("keeps the existing packaged desktop data scope after leaving file URLs", () => {
    expect(getPersistentDataScopeOrigin("null")).toBe("null");
    expect(getPersistentDataScopeOrigin("edgeever-app://app")).toBe("null");
    expect(getPersistentDataScopeOrigin("https://notes.example.com")).toBe("https://notes.example.com");
  });
});
