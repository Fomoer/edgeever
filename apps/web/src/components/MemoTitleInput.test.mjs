import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const componentSource = readFileSync(new URL("./MemoTitleInput.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("./EditorPane.tsx", import.meta.url), "utf8");
const diagramSource = readFileSync(new URL("./DiagramEditorPane.tsx", import.meta.url), "utf8");

describe("shared memo title input", () => {
  test("owns the title appearance and input constraints", () => {
    expect(componentSource).toContain("text-xl font-bold");
    expect(componentSource).toContain("sm:text-2xl");
    expect(componentSource).not.toContain("lg:text-[26px]");
    expect(componentSource).toContain("focus-visible:bg-muted");
    expect(componentSource).toContain("maxLength={160}");
    expect(componentSource).toContain("readOnly={readOnly}");
  });

  test("is reused by text and diagram notes", () => {
    expect(editorSource).toContain('import { MemoTitleInput } from "@/components/MemoTitleInput"');
    expect(diagramSource).toContain('import { MemoTitleInput } from "@/components/MemoTitleInput"');
    expect(editorSource).toContain("<MemoTitleInput");
    expect(diagramSource).toContain("<MemoTitleInput");
  });
});
