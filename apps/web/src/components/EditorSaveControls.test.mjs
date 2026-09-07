import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(new URL("./EditorPane.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./WorkspaceApp.tsx", import.meta.url), "utf8");
const helperSource = readFileSync(new URL("../lib/app-helpers.ts", import.meta.url), "utf8");

describe("editor save controls", () => {
  test("autosaves without a persistent toolbar save button", () => {
    expect(editorSource).toContain("EDITOR_LOCAL_SAVE_DELAY_MS");
    expect(editorSource).toContain("const timer = window.setTimeout(() => {");
    expect(editorSource).toContain("mutateSave();");
    expect(editorSource).not.toContain('<Save className="h-4 w-4" />');
    expect(editorSource).not.toContain('aria-label={t("editor.save")}');
  });

  test("keeps Ctrl or Command S as the explicit save and sync action", () => {
    expect(helperSource).toContain('saveAndSync: { key: "s", ctrlOrMeta: true');
    expect(workspaceSource).toContain('action === "saveAndSync"');
    expect(workspaceSource).toContain("setNoteSaveAndSyncToken((value) => value + 1)");
    expect(editorSource).toContain("saveAndSyncEditor({");
  });
});
