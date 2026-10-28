import { describe, expect, test } from "bun:test";
import { devShareMarkdownToken, loadDevShareMarkdown } from "./share-markdown-dev.ts";

const token = "9tjFn0ZR0iawPf-8EaZtpRw3i-vawo7E0yTnqMMCBgk";

const jsonResponse = (status, body, contentType = "application/json") => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": contentType },
});

describe("local share markdown", () => {
  test("recognizes the markdown suffix on a real share token", () => {
    expect(devShareMarkdownToken(`/share/${token}.md`)).toBe(token);
    expect(devShareMarkdownToken(`/share/${token}`)).toBeNull();
    expect(devShareMarkdownToken(`/share/${token}.md/extra`)).toBeNull();
    expect(devShareMarkdownToken("/share/Meeting-Notes.md")).toBe("meeting-notes");
  });

  test("uses the worker markdown response when it is already markdown", async () => {
    const fetchImpl = async (url) => {
      expect(url).toBe(`http://api.test/share/${token}.md`);
      return new Response("# Title\n\nBody\n", { status: 200, headers: { "content-type": "text/markdown; charset=utf-8" } });
    };
    const result = await loadDevShareMarkdown(token, fetchImpl, "http://api.test");
    expect(result).toEqual({ status: 200, body: "# Title\n\nBody\n" });
  });

  test("reads the public share API when the worker still returns the app shell", async () => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith(".md")) return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
      expect(url).toBe(`http://api.test/api/public/shares/${token}`);
      return jsonResponse(200, { share: { title: "布局按钮", contentMarkdown: "按钮在右上角。\n" } });
    };
    const result = await loadDevShareMarkdown(token, fetchImpl, "http://api.test");
    expect(result).toEqual({ status: 200, body: "# 布局按钮\n\n按钮在右上角。\n" });
  });

  test("keeps a missing or locked note out of the body", async () => {
    const missing = await loadDevShareMarkdown(token, async (url) => (
      String(url).endsWith(".md")
        ? jsonResponse(404, { error: { code: "not_found" } }, "text/html")
        : jsonResponse(404, { error: { code: "not_found" } })
    ), "http://api.test");
    expect(missing.status).toBe(404);
    expect(missing.body).not.toContain("secret");

    const locked = await loadDevShareMarkdown(token, async (url) => (
      String(url).endsWith(".md")
        ? new Response("no", { status: 200, headers: { "content-type": "text/html" } })
        : jsonResponse(403, { error: { code: "share_password_required" } })
    ), "http://api.test");
    expect(locked).toEqual({ status: 403, body: "This shared note requires a password.\n" });
  });
});
