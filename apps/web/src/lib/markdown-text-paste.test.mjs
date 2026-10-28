import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createEdgeEverDocumentExtensions } from "@edgeever/shared";
import { createEdgeEverMathematics } from "@edgeever/shared/mathematics";
import { ensureTestWindowDom } from "./restore-test-global.mjs";
import { isBlockMarkdownText, pasteBlockMarkdown } from "./markdown-text-paste.ts";

const createEditor = (content = { type: "doc", content: [{ type: "paragraph" }] }) => {
  ensureTestWindowDom();
  return new Editor({
    extensions: createEdgeEverDocumentExtensions({ mathematics: createEdgeEverMathematics() }),
    content,
  });
};

const clipboard = (entries) => ({
  types: Object.keys(entries),
  getData: (type) => entries[type] ?? "",
});

// The unmounted Tiptap view throws on fields it does not have, such as
// `input`, so tests pass the state, dispatch and Shift state ProseMirror keeps.
const viewOf = (editor, shiftKey = false, lastKeyCode = 86) => ({
  get state() { return editor.state; },
  dispatch: (transaction) => editor.view.dispatch(transaction),
  input: { shiftKey, lastKeyCode },
});
const paste = (editor, entries, shiftKey, lastKeyCode) =>
  pasteBlockMarkdown(viewOf(editor, shiftKey, lastKeyCode), clipboard(entries));

// Excerpt of the sample attached to issue #660.
const ISSUE_SAMPLE = `# 一级标题

## 2. 行内格式

普通文字中包含 **粗体**、*斜体*、~~删除线~~ 和 \`行内代码\`。

- 第一项
- 第二项，包含 **粗体**
  - 第二层第一项

1. 打开笔记。
2. 粘贴 Markdown 文本。

> 引用

\`\`\`js
const count = 1;
\`\`\`

| 列 A | 列 B |
| --- | --- |
| 1 | 2 |
`;

describe("block Markdown detection", () => {
  test("recognises headings, lists, quotes, fences, tables and rules across lines", () => {
    for (const text of [
      "# Title",
      "intro\n- item",
      "1. one\n2. two",
      "> quote\nmore",
      "```\ncode\n```",
      "| a | b |\n| --- | --- |",
      "above\n---\nbelow",
      "Name | Value\n--- | ---\na | b",
      "Name | Value\n:--- | ---:",
    ]) {
      expect(isBlockMarkdownText(text)).toBe(true);
    }
  });

  test("leaves ordinary text and single inline lines to the existing paste path", () => {
    for (const text of ["", "plain sentence", "first line\nsecond line", "**bold** only", "#hashtag\nnext", "- single item",
      "use a | b to pipe\nthen read the output", "A | B\nnot a delimiter"]) {
      expect(isBlockMarkdownText(text)).toBe(false);
    }
  });
});

describe("pasting plain-text Markdown in rich text", () => {
  test("renders the issue sample as structured content", () => {
    const editor = createEditor();
    expect(paste(editor, { "text/plain": ISSUE_SAMPLE })).toBe(true);
    const types = editor.getJSON().content.map((node) => node.type);
    expect(types[0]).toBe("heading");
    expect(types).toEqual(expect.arrayContaining(["heading", "bulletList", "orderedList", "blockquote", "codeBlock", "table"]));
    const paragraph = editor.getJSON().content.find((node) => node.type === "paragraph" && node.content);
    const marks = paragraph.content.flatMap((child) => child.marks?.map((mark) => mark.type) ?? []);
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic", "strike", "code"]));
    expect(editor.getText()).not.toContain("## ");
    editor.destroy();
  });

  test("inserts at the cursor without replacing the surrounding note", () => {
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)));
    expect(paste(editor, { "text/plain": "## Pasted\n- item" })).toBe(true);
    const json = editor.getJSON().content;
    expect(json[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Before" }] });
    expect(json.map((node) => node.type)).toEqual(["paragraph", "heading", "bulletList", "paragraph"]);
    expect(json.at(-1)).toEqual({ type: "paragraph", content: [{ type: "text", text: "After" }] });
    editor.destroy();
  });

  test("joins leading and trailing paragraphs with the text around the cursor", () => {
    const editor = createEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ab" }] }] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    expect(paste(editor, { "text/plain": "one\n- item\n\ntwo" })).toBe(true);
    expect(editor.getJSON().content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Aone" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }] },
      { type: "paragraph", content: [{ type: "text", text: "twob" }] },
    ]);
    editor.destroy();
  });

  test("keeps rich HTML, code from VS Code and pastes inside code blocks on the default path", () => {
    const editor = createEditor();
    expect(paste(editor, { "text/plain": "# Title\n- item", "text/html": "<h1>Title</h1>" })).toBe(false);
    expect(paste(editor, {
      "text/plain": "/**\n * Adds numbers.\n */",
      "text/html": "<div>…</div>",
      "vscode-editor-data": JSON.stringify({ mode: "typescript" }),
    })).toBe(false);
    expect(paste(editor, { "text/plain": "plain\ntext" })).toBe(false);

    const code = createEditor({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }] });
    code.view.dispatch(code.state.tr.setSelection(TextSelection.create(code.state.doc, 2)));
    expect(paste(code, { "text/plain": "# Title\n- item" })).toBe(false);
    editor.destroy();
    code.destroy();
  });

  test("converts Markdown copied from VS Code", () => {
    const editor = createEditor();
    expect(paste(editor, {
      "text/plain": "# Notes\n- one\n- two",
      "text/html": "<div style=\"font-family: Menlo\">…</div>",
      "vscode-editor-data": JSON.stringify({ mode: "markdown" }),
    })).toBe(true);
    expect(editor.getJSON().content.map((node) => node.type)).toEqual(["heading", "bulletList"]);
    editor.destroy();
  });

  test("keeps escaped Markdown literal instead of running paste rules again", () => {
    const editor = createEditor();
    expect(paste(editor, { "text/plain": "# Title\n\n\\*not italic\\*\n\n\\`not code\\`" })).toBe(true);
    const json = editor.getJSON().content;
    expect(json.map((node) => node.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(json[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "*not italic*" }] });
    expect(json[2]).toEqual({ type: "paragraph", content: [{ type: "text", text: "`not code`" }] });
    editor.destroy();
  });

  test("leaves paste as plain text to the default path", () => {
    const editor = createEditor();
    expect(paste(editor, { "text/plain": "# title\n- item" }, true)).toBe(false);
    expect(paste(editor, {
      "text/plain": "# title\n- item",
      "text/html": "<div>…</div>",
      "vscode-editor-data": JSON.stringify({ mode: "markdown" }),
    }, true)).toBe(false);
    expect(paste(editor, { "text/plain": "# title\n- item" })).toBe(true);
    editor.destroy();
  });

  test("renders a table written without outer pipes", () => {
    const editor = createEditor();
    expect(paste(editor, { "text/plain": "Name | Value\n--- | ---\na | b" })).toBe(true);
    expect(editor.getJSON().content.map((node) => node.type)).toContain("table");
    editor.destroy();
  });

  test("converts Shift+Insert pastes for plain text and VS Code Markdown", () => {
    for (const entries of [
      { "text/plain": "# title\n- item" },
      {
        "text/plain": "# title\n- item",
        "text/html": "<div># title</div>",
        "vscode-editor-data": JSON.stringify({ mode: "markdown" }),
      },
    ]) {
      const editor = createEditor();
      try {
        expect(paste(editor, entries, true, 45)).toBe(true);
        expect(editor.getJSON().content.map((node) => node.type)).toEqual(["heading", "bulletList"]);
        expect(editor.getText()).not.toContain("# title");
      } finally {
        editor.destroy();
      }
    }
  });
});
