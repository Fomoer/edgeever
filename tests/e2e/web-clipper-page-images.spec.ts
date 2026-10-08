import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Extension APIs, available inside the evaluated extension contexts.
declare const chrome: any;

// Loads the built Web Clipper into Chromium, saves a real page through the
// popup's `captureCurrentPage` message and checks that its images were copied
// into the note.
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const filler = "This paragraph gives the reader view enough article text to keep the content block. ".repeat(12);

type ImageRequest = { path: string; status: number; fromPage: boolean; script: boolean };

const startSourceSite = async (title: string) => {
  const requests: ImageRequest[] = [];
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fromPage = (request.headers.referer ?? "").startsWith(`${origin}/`);
    // fetch() rather than an <img> element loading the picture.
    const script = request.headers["sec-fetch-dest"] === "empty";
    const send = (status: number, type: string, body: string | Buffer) => {
      if (pathname.endsWith(".png")) requests.push({ path: pathname, status, fromPage, script });
      response.writeHead(status, { "content-type": type });
      response.end(body);
    };
    if (pathname === "/article.html") {
      send(200, "text/html; charset=utf-8", `<!doctype html>
<html><head><title>${title}</title></head><body>
<article>
  <h1>${title}</h1>
  <p>${filler}</p>
  <p><img src="/open.png" alt="Open image"></p>
  <p>${filler}</p>
  <p><img src="/protected.png" alt="Hotlink protected image"></p>
  <p>${filler}</p>
  <p><img src="/missing.png" alt="Missing image"></p>
  <pre><code>![example](${origin}/code.png)</code></pre>
  <p>${filler}</p>
</article>
</body></html>`);
      return;
    }
    if (pathname === "/open.png" || pathname === "/code.png") {
      send(200, "image/png", png);
      return;
    }
    // Hotlink protection: only requests sent by the page itself carry its
    // address as the referrer, so the extension must read this one in-page.
    if (pathname === "/protected.png") {
      if (fromPage) send(200, "image/png", png);
      else send(403, "text/plain", "forbidden");
      return;
    }
    send(404, "text/plain", "not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, origin, requests };
};

const prepareExtension = () => {
  execFileSync("bun", ["run", "build:extension"], { cwd: repositoryRoot, stdio: "pipe" });
  const directory = mkdtempSync(join(tmpdir(), "edgeever-web-clipper-"));
  cpSync(join(repositoryRoot, "apps/extension/dist"), directory, { recursive: true });
  // Automation cannot click the toolbar button (activeTab) or accept the
  // instance permission prompt, so this copy is granted the local hosts the
  // user would otherwise grant.
  const manifestPath = join(directory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return directory;
};

test.describe("web clipper page images", () => {
  let extensionDirectory = "";
  let userDataDirectory = "";
  let context: BrowserContext | null = null;
  let site: Awaited<ReturnType<typeof startSourceSite>> | null = null;

  test.afterEach(async () => {
    await context?.close();
    await new Promise((done) => (site?.server as Server | undefined)?.close(done) ?? done(undefined));
    if (extensionDirectory) rmSync(extensionDirectory, { recursive: true, force: true });
    if (userDataDirectory) rmSync(userDataDirectory, { recursive: true, force: true });
  });

  test("copies readable images into the saved note and leaves the rest untouched", async ({ request, baseURL }) => {
    test.setTimeout(180_000);
    const title = `Web clipper image check ${Date.now()}`;
    site = await startSourceSite(title);
    extensionDirectory = prepareExtension();
    userDataDirectory = mkdtempSync(join(tmpdir(), "edgeever-web-clipper-profile-"));

    const tokenResponse = await request.post("/api/v1/api-tokens", {
      data: { name: "web-clipper-e2e", scopes: ["read:memos", "write:memos", "read:resources", "write:resources", "read:notebooks"] },
    });
    expect(tokenResponse.status()).toBe(201);
    const { token, apiToken } = await tokenResponse.json() as { token: string; apiToken: { id: string } };

    let memoId = "";
    try {
      context = await chromium.launchPersistentContext(userDataDirectory, {
        channel: "chromium",
        args: [`--disable-extensions-except=${extensionDirectory}`, `--load-extension=${extensionDirectory}`],
      });
      const worker: Worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      await worker.evaluate((settings) => chrome.storage.local.set(settings), {
        instanceUrl: baseURL ?? "",
        token,
        notebookId: "",
      });

      const article = context.pages()[0] ?? await context.newPage();
      await article.goto(`${site.origin}/article.html`);

      // The popup asks the background to save the active tab of the focused
      // window, so send the message from an extension page in another window.
      const senderPromise = context.waitForEvent("page");
      await worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL("options.html"), focused: false }));
      const sender = await senderPromise;
      await sender.waitForLoadState();
      const activeUrl = await worker.evaluate(async (articleUrl) => {
        const [tab] = await chrome.tabs.query({ url: articleUrl });
        if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        return active?.url ?? "";
      }, `${site.origin}/article.html`);
      expect(activeUrl).toBe(`${site.origin}/article.html`);

      const result = await sender.evaluate(() => chrome.runtime.sendMessage({ type: "captureCurrentPage" }));
      expect(result).toEqual({ ok: true });

      const list = await request.get("/api/v1/memos?limit=50");
      expect(list.ok()).toBe(true);
      const memos = (await list.json() as { memos: Array<{ id: string; title: string }> }).memos;
      memoId = memos.find((memo) => memo.title === title)?.id ?? "";
      expect(memoId).toBeTruthy();

      const detail = await request.get(`/api/v1/memos/${memoId}`);
      const markdown = (await detail.json() as { memo: { contentMarkdown: string } }).memo.contentMarkdown;

      const resourceIds = [...markdown.matchAll(/!\[[^\]]*\]\(\/api\/v1\/resources\/([^/)]+)\/blob\)/g)].map((match) => match[1]);
      expect(resourceIds).toHaveLength(2);
      expect(markdown).toContain("![Open image](/api/v1/resources/");
      expect(markdown).toContain("![Hotlink protected image](/api/v1/resources/");
      // The clip keeps the page's own (relative) address for an image it could not copy.
      expect(markdown).toContain("![Missing image](/missing.png)");
      expect(markdown).toContain(`![example](${site.origin}/code.png)`);
      for (const resourceId of resourceIds) {
        const blob = await request.get(`/api/v1/resources/${resourceId}/blob`);
        expect(Buffer.from(await blob.body()).equals(png)).toBe(true);
      }

      // The extension's own read was refused, and the page read succeeded.
      const protectedReads = site.requests.filter((entry) => entry.path === "/protected.png");
      expect(protectedReads.some((entry) => entry.script && !entry.fromPage && entry.status === 403)).toBe(true);
      expect(protectedReads.some((entry) => entry.script && entry.fromPage && entry.status === 200)).toBe(true);
      // Image syntax inside a code block is never downloaded.
      expect(site.requests.some((entry) => entry.path === "/code.png")).toBe(false);
    } finally {
      if (memoId) {
        await request.delete(`/api/v1/memos/${memoId}`);
        await request.delete(`/api/v1/memos/${memoId}?permanent=1`);
      }
      await request.delete(`/api/v1/api-tokens/${apiToken.id}`);
    }
  });
});
