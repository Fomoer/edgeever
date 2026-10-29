import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import {
  createEdgeEverMarkdownManager,
  docToMarkdown,
  IMAGE_GALLERY_NODE_TYPE,
  markdownToDoc,
  MERGE_DIVIDER_MARKDOWN_MARKER,
  MERGE_DIVIDER_NODE_TYPE,
  MergeDivider as SharedMergeDivider,
} from "@edgeever/shared";
import { createEdgeEverMathematics } from "@edgeever/shared/mathematics";
import { createIosImageGallery, ImageGallery, MergeDivider } from "./document-nodes.ts";

const galleryDoc = {
  type: "doc",
  content: [{
    type: IMAGE_GALLERY_NODE_TYPE,
    attrs: { layout: "2" },
    content: [
      { type: "image", attrs: { src: "/one.png", alt: "one" } },
      { type: "image", attrs: { src: "/two.png", alt: "two" } },
    ],
  }],
};

const iosMarkdownManager = createEdgeEverMarkdownManager({
  mathematics: createEdgeEverMathematics(),
  starterKit: { codeBlock: false, link: false },
  gallery: createIosImageGallery(() => "en-US"),
  pdf: false,
  file: false,
  pluginEmbed: false,
});

describe("iOS document nodes share the web schema", () => {
  test("keeps literal ranges and double-tilde strike consistent with the shared codec (#698)", () => {
    for (const source of ["成本 1~2~3 元", "10~20, 30~40", "~~a~b~~", "~a~~b~~c~"]) {
      expect(iosMarkdownManager.parse(source)).toEqual(markdownToDoc(source));
    }
  });

  test("uses the shared MergeDivider implementation", () => {
    expect(MergeDivider).toBe(SharedMergeDivider);
  });

  test("native ImageGallery.extend keeps the shared node name and gallery layout", () => {
    const iosGallery = createIosImageGallery(() => "zh-CN");
    expect(iosGallery.name).toBe(IMAGE_GALLERY_NODE_TYPE);

    const sharedSchema = getSchema([StarterKit, Image, MergeDivider, ImageGallery]);
    const iosSchema = getSchema([StarterKit, Image, MergeDivider, iosGallery]);
    expect(iosSchema.nodeFromJSON(galleryDoc).toJSON()).toEqual(sharedSchema.nodeFromJSON(galleryDoc).toJSON());
    expect(iosSchema.nodeFromJSON(galleryDoc).firstChild.attrs.layout).toBe("2");
  });

  test("parses merge-divider Markdown the same as the web codec", () => {
    const markdown = `alpha\n\n${MERGE_DIVIDER_MARKDOWN_MARKER}\n\n---\n\nbeta`;
    const webDoc = markdownToDoc(markdown);
    const iosDoc = iosMarkdownManager.parse(markdown);

    expect(webDoc.content.map((node) => node.type)).toEqual([
      "paragraph",
      MERGE_DIVIDER_NODE_TYPE,
      "paragraph",
    ]);
    expect(iosDoc.content.map((node) => node.type)).toEqual(webDoc.content.map((node) => node.type));
    expect(docToMarkdown(iosDoc)).toBe(docToMarkdown(webDoc));
  });

  test("round-trips gallery JSON layout and matches the web Markdown projection", () => {
    const iosDoc = iosMarkdownManager.parse(iosMarkdownManager.serialize(galleryDoc));
    const persisted = getSchema([StarterKit, Image, MergeDivider, createIosImageGallery(() => "en-US")])
      .nodeFromJSON(galleryDoc)
      .toJSON();

    expect(docToMarkdown(galleryDoc)).toBe("![one](/one.png)\n\n![two](/two.png)");
    expect(iosMarkdownManager.serialize(galleryDoc).trim()).toBe(docToMarkdown(galleryDoc));
    expect(iosDoc.content.every((node) => node.type === "image" || node.type === "paragraph")).toBe(true);
    expect(persisted.content[0]).toMatchObject({
      type: IMAGE_GALLERY_NODE_TYPE,
      attrs: { layout: "2" },
    });
    expect(persisted.content[0].content.map((node) => node.attrs.src)).toEqual(["/one.png", "/two.png"]);
  });

  test("parses inline and block math the same as the web codec", () => {
    const markdown = "Euler: $e^{i\\pi}+1=0$.\n\n$$\n\\frac{a}{b}\n$$";
    const webDoc = markdownToDoc(markdown);
    const iosDoc = iosMarkdownManager.parse(markdown);

    expect(webDoc.content[0]?.content?.[1]).toMatchObject({
      type: "inlineMath",
      attrs: { latex: "e^{i\\pi}+1=0" },
    });
    expect(webDoc.content[1]).toMatchObject({
      type: "blockMath",
      attrs: { latex: "\\frac{a}{b}" },
    });
    expect(iosDoc.content.map((node) => node.type)).toEqual(webDoc.content.map((node) => node.type));
    expect(iosDoc.content[0]?.content?.[1]).toMatchObject(webDoc.content[0]?.content?.[1]);
    expect(iosDoc.content[1]).toMatchObject(webDoc.content[1]);
    expect(docToMarkdown(iosDoc)).toBe(docToMarkdown(webDoc));
  });

  test("keeps currency dollar pairs as literal text like the web codec", () => {
    const markdown = "Price: $100$";
    const webDoc = markdownToDoc(markdown);
    const iosDoc = iosMarkdownManager.parse(markdown);

    expect(webDoc.content[0]?.content?.some((node) => node.type === "inlineMath")).toBe(false);
    expect(iosDoc.content[0]?.content?.some((node) => node.type === "inlineMath")).toBe(false);
    expect(docToMarkdown(iosDoc)).toBe(docToMarkdown(webDoc));
  });
});
