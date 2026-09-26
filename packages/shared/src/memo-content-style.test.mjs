import { describe, expect, test } from "bun:test";
import { MEMO_CONTENT_STYLE } from "./memo-content-style.ts";

describe("shared memo content style", () => {
  test("matches the established mobile PWA reading scale", () => {
    expect(MEMO_CONTENT_STYLE.body).toEqual({ fontSize: 16, lineHeight: 26, paragraphSpacing: 8 });
    expect(MEMO_CONTENT_STYLE.divider).toEqual({
      color: { dark: "#4ade80", light: "#66ca80" },
      marginVertical: 24,
      thickness: 1,
    });
  });
});
