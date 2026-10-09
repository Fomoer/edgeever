import { afterEach, describe, expect, test } from "bun:test";
import {
  DocxPreviewTooLargeError,
  isPreviewableDocx,
  loadDocxPreviewBytes,
  MAX_INLINE_DOCX_BYTES,
} from "./docx-preview-source.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("DOCX preview source", () => {
  test("only offers inline preview for note-owned DOCX resources", () => {
    expect(isPreviewableDocx("Report.DOCX", "/api/v1/resources/res_1/blob")).toBe(true);
    expect(isPreviewableDocx("draft.docx", "edgeever-staged://stage_1")).toBe(true);
    expect(isPreviewableDocx("old.doc", "/api/v1/resources/res_1/blob")).toBe(false);
    expect(isPreviewableDocx("report.docx", "https://other.example/report.docx")).toBe(false);
  });

  test("reads staged desktop bytes without mutating the bridge buffer", async () => {
    const original = new Uint8Array([1, 2, 3]);
    const bridge = {
      readResource: async () => { throw new Error("wrong source"); },
      readStagedResource: async (id) => {
        expect(id).toBe("stage_1");
        return { bytes: original };
      },
    };
    const bytes = await loadDocxPreviewBytes("edgeever-staged://stage_1", undefined, bridge);
    expect(bytes).toEqual(original);
    expect(bytes).not.toBe(original);
  });

  test("rejects a declared oversized resource before reading its body", async () => {
    globalThis.fetch = async () => new Response("", {
      headers: { "Content-Length": String(MAX_INLINE_DOCX_BYTES + 1) },
    });
    await expect(loadDocxPreviewBytes("/api/v1/resources/res_1/blob", undefined, undefined))
      .rejects.toBeInstanceOf(DocxPreviewTooLargeError);
  });

  test("stops an oversized stream even without Content-Length", async () => {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_INLINE_DOCX_BYTES));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }));
    await expect(loadDocxPreviewBytes("/api/v1/resources/res_1/blob", undefined, undefined))
      .rejects.toBeInstanceOf(DocxPreviewTooLargeError);
  });

  test("loads a small authenticated resource", async () => {
    globalThis.fetch = async (_url, options) => {
      expect(options.credentials).toBe("same-origin");
      return new Response(new Uint8Array([4, 5, 6]));
    };
    await expect(loadDocxPreviewBytes("/api/v1/resources/res_1/blob", undefined, undefined))
      .resolves.toEqual(new Uint8Array([4, 5, 6]));
  });
});
