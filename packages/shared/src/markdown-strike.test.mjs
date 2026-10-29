import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { createEdgeEverDocumentExtensions } from "./document-extensions.ts";
import { createEdgeEverMarkdownManager, docToMarkdown, docToText, markdownToDoc } from "./content.ts";
import { createEdgeEverMarkdownMathematics } from "./mathematics-markdown.ts";

const strikeTexts = (doc) => {
  const texts = [];
  const visit = (node) => {
    if (node.marks?.some((mark) => mark.type === "strike")) texts.push(node.text);
    node.content?.forEach(visit);
  };
  visit(doc);
  return texts;
};

describe("double-tilde strikethrough (#698)", () => {
  test.each(["成本 1~2~3 元", "10~20, 30~40", "第一期~第十六期", "~25s and ~30s", "~deleted~", "🙂 1~2~3 中文"])("keeps prose literal: %s", (source) => {
    const doc = markdownToDoc(source);
    expect(docToText(doc)).toBe(source);
    expect(strikeTexts(doc)).toEqual([]);
    expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
  });

  test.each(["~~a~b~~", "~~a ~ b~~", "~~1~2~3~~", "~~删除~~"])("retains double-tilde strike: %s", (source) => {
    const doc = markdownToDoc(source);
    expect(strikeTexts(doc)).toHaveLength(1);
    expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
  });

  test("keeps mixed, escaped, and longer delimiter runs distinct", () => {
    const doc = markdownToDoc("~a~~b~~c~ and \\~x\\~ and inline ~~~literal~~~");
    expect(doc.content[0].content.map((node) => node.text).join("")).toBe("~abc~ and ~x~ and inline ~~~literal~~~");
    expect(strikeTexts(doc)).toEqual(["b"]);
    expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
  });

  test("preserves code, links, math, emphasis, and table cells", () => {
    const source = "**1~2~3** `1~2~3` [10~20](https://example.com/~user) $x~y$\n\n~~~text\n1~2~3\n~~~\n\n| range | strike |\n| --- | --- |\n| 1~2~3 | ~~a~b~~ |";
    const doc = markdownToDoc(source);
    expect(strikeTexts(doc)).toEqual(["a~b"]);
    expect(doc.content[0].content).toContainEqual({ type: "text", text: "1~2~3", marks: [{ type: "code" }] });
    expect(doc.content[0].content).toContainEqual({ type: "inlineMath", attrs: { latex: "x~y" } });
    expect(doc.content[1].content[0].text).toBe("1~2~3");
    expect(strikeTexts(markdownToDoc(docToMarkdown(doc)))).toEqual(["a~b"]);
    const nested = markdownToDoc("~~**1~2~3**~~").content[0].content[0];
    expect(nested.text).toBe("1~2~3");
    expect(nested.marks.map((mark) => mark.type).sort()).toEqual(["bold", "strike"]);
  });

  test("keeps long chunked notes literal", () => {
    const doc = markdownToDoc("成本 1~2~3 元\n\n".repeat(1500).trimEnd());
    expect(doc.content).toHaveLength(1500);
    expect(strikeTexts(doc)).toEqual([]);
  });

  test("isolates repeated managers and editor Markdown commands", () => {
    const options = { mathematics: createEdgeEverMarkdownMathematics(), markdown: true };
    const first = createEdgeEverMarkdownManager(options);
    const second = createEdgeEverMarkdownManager(options);
    expect(first.instance).not.toBe(second.instance);
    const editor = new Editor({ extensions: createEdgeEverDocumentExtensions(options), content: { type: "doc", content: [{ type: "paragraph" }] } });
    try {
      for (const source of ["1~2~3", "~~a~b~~", "~a~~b~~c~"]) {
        editor.commands.setContent(source, { contentType: "markdown" });
        const expected = markdownToDoc(source);
        expect(editor.getJSON()).toEqual(expected);
        expect(first.parse(source)).toEqual(expected);
        expect(second.parse(source)).toEqual(expected);
        expect(markdownToDoc(editor.getMarkdown())).toEqual(expected);
      }
    } finally {
      editor.destroy();
    }
  });
});
