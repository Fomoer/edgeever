import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./PluginManagerCard.tsx", import.meta.url), "utf8");

describe("plugin manager card layout", () => {
  test("uses one responsive grid for marketplace and installed extension cards", () => {
    expect(source).toContain('const PLUGIN_CARD_GRID_CLASS_NAME = "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3";');
    expect(source.match(/className=\{PLUGIN_CARD_GRID_CLASS_NAME\}/g)).toHaveLength(2);
    expect(source).not.toContain("md:grid-cols-2");
  });

  test("uses GitHub icon links for marketplace and installed extension repositories", () => {
    expect(source.match(/<GitHubRepositoryLink/g)).toHaveLength(2);
    expect(source.match(/showTooltip=\{false\}/g)).toHaveLength(2);
    expect(source).toContain("href={entry.repositoryUrl}");
    expect(source).toContain("href={extension.source.repositoryUrl}");
  });

  test("shows update checks when marketplace plugins exist without installed extensions", () => {
    expect(source).toContain("snapshot.extensions.length > 0 || (marketplaceQuery.data?.entries.length ?? 0) > 0");
    expect(source).not.toContain("{snapshot.extensions.length > 0 ? (\n              <Button");
  });
});
