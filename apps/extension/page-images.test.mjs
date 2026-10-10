import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  embedPageImages,
  MAX_PAGE_IMAGE_TOTAL_BYTES,
  MAX_PAGE_IMAGES,
  pageImageRefs,
  readBodyWithLimit,
  replacePageImageUrls,
} from "./src/page-images.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const created = { revision: 1, contentHash: "hash" };
const pngFile = { bytes: png, mimeType: "image/png" };

const createClient = ({ failUploadFor = [], failSave = false, session = created, upload } = {}) => {
  const calls = { uploads: [], saves: [], sessions: 0 };
  let next = 0;
  return {
    calls,
    client: {
      uploadImage: async (memoId, file, signal) => {
        if (upload) return upload(memoId, file, signal);
        if (failUploadFor.includes(file.filename)) throw new Error("upload failed");
        calls.uploads.push({ memoId, file });
        next += 1;
        return { id: `res_${next}` };
      },
      createEditSession: async () => {
        calls.sessions += 1;
        return { editSession: { id: "es_1", baseRevision: session.revision, baseContentHash: session.contentHash } };
      },
      saveMemo: async (memoId, body) => {
        if (failSave) throw new Error("conflict");
        calls.saves.push({ memoId, body });
        return {};
      },
    },
  };
};

const onlyFrom = (urls) => async (image) => (urls.includes(image.url) ? pngFile : null);

describe("page clip images", () => {
  test("counts every external image while transferring only the first 30", async () => {
    const markdown = Array.from({ length: 32 }, (_, index) => `![${index}](https://example.com/${index}.png)`).join("\n\n");
    const images = pageImageRefs(markdown, "https://example.com", Infinity);
    const { client, calls } = createClient();
    const result = await embedPageImages(client, { memoId: "memo", markdown, created, images, download: async () => pngFile });
    expect(result).toEqual({ embedded: 30, total: 32 });
    expect(calls.uploads).toHaveLength(30);
    expect(calls.saves[0].body.contentMarkdown).toContain("![31](https://example.com/31.png)");
  });
  test("finds remote image addresses, resolving relative ones against the page", () => {
    const markdown = [
      "![Hero](https://cdn.example.com/hero.png)",
      "![rel](/img/a.jpg \"Caption\")",
      "![dup](https://cdn.example.com/hero.png)",
      "![data](data:image/png;base64,AAAA)",
      "![local](/api/v1/resources/res_1/blob)",
      "[not an image](https://example.com/page)",
      "![](<https://cdn.example.com/with space.png>)",
    ].join("\n\n");

    expect(pageImageRefs(markdown, "https://example.com/post/1")).toEqual([
      { href: "https://cdn.example.com/hero.png", url: "https://cdn.example.com/hero.png" },
      { href: "/img/a.jpg", url: "https://example.com/img/a.jpg" },
      { href: "https://cdn.example.com/with space.png", url: "https://cdn.example.com/with%20space.png" },
    ]);
  });

  test("ignores image syntax inside code blocks and code spans", () => {
    const markdown = [
      "Inline `![span](https://cdn.example.com/span.png)` example.",
      "    ![indented](https://cdn.example.com/indented.png)",
      "```md\n![example](https://cdn.example.com/a.png)\n```",
      "- item\n\n  ```\n  ![in list](https://cdn.example.com/a.png)\n  ```\n- ![real](https://cdn.example.com/a.png)",
    ].join("\n\n");

    expect(pageImageRefs(markdown, "https://example.com")).toEqual([
      { href: "https://cdn.example.com/a.png", url: "https://cdn.example.com/a.png" },
    ]);
    expect(replacePageImageUrls(markdown, [{ href: "https://cdn.example.com/a.png", resourceId: "res_1" }])).toBe(
      markdown.replace("![real](https://cdn.example.com/a.png)", "![real](/api/v1/resources/res_1/blob)"),
    );
  });

  test("reads destinations with escaped and nested parentheses", () => {
    const markdown = [
      "![A](https://example.com/a_\\(b\\).png)",
      "![B [x]](https://example.com/p(1).png \"Say \\\"hi\\\"\")",
      "> quoted ![C](https://example.com/c.png)",
    ].join("\n\n");

    expect(pageImageRefs(markdown, "https://example.com")).toEqual([
      { href: "https://example.com/a_(b).png", url: "https://example.com/a_(b).png" },
      { href: "https://example.com/p(1).png", url: "https://example.com/p(1).png" },
      { href: "https://example.com/c.png", url: "https://example.com/c.png" },
    ]);
    expect(replacePageImageUrls(markdown, [
      { href: "https://example.com/a_(b).png", resourceId: "res_1" },
      { href: "https://example.com/p(1).png", resourceId: "res_2" },
      { href: "https://example.com/c.png", resourceId: "res_3" },
    ])).toBe([
      "![A](/api/v1/resources/res_1/blob)",
      "![B [x]](/api/v1/resources/res_2/blob \"Say \\\"hi\\\"\")",
      "> quoted ![C](/api/v1/resources/res_3/blob)",
    ].join("\n\n"));
  });

  test("caps how many images one clip copies", () => {
    const markdown = Array.from({ length: MAX_PAGE_IMAGES + 5 }, (_, index) => `![](https://cdn.example.com/${index}.png)`).join("\n");
    expect(pageImageRefs(markdown, "https://example.com")).toHaveLength(MAX_PAGE_IMAGES);
  });

  test("rewrites only uploaded images and keeps alt text and titles", () => {
    const markdown = "![Hero](https://cdn.example.com/hero.png \"Title\")\n\n![Other](https://cdn.example.com/other.png)";
    expect(replacePageImageUrls(markdown, [{ href: "https://cdn.example.com/hero.png", resourceId: "res_9" }])).toBe(
      "![Hero](/api/v1/resources/res_9/blob \"Title\")\n\n![Other](https://cdn.example.com/other.png)",
    );
  });

  test("uploads downloaded images and saves the rewritten note once", async () => {
    const markdown = "# Post\n\n![A](https://cdn.example.com/a.png)\n\n![B](https://cdn.example.com/b.png)";
    const { client, calls } = createClient();

    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: onlyFrom(["https://cdn.example.com/a.png"]),
    });

    expect(result).toEqual({ embedded: 1, total: 2 });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.saves).toEqual([{
      memoId: "memo_1",
      body: {
        editSessionId: "es_1",
        expectedRevision: 1,
        expectedContentHash: "hash",
        contentMarkdown: "# Post\n\n![A](/api/v1/resources/res_1/blob)\n\n![B](https://cdn.example.com/b.png)",
      },
    }]);
  });

  test("does not overwrite a note edited while its images were copied", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    for (const session of [{ revision: 2, contentHash: "hash" }, { revision: 1, contentHash: "edited" }]) {
      const { client, calls } = createClient({ session });
      const result = await embedPageImages(client, {
        memoId: "memo_1",
        markdown,
        created,
        images: pageImageRefs(markdown, "https://example.com"),
        download: onlyFrom(["https://cdn.example.com/a.png"]),
      });
      expect(result).toEqual({ embedded: 0, total: 1 });
      expect(calls.sessions).toBe(1);
      expect(calls.saves).toHaveLength(0);
    }
  });

  test("leaves the saved note untouched when nothing could be copied", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    const { client, calls } = createClient({ failUploadFor: ["a.png"] });

    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: onlyFrom(["https://cdn.example.com/a.png"]),
    });

    expect(result).toEqual({ embedded: 0, total: 1 });
    expect(calls.sessions).toBe(0);
    expect(calls.saves).toHaveLength(0);
  });

  test("does not throw when the rewrite conflicts", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    const { client } = createClient({ failSave: true });
    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: onlyFrom(["https://cdn.example.com/a.png"]),
    });
    expect(result).toEqual({ embedded: 0, total: 1 });
  });

  test("holds one image at a time and shrinks the byte limit as images upload", async () => {
    const markdown = Array.from({ length: 5 }, (_, index) => `![](https://cdn.example.com/${index}.png)`).join("\n\n");
    const { client } = createClient();
    const events = [];
    const limits = [];
    const size = 15 * 1024 * 1024;
    const result = await embedPageImages({
      ...client,
      uploadImage: async (memoId, file, signal) => {
        events.push(`upload ${file.filename}`);
        return client.uploadImage(memoId, file, signal);
      },
    }, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: async (image, { maxBytes }) => {
        events.push(`download ${image.url.split("/").at(-1)}`);
        limits.push(maxBytes);
        const bytes = new Uint8Array(Math.min(size, maxBytes));
        bytes.set(png);
        return { bytes, mimeType: "image/png" };
      },
    });

    expect(events.slice(0, 4)).toEqual(["download 0.png", "upload 0.png", "download 1.png", "upload 1.png"]);
    expect(limits[0]).toBe(20 * 1024 * 1024);
    expect(limits.at(-1)).toBe(MAX_PAGE_IMAGE_TOTAL_BYTES - 3 * size);
    expect(limits).toHaveLength(4);
    expect(result.embedded).toBe(4);
  });

  test("stops waiting on stalled downloads and uploads once the budget is spent", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)\n\n![B](https://cdn.example.com/b.png)\n\n![C](https://cdn.example.com/c.png)";
    const never = new Promise(() => {});
    const signals = [];
    const { client, calls } = createClient({
      upload: (_memoId, file, signal) => {
        signals.push(signal);
        return file.filename === "b.png" ? never : Promise.resolve({ id: "res_a" });
      },
    });

    const startedAt = Date.now();
    const result = await embedPageImages(client, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: async (image, { timeoutMs }) => {
        expect(timeoutMs).toBeLessThanOrEqual(100);
        return image.url.endsWith("c.png") ? never : pngFile;
      },
      transferBudgetMs: 100,
      budgetMs: 200,
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(signals.at(-1)?.aborted).toBe(true);
    expect(result).toEqual({ embedded: 1, total: 3 });
    expect(calls.saves[0].body.contentMarkdown).toBe(
      "![A](/api/v1/resources/res_a/blob)\n\n![B](https://cdn.example.com/b.png)\n\n![C](https://cdn.example.com/c.png)",
    );
  });

  test("gives up on the rewrite when the server does not answer in time", async () => {
    const markdown = "![A](https://cdn.example.com/a.png)";
    const { client } = createClient();
    const startedAt = Date.now();
    const result = await embedPageImages({ ...client, createEditSession: () => new Promise(() => {}) }, {
      memoId: "memo_1",
      markdown,
      created,
      images: pageImageRefs(markdown, "https://example.com"),
      download: onlyFrom(["https://cdn.example.com/a.png"]),
      transferBudgetMs: 50,
      budgetMs: 100,
    });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toEqual({ embedded: 0, total: 1 });
  });

  test("stops reading a body as soon as it exceeds the limit", async () => {
    let pulled = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 100) controller.close();
      },
    });
    expect(await readBodyWithLimit(new Response(stream), 4096)).toBeNull();
    expect(pulled).toBeLessThan(10);
    expect(await readBodyWithLimit(new Response(new Uint8Array(10)), 4096)).toHaveLength(10);
    expect(await readBodyWithLimit(
      new Response(new Uint8Array(10), { headers: { "content-length": "9999" } }),
      4096,
    )).toBeNull();
  });

  test("page and selection clips copy their images after the note is created", () => {
    const background = readFileSync(new URL("./src/background.ts", import.meta.url), "utf8");
    expect(background).toContain("await createMemo(settings, page, tab.id);");
    expect(background).toContain("await embedClipImages(settings, created.memo, contentMarkdown, page.url, tabId, null);");
    expect(background).toContain("await embedClipImages(settings, created.memo, contentMarkdown, sourceUrl, tabId, frameId);");
    expect(background).toContain("func: readPageImageInPage");
  });
});
