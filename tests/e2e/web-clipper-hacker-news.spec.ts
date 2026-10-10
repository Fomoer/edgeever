import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

declare const chrome: any;
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const platforms = [
  { name: "hacker-news", url: "https://news.ycombinator.com/item?id=40380738", title: "Show HN: I built a LLM-powered Ask HN: like Perplexity, but for HN comments", text: "Ollama on your machine!", excluded: "Matching the HN style" },
];

test("Hacker News clips persist through the extension and local API; archived images survive source blocking", async ({ request, baseURL }) => {
  test.setTimeout(180_000);
  execFileSync("bun", ["run", "build:extension"], { cwd: repositoryRoot, stdio: "pipe" });
  const directory = mkdtempSync(join(tmpdir(), "edgeever-platform-extension-"));
  const profile = mkdtempSync(join(tmpdir(), "edgeever-platform-browser-"));
  cpSync(join(repositoryRoot, "apps/extension/dist"), directory, { recursive: true });
  const manifestPath = join(directory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // The test cannot grant activeTab by clicking browser chrome. Give only this
  // temporary build the sampled hosts, image host and local instance access.
  manifest.host_permissions = ["http://127.0.0.1/*", "https://news.ycombinator.com/*", "https://images.edgeever.test/*"];
  writeFileSync(manifestPath, JSON.stringify(manifest));

  let context: BrowserContext | undefined;
  let tokenId = "";
  const memoIds: string[] = [];
  try {
    const tokenResponse = await request.post("/api/v1/api-tokens", { data: {
      name: "web-clipper-platform-e2e", scopes: ["read:memos", "write:memos", "read:resources", "write:resources", "read:notebooks"],
    } });
    expect(tokenResponse.status()).toBe(201);
    const { token, apiToken } = await tokenResponse.json(); tokenId = apiToken.id;
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", locale: "zh-CN", args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
    });
    const worker: Worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await worker.evaluate((settings) => chrome.storage.local.set(settings), { instanceUrl: baseURL!, token, notebookId: "" });
    const article = context.pages()[0] ?? await context.newPage();
    let failure = false;
    let sourceBlocked = false;
    const sourceRequests: string[] = [];
    await context.route(/^https:\/\//, async (route) => {
      const url = route.request().url(); sourceRequests.push(url);
      if (sourceBlocked) { await route.abort(); return; }
      if (url.startsWith("https://images.edgeever.test/")) { await route.fulfill({ contentType: "image/png", body: png }); return; }
      const platform = platforms.find((entry) => url === entry.url);
      if (!platform) { await route.abort(); return; }
      const html = failure ? "<html><body><h1>Sign in</h1><p>Unrelated comments</p></body></html>"
        : readFileSync(join(repositoryRoot, `apps/extension/fixtures/platforms/${platform.name}.html`), "utf8")
          .replace(/(<div class="toptext"[^>]*>)/, '$1<img src="https://images.edgeever.test/body.png">');
      if (!failure) expect(html).toContain('src="https://images.edgeever.test/body.png"');
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    });
    const senderPromise = context.waitForEvent("page");
    await worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL("options.html"), focused: false }));
    const sender = await senderPromise; await sender.waitForLoadState();
    const save = async (url: string) => {
      await worker.evaluate(async (targetUrl) => {
        const [tab] = await chrome.tabs.query({ url: targetUrl });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }, url);
      return sender.evaluate(() => chrome.runtime.sendMessage({ type: "captureCurrentPage" }));
    };
    for (const platform of platforms) {
      const before = (await (await request.get("/api/v1/memos?limit=100")).json()).memos as Array<{ id: string }>;
      const oldIds = new Set(before.map((memo) => memo.id));
      await article.goto(platform.url);
      const saved = await save(platform.url);
      expect(saved.ok).toBe(true);
      const after = (await (await request.get("/api/v1/memos?limit=100")).json()).memos as Array<{ id: string; title: string }>;
      const note = after.find((memo) => !oldIds.has(memo.id) && memo.title === platform.title);
      expect(note).toBeTruthy(); memoIds.push(note!.id);
      const detail = await request.get(`/api/v1/memos/${note!.id}`);
      expect(detail.ok()).toBe(true);
      const { memo } = await detail.json();
      expect(memo.contentMarkdown).toContain(platform.text);
      expect(memo.contentMarkdown).not.toContain(platform.excluded);
      expect(memo.contentMarkdown).toContain(platform.url);
      {
        const resources = [...memo.contentMarkdown.matchAll(/!\[[^\]]*\]\(\/api\/v1\/resources\/([^/)]+)\/blob\)/g)] as RegExpMatchArray[];
        expect(resources).toHaveLength(1);
        await article.goto("about:blank"); sourceBlocked = true;
        // With the source page gone and every external source host blocked,
        // reopen the saved note's image from the EdgeEver resource endpoint.
        const blob = await request.get(`/api/v1/resources/${resources[0][1]}/blob`);
        expect(blob.ok()).toBe(true);
        expect(Buffer.from(await blob.body()).equals(png)).toBe(true);
      }
      const preview = await context.newPage();
      await preview.goto(baseURL!);
      await preview.getByRole("button", { name: "全部笔记", exact: true }).click();
      await preview.getByPlaceholder("搜索笔记").fill(platform.title);
      await preview.locator(`[data-memo-id="${note!.id}"]`).locator("button").first().click();
      const editor = preview.locator(".ProseMirror");
      await expect(editor).toContainText(platform.text);
      await expect(editor).not.toContainText(platform.excluded);
      {
        const image = editor.locator("img").first();
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
      }
      await preview.close();
      sourceBlocked = false;
      failure = true;
      await article.goto(platform.url);
      expect((await save(platform.url)).ok).toBe(false);
      const unchanged = (await (await request.get("/api/v1/memos?limit=100")).json()).memos as Array<{ id: string }>;
      expect(unchanged.filter((memo) => !oldIds.has(memo.id)).map((memo) => memo.id)).toEqual([note!.id]);
      failure = false;
    }
    expect(sourceRequests.some((url) => /\.(mp3|m4a|mp4)(\?|$)/.test(url))).toBe(false);
  } finally {
    for (const id of memoIds) {
      expect.soft((await request.delete(`/api/v1/memos/${id}`)).ok()).toBe(true);
      expect.soft((await request.delete(`/api/v1/memos/${id}?permanent=1`)).ok()).toBe(true);
    }
    if (tokenId) await request.delete(`/api/v1/api-tokens/${tokenId}`);
    await context?.close();
    rmSync(directory, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true });
  }
});
