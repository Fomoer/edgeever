import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FileAttachment, PdfAttachment } from "@edgeever/shared";
import { ensureTestWindowDom } from "../../lib/restore-test-global.mjs";
import { findAttachmentRange, insertTranscriptAfterAttachment, removeAttachmentAt, renameAttachmentAt } from "./attachment-editor-range.ts";

const videoUrl = "edgeever-resource://resource/res_video";
const videoApiUrl = "/api/v1/resources/res_video/blob";
const pdfUrl = "/api/v1/resources/res_pdf/blob";
const otherUrl = "/api/v1/resources/res_other/blob";

const fileNode = (url, filename, mimeType) => ({
  type: "edgeeverFileAttachment",
  attrs: {
    url,
    label: `附件：${filename}`,
    filename,
    mimeType,
    byteSize: 4096,
    displayMode: "inline",
  },
});

const pdfNode = (url, filename) => ({
  type: "edgeeverPdfAttachment",
  attrs: {
    url,
    label: `附件：${filename}`,
    filename,
    mimeType: "application/pdf",
    byteSize: 8192,
    displayMode: "compact",
  },
});

const paragraph = (...content) => ({ type: "paragraph", content });

const makeEditor = (content) => {
  ensureTestWindowDom();
  return new Editor({
    extensions: [StarterKit, FileAttachment, PdfAttachment],
    content: { type: "doc", content },
  });
};

describe("attachment editor range", () => {
  test("removes a video file-attachment node whose hover URL is the API blob path", () => {
    const editor = makeEditor([
      paragraph(fileNode(videoUrl, "clip.mp4", "video/mp4")),
      paragraph({ type: "text", text: "keep" }),
    ]);
    const target = { url: videoApiUrl, resourceId: "res_video" };

    expect(findAttachmentRange(editor, target)?.kind).toBe("node");
    expect(removeAttachmentAt(editor, target)).toBe(true);
    expect(editor.getJSON().content).toEqual([
      paragraph({ type: "text", text: "keep" }),
    ]);
    editor.destroy();
  });

  test("removes a standalone PDF node and leaves a valid empty document", () => {
    const editor = makeEditor([paragraph(pdfNode(pdfUrl, "report.pdf"))]);
    expect(removeAttachmentAt(editor, { url: pdfUrl, resourceId: "res_pdf" })).toBe(true);
    expect(editor.getJSON().content).toEqual([{ type: "paragraph" }]);
    editor.destroy();
  });

  test("still removes a legacy attachment link and leaves surrounding copy", () => {
    const editor = makeEditor([
      paragraph(
        { type: "text", text: "before " },
        {
          type: "text",
          text: "附件：notes.zip",
          marks: [{ type: "link", attrs: { href: otherUrl } }],
        },
        { type: "text", text: " after" },
      ),
    ]);
    expect(removeAttachmentAt(editor, { url: otherUrl, resourceId: "res_other" })).toBe(true);
    expect(editor.getJSON().content[0].content.map((node) => node.text).join("")).toBe("before  after");
    editor.destroy();
  });

  test("renames file-attachment attrs instead of replacing the node with text", () => {
    const editor = makeEditor([paragraph(fileNode(videoApiUrl, "clip.mp4", "video/mp4"))]);
    expect(renameAttachmentAt(
      editor,
      { url: videoUrl, resourceId: "res_video" },
      "final.mp4",
      "附件：final.mp4",
    )).toBe(true);
    expect(editor.getJSON().content[0].content[0]).toMatchObject({
      type: "edgeeverFileAttachment",
      attrs: {
        url: videoApiUrl,
        filename: "final.mp4",
        label: "附件：final.mp4",
        mimeType: "video/mp4",
      },
    });
    editor.destroy();
  });

  test("does not touch an unrelated attachment", () => {
    const editor = makeEditor([
      paragraph(fileNode(videoUrl, "clip.mp4", "video/mp4")),
      paragraph(pdfNode(pdfUrl, "report.pdf")),
    ]);
    expect(removeAttachmentAt(editor, { url: otherUrl, resourceId: "res_other" })).toBe(false);
    expect(editor.getJSON().content).toHaveLength(2);
    editor.destroy();
  });

  test("inserts a transcript directly below its attachment without moving surrounding note text", () => {
    const editor = makeEditor([
      paragraph({ type: "text", text: "intro" }),
      paragraph(fileNode(videoUrl, "clip.mp4", "video/mp4")),
      paragraph({ type: "text", text: "following content" }),
    ]);

    expect(insertTranscriptAfterAttachment(
      editor,
      { url: videoApiUrl, resourceId: "res_video" },
      "First line\nSecond line",
      "Transcript",
    )).toBe(true);
    expect(editor.getJSON().content.map((node) => node.type)).toEqual([
      "paragraph", "paragraph", "heading", "paragraph", "paragraph", "paragraph",
    ]);
    expect(editor.getJSON().content.slice(2, 5).map((node) => node.content?.[0]?.text)).toEqual([
      "Transcript", "First line", "Second line",
    ]);
    expect(editor.getJSON().content[5].content[0].text).toBe("following content");
    editor.destroy();
  });

  test("does not insert a transcript if the attachment was removed", () => {
    const editor = makeEditor([paragraph({ type: "text", text: "keep" })]);
    expect(insertTranscriptAfterAttachment(editor, { url: videoApiUrl, resourceId: "res_video" }, "text", "Transcript")).toBe(false);
    expect(editor.getJSON().content).toEqual([paragraph({ type: "text", text: "keep" })]);
    editor.destroy();
  });
});
