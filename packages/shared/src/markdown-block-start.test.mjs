import { describe, expect, test } from "bun:test";
import { markdownToDoc } from "./content.ts";
import { openBlockSource, splitMarkdownParseChunks } from "./markdown-block-start.ts";

const paragraph = "分析 `code span` 与 [link](https://example.com/a) 以及 $x_1$ 价格 $12.50 的段落，"
  + "附数组写法 arr[0] 与 arr[1] 的说明。";

describe("open block marker scan", () => {
  test("keeps a marker in the current paragraph and ignores the next block", () => {
    expect(openBlockSource("See $$\nx^2\n$$")).toBe("See $$\nx^2\n$$");
    expect(openBlockSource("See\n\n$$\nx^2\n$$").includes("$$")).toBe(false);
    expect(openBlockSource("See\n \n$$\nx^2")).toBe("See");
  });

  test("display math on the next line still interrupts the paragraph", () => {
    const doc = markdownToDoc("See\n$$\nx^2\n$$");
    expect(doc.content.map((node) => node.type)).toEqual(["paragraph", "blockMath"]);
    expect(doc.content[1]).toEqual({ type: "blockMath", attrs: { latex: "x^2" } });
  });

  test("splits plain paragraphs and keeps containers intact", () => {
    expect(splitMarkdownParseChunks("Alpha.\n\nBeta.", 1)).toEqual(["Alpha.", "\nBeta."]);
    expect(splitMarkdownParseChunks("Alpha.\n \nBeta.", 1)).toEqual(["Alpha.", " \nBeta."]);
    expect(splitMarkdownParseChunks("Alpha.\n\n\n\nBeta.", 1)).toEqual(["Alpha.", "\n\n\nBeta."]);
    expect(splitMarkdownParseChunks("See [name][id]\n\n[id]: https://example.com", 1)).toEqual([
      "See [name][id]\n\n[id]: https://example.com",
    ]);
    expect(splitMarkdownParseChunks("- a\n\n- b", 1)).toEqual(["- a\n\n- b"]);
    expect(splitMarkdownParseChunks("> a\n>\n> b", 1)).toEqual(["> a\n>\n> b"]);
    expect(splitMarkdownParseChunks("```js\nconst a = 1;\n\nconst b = 2;\n```", 1)).toEqual([
      "```js\nconst a = 1;\n\nconst b = 2;\n```",
    ]);
    expect(splitMarkdownParseChunks("$$\nx\n\ny\n$$", 1)).toEqual(["$$\nx\n\ny\n$$"]);
    expect(splitMarkdownParseChunks("<details>\n<summary>T</summary>\n\nbody\n\n</details>", 1)).toEqual([
      "<details>\n<summary>T</summary>\n\nbody\n\n</details>",
    ]);
  });

  test("keeps empty paragraphs when a long note is parsed in pieces", () => {
    const count = 500;
    const doc = markdownToDoc("Alpha.\n\n\n\n".repeat(count));
    const empties = (count - 1) * 2 + 3;
    expect(doc.content.filter((node) => node.content?.[0]?.text === "Alpha.")).toHaveLength(count);
    expect(doc.content.filter((node) => node.type === "paragraph" && !node.content?.length)).toHaveLength(empties);
  });

  test("a long loose list stays one list", () => {
    const items = Array.from({ length: 80 }, (_, index) => `- item ${index} ${"word ".repeat(8)}`.trimEnd());
    const doc = markdownToDoc(items.join("\n\n"));
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe("bulletList");
    expect(doc.content[0]?.content).toHaveLength(80);
  });

  test("a fence and display math keep internal blank lines after a long preface", () => {
    const preface = `${paragraph}\n\n`.repeat(80);
    const doc = markdownToDoc(`${preface}\`\`\`js\nconst a = 1;\n\nconst b = 2;\n\`\`\`\n\nAfter.\n\n$$\nx\n\ny\n$$`);
    const code = doc.content.find((node) => node.type === "codeBlock");
    expect(code?.content?.[0]).toMatchObject({ type: "text", text: "const a = 1;\n\nconst b = 2;" });
    expect(doc.content.at(-1)).toEqual({ type: "blockMath", attrs: { latex: "x\n\ny" } });
    expect(doc.content.at(-2)?.content?.[0]).toMatchObject({ type: "text", text: "After." });
  });

  test("parses a long note of short paragraphs in linear time", () => {
    let body = "";
    while (Buffer.byteLength(body) < 256 * 1024) body += `${paragraph}\n\n`;
    body += "$$\nx^2\n$$";

    const started = performance.now();
    const doc = markdownToDoc(body);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(2000);
    expect(doc.content.at(-1)).toEqual({ type: "blockMath", attrs: { latex: "x^2" } });
    expect(doc.content[0]?.content?.some((node) => node.type === "inlineMath")).toBe(true);
    expect(JSON.stringify(doc.content[0])).toContain("12.50");
    expect(doc.content.filter((node) => node.type === "paragraph").length).toBeGreaterThan(1000);
  });
});
