import { describe, expect, test } from "bun:test";
import { docToMarkdown, markdownToDoc } from "@edgeever/shared";
import { NEW_IMAGE_WIDTH_PERCENT } from "@edgeever/shared/image-display";

describe("shared Markdown conversion", () => {
  test("parses adjacent headings, lists, quotes, and inline formatting into TipTap nodes", () => {
    const doc = markdownToDoc(`## 1. 公司主体信息 (Organization Info)
* **公司中文全称**：郑州市冰硅网络科技有限公司
* **公司英文名称**：Example Co., Ltd.
## 2. 联系方式 (Domain & Contact)
* **项目官方网站**：[EdgeEver](https://www.edgeever.org)
> [!WARNING]
> 请勿绑定其他账号。`);

    expect(doc.content.map((node) => node.type)).toEqual([
      "heading",
      "bulletList",
      "heading",
      "bulletList",
      "blockquote",
    ]);

    const firstList = doc.content[1];
    const firstText = firstList.content?.[0]?.content?.[0]?.content?.[0];
    expect(firstText).toEqual({
      type: "text",
      text: "公司中文全称",
      marks: [{ type: "bold" }],
    });

    const secondList = doc.content[3];
    const linkText = secondList.content?.[0]?.content?.[0]?.content?.[2];
    expect(linkText).toMatchObject({
      type: "text",
      text: "EdgeEver",
      marks: [{ type: "link", attrs: { href: "https://www.edgeever.org" } }],
    });
  });

  test("preserves heading levels 1 through 6", () => {
    const markdown = `# H1

## H2

### H3

#### H4

##### H5

###### H6`;

    const doc = markdownToDoc(markdown);
    expect(doc.content.map((node) => [node.type, node.attrs?.level])).toEqual([
      ["heading", 1],
      ["heading", 2],
      ["heading", 3],
      ["heading", 4],
      ["heading", 5],
      ["heading", 6],
    ]);
    expect(docToMarkdown(doc)).toBe(markdown);
  });

  test("serializes TipTap marks and block nodes back to Markdown", () => {
    const markdown = `# 标题

- **粗体**与*斜体*
- [链接](https://example.com)

> 引用

\`code\` 和 ~~删除~~`;

    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  test("preserves fenced code blocks and standalone images", () => {
    const markdown = `\`\`\`ts
const answer = 42;
\`\`\`

![示例](/api/v1/resources/res_1/blob "标题")`;

    const doc = markdownToDoc(markdown);
    expect(doc.content.map((node) => node.type)).toEqual(["codeBlock", "image"]);
    expect(doc.content[1]?.attrs?.width).toBe(NEW_IMAGE_WIDTH_PERCENT);
    expect(docToMarkdown(doc)).toBe(markdown);
  });

  test("groups consecutive images into one gallery and keeps a single image alone", () => {
    const markdown = "正文\n\n![一](/a.png)\n\n![二](/b.png)\n\n![三](/c.png)\n\n来源";
    const doc = markdownToDoc(markdown);
    expect(doc.content.map((node) => node.type)).toEqual(["paragraph", "edgeeverImageGallery", "paragraph"]);
    expect(doc.content[1]?.attrs).toEqual({ layout: "auto" });
    expect(doc.content[1]?.content?.map((node) => node.attrs?.src)).toEqual(["/a.png", "/b.png", "/c.png"]);
    expect(docToMarkdown(doc)).toBe(markdown);
  });

  test("parses and serializes inline and block LaTeX", () => {
    const markdown = `Euler: $e^{i\\pi}+1=0$.

$$
\\frac{a}{b}
$$`;

    const doc = markdownToDoc(markdown);
    expect(doc.content[0]?.content?.[1]).toMatchObject({
      type: "inlineMath",
      attrs: { latex: "e^{i\\pi}+1=0" },
    });
    expect(doc.content[1]).toMatchObject({
      type: "blockMath",
      attrs: { latex: "\\frac{a}{b}" },
    });
    expect(docToMarkdown(doc)).toBe(markdown);
  });
});
