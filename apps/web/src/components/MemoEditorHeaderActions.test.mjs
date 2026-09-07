import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const actionsSource = readFileSync(new URL("./MemoEditorHeaderActions.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("./EditorPane.tsx", import.meta.url), "utf8");
const diagramSource = readFileSync(new URL("./DiagramEditorPane.tsx", import.meta.url), "utf8");
const densitySource = readFileSync(new URL("./MemoEditorChromeDensity.ts", import.meta.url), "utf8");
const editorToolbarSource = readFileSync(new URL("./EditorToolbar.tsx", import.meta.url), "utf8");
const diagramToolbarSource = readFileSync(new URL("./DiagramToolbar.tsx", import.meta.url), "utf8");
const toolbarChromeSource = readFileSync(new URL("./MemoEditorToolbarChrome.tsx", import.meta.url), "utf8");
const metadataRowSource = readFileSync(new URL("./MemoEditorMetadataRow.tsx", import.meta.url), "utf8");
const topRowLeadingSource = readFileSync(new URL("./MemoEditorTopRowLeading.tsx", import.meta.url), "utf8");

describe("shared memo editor header actions", () => {
  test("owns every action shared by text and diagram notes", () => {
    expect(actionsSource).toContain("<Search");
    expect(actionsSource).toContain("<GitHubRepositoryLink");
    expect(actionsSource).toContain("<SystemInfoDialog");
    expect(actionsSource).toContain("{companionDiscoveryHub}");
    expect(actionsSource).toContain("<ExecutionCenterButton");
    expect(actionsSource).toContain("<ThemeToggle />");
    expect(actionsSource).toContain("<MoreHorizontal");
  });

  test("is reused by both editors while text-only actions remain explicit slots", () => {
    expect(editorSource).toContain("<MemoEditorHeaderActions");
    expect(diagramSource).toContain("<MemoEditorHeaderActions");
    expect(editorSource).toContain("textNoteActions={(\n");
    expect(editorSource).toContain("textNoteMenuItems=");
    expect(diagramSource).not.toContain("textNoteActions=");
    expect(diagramSource).not.toContain("<WeChatIcon");
  });

  test("shares notebook and tag metadata controls across text and diagram notes", () => {
    expect(editorSource).toContain("<MemoEditorMetadataRow");
    expect(diagramSource).toContain("<MemoEditorMetadataRow");
    expect(metadataRowSource).toContain("<EditorTagPicker");
    expect(metadataRowSource).toContain("<MobileNotebookSelectSheet");
    expect(metadataRowSource).toContain("<Select");
    expect(topRowLeadingSource).toContain("<Maximize2");
    expect(topRowLeadingSource).toContain("onToggleDesktopFocusMode");
    expect(editorSource).toContain("<MemoEditorTopRowLeading");
    expect(diagramSource).toContain("<MemoEditorTopRowLeading");
    expect(editorSource).not.toContain("<EditorTagPicker");
    expect(diagramSource).not.toContain("<EditorTagPicker");
    expect(editorSource).not.toContain("<Maximize2");
    expect(diagramSource).not.toContain("<Maximize2");
    expect(metadataRowSource).not.toContain("<Maximize2");
  });

  test("leaves sequential note navigation to the memo list", () => {
    expect(editorSource).not.toContain("onOpenPreviousMemo");
    expect(editorSource).not.toContain("onOpenNextMemo");
    expect(diagramSource).not.toContain("onOpenPreviousMemo");
    expect(diagramSource).not.toContain("onOpenNextMemo");
  });

  test("applies one shared compact density standard to both editors", () => {
    expect(editorSource).toContain("MEMO_EDITOR_TOP_ROW_CLASS_NAME");
    expect(diagramSource).toContain("MEMO_EDITOR_TOP_ROW_CLASS_NAME");
    expect(editorToolbarSource).toContain("<MemoEditorToolbarRow");
    expect(diagramToolbarSource).toContain("<MemoEditorToolbarRow");
    expect(editorToolbarSource).toContain("<MemoEditorToolbarDivider");
    expect(diagramToolbarSource).toContain("<MemoEditorToolbarDivider");
    expect(toolbarChromeSource).toContain("MEMO_EDITOR_TOOLBAR_PADDING_CLASS_NAME");
    expect(densitySource).toContain("sm:min-h-9 sm:px-4 sm:py-0.5");
    expect(densitySource).toContain("sm:px-4 sm:py-0.5");
    expect(densitySource).not.toContain("sm:px-7");
    expect(densitySource).toContain("lg:space-y-0 lg:py-0");
    expect(densitySource).not.toContain("min-[1600px]:flex");
  });
});
