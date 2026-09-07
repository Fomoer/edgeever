import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const headerActionsSource = readFileSync(new URL("./MemoEditorHeaderActions.tsx", import.meta.url), "utf8");
const settingsPaneSource = readFileSync(new URL("./SettingsPane.tsx", import.meta.url), "utf8");

describe("system information access", () => {
  test("keeps a compact-workspace entry in the editor overflow menu", () => {
    expect(headerActionsSource).toMatch(
      /<DropdownMenuItem[\s\S]*?min-\[1600px\]:hidden[\s\S]*?handleSystemInfoOpenChange\(true\)[\s\S]*?systemInfo\.title[\s\S]*?<\/DropdownMenuItem>/,
    );
  });

  test("does not duplicate the entry in desktop settings", () => {
    const desktopSettings = settingsPaneSource.match(/桌面端布局：双栏[\s\S]*?移动端布局/)?.[0];

    expect(desktopSettings).not.toContain("setSystemInfoOpen(true)");
    expect(desktopSettings).not.toContain('t("systemInfo.title")');
  });

  test("keeps the entry in mobile settings", () => {
    const mobileSettings = settingsPaneSource.match(/移动端布局[\s\S]*?<SystemInfoDialog/)?.[0];

    expect(mobileSettings).toContain("setSystemInfoOpen(true)");
    expect(mobileSettings).toContain('t("systemInfo.title")');
  });
});
