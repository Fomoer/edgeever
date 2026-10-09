import { expect, test } from "bun:test";
import { buildDocxPreviewHtml } from "./docx-preview-html.ts";

test("keeps document styling inside a restricted preview document", () => {
  const html = buildDocxPreviewHtml("<style>.docx { color: red }</style>", "<p>Draft</p>");
  expect(html).toContain("default-src 'none'");
  expect(html).toContain("script-src 'none'");
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("img-src data:");
  expect(html).toContain("<p>Draft</p>");
});
