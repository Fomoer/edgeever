import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("selected Markdown ZIP export UI", () => {
  test("exposes Markdown ZIP export in desktop and mobile bulk actions", () => {
    const memoListSource = readSource("../apps/web/src/components/MemoListPane.tsx");
    const mobileSheetSource = readSource("../apps/web/src/components/MemoListMobileSheets.tsx");
    const workspaceSource = readSource("../apps/web/src/components/WorkspaceApp.tsx");

    expect(memoListSource).toContain('t("workspace.selection.export")');
    expect(memoListSource).toContain("onExportSelectedMemos()");
    expect(mobileSheetSource).toContain('t("mobileSheets.exportMarkdown")');
    expect(mobileSheetSource).toContain("onClick={onExport}");
    expect(workspaceSource).toContain("handleExportSelectedMemos");
    expect(workspaceSource).toContain("exportSelectedMemosAsMarkdownZip");
    expect(mobileSheetSource).not.toContain("export-html");
    expect(mobileSheetSource).not.toContain("export-pdf");
  });

  test("shows the desktop bulk action card even when a diagram note is open", () => {
    const workspaceSource = readSource("../apps/web/src/components/WorkspaceApp.tsx");
    const selectionOverride = workspaceSource.indexOf("memoSelectionModeActive ? (");
    const diagramPane = workspaceSource.indexOf("<DiagramEditorPane");

    expect(selectionOverride).toBeGreaterThan(0);
    expect(diagramPane).toBeGreaterThan(selectionOverride);
    expect(workspaceSource.slice(selectionOverride, diagramPane)).toContain("{memoSelectionActionBar}");
  });
});
