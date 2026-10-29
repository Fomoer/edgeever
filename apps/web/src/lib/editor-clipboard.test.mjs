import { expect, test } from "bun:test";
import { getTextBetween } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { AllSelection, EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection, tableNodes } from "@tiptap/pm/tables";
import { editorClipboardTextSerializer, serializeEditorTextRange } from "./editor-clipboard.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    blockquote: { content: "block+", group: "block" },
    bulletList: { content: "listItem+", group: "block" },
    listItem: { content: "paragraph block*" },
    codeBlock: { content: "text*", group: "block", code: true },
    hardBreak: { inline: true, group: "inline", toText: () => "\n" },
    ...tableNodes({ tableGroup: "block", cellContent: "block+" }),
  },
});
const node = (type, content = []) => schema.node(type, null, content);
const p = (text) => node("paragraph", text ? [schema.text(text)] : []);
const item = (text) => node("listItem", [p(text)]);
const copy = (doc, selection = new AllSelection(doc)) => editorClipboardTextSerializer(
  selection.content(), { state: EditorState.create({ doc, selection }) },
);

test("quoted lists reproduce accumulated default whitespace and copy with one newline per text block", () => {
  const doc = node("doc", [node("blockquote", [
    p("4 个月的数据："),
    node("bulletList", [item("GitHub 突破 3,000 Star"), item("全服第一")]),
    p("鸣谢背后的神仙战友："),
    node("bulletList", [item("感谢小伙伴"), item("感谢波兰和德国老哥")]),
  ])]);
  expect(getTextBetween(doc, { from: 0, to: doc.content.size })).toContain("\n\n\n\n");
  expect(copy(doc)).toBe("4 个月的数据：\nGitHub 突破 3,000 Star\n全服第一\n鸣谢背后的神仙战友：\n感谢小伙伴\n感谢波兰和德国老哥");
});

test("nested lists and quotes do not create leading or repeated separators", () => {
  const doc = node("doc", [node("blockquote", [node("bulletList", [
    node("listItem", [p("Parent"), node("bulletList", [item("Child")])]), item("Next"),
  ])])]);
  expect(copy(doc)).toBe("Parent\nChild\nNext");
});

test("intentional empty paragraphs, hard breaks and code whitespace survive", () => {
  const doc = node("doc", [p("First"), p(""),
    node("paragraph", [schema.text("A"), node("hardBreak"), schema.text("B")]),
    node("codeBlock", [schema.text("  code\n\n    indented")]), p(""),
  ]);
  expect(copy(doc)).toBe("First\n\nA\nB\n  code\n\n    indented\n");
});

test("partial selections copy only selected text, including across paragraphs", () => {
  const doc = node("doc", [p("Alpha"), p("Beta")]);
  expect(copy(doc, TextSelection.create(doc, 3, 10))).toBe("pha\nBe");
  expect(serializeEditorTextRange(doc, 2, 4)).toBe("lp");
});

test("table cell selections omit unselected cells and keep document order", () => {
  const cell = (text) => node("table_cell", [p(text)]);
  const doc = node("doc", [node("table", [
    node("table_row", [cell("A"), cell("skip1")]),
    node("table_row", [cell("B"), cell("skip2")]),
  ])]);
  const positions = [];
  doc.descendants((n, pos) => { if (n.type.name === "table_cell") positions.push(pos); });
  expect(copy(doc, CellSelection.create(doc, positions[2], positions[0]))).toBe("A\nB");
});
