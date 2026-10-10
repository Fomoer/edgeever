import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { createWindow } from "@mixmark-io/domino";

// Isolate esbuild from Bun's test process, as in the Worker build tests.
const entryPoints = ["background", "capture-platform"].map((name) =>
  fileURLToPath(new URL(`./src/${name}.ts`, import.meta.url)),
);
const bundleDirectory = mkdtempSync(join(tmpdir(), "edgeever-extension-test-"));
const bundlePath = join(bundleDirectory, "scripts.json");
let background, captureScript;
try {
  const bundled = spawnSync(process.execPath, ["--eval", `
    import { writeFileSync } from "node:fs";
    import { build } from "esbuild";
    const scripts = await Promise.all(${JSON.stringify(entryPoints)}.map(async (entry) =>
      (await build({ entryPoints: [entry], bundle: true, platform: "browser", format: "iife", write: false })).outputFiles[0].text
    ));
    writeFileSync(${JSON.stringify(bundlePath)}, JSON.stringify(scripts));
  `], { cwd: import.meta.dir, encoding: "utf8" });
  if (bundled.error || bundled.status !== 0) {
    throw new Error(`Failed to bundle extension test scripts: ${bundled.error?.message || bundled.stderr}`);
  }
  [background, captureScript] = JSON.parse(readFileSync(bundlePath, "utf8"));
} finally {
  rmSync(bundleDirectory, { recursive: true, force: true });
}
const urls = {
  "hacker-news": "https://news.ycombinator.com/item?id=40380738",
};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// Execute the actual bundled background and injected script. Only browser APIs
// and the instance's HTTP boundary are mocked; extraction and saving are real.
const harness = (options = {}) => {
  const platform = options.platform || "hacker-news";
  const pageUrl = options.pageUrl || urls[platform];
  let currentUrl = pageUrl;
  const window = createWindow(readFileSync(new URL(`./fixtures/platforms/${platform}.html`, import.meta.url), "utf8"), pageUrl);
  window.getSelection = () => null;
  options.prepare?.(window.document, window);
  const calls = { creates: [], uploads: [], saves: [], injections: [], feedback: [], requests: [], rejectedMessages: [] };
  let onMessage, onClick, menuDone;
  const json = (value, status = 200) => Response.json(value, { status });
  const fetchMock = async (url, init) => {
    calls.requests.push(String(url));
    const path = new URL(url).pathname;
    if (String(url).startsWith("https://edgeever.test")) {
      if (path === "/api/v1/notebooks") {
        if (options.navigateDuringNotebookLookup) currentUrl = "https://news.ycombinator.com/item?id=40380739";
        return json({ notebooks: [{ id: "nb_inbox", slug: "inbox" }] });
      }
      if (path === "/api/v1/memos") {
        calls.creates.push(JSON.parse(init.body));
        return json({ memo: { id: "memo_1", revision: 1, contentHash: "original" } }, 201);
      }
      if (path.endsWith("/resources")) {
        calls.uploads.push(init.body);
        return options.failUpload ? json({ error: { message: "upload failed" } }, 500) : json({ resource: { id: `res_${calls.uploads.length}` } });
      }
      if (path.endsWith("/edit-sessions")) return json({ editSession: { id: "session", baseRevision: options.editConflict ? 2 : 1, baseContentHash: options.editConflict ? "user-edited" : "original" } });
      if (path.endsWith("/save")) {
        if (options.failRewrite) return json({ error: { message: "conflict" } }, 409);
        calls.saves.push(JSON.parse(init.body)); return json({});
      }
      throw new Error(`Unexpected instance request: ${path}`);
    }
    return options.failDownload ? new Response("Forbidden", { status: 403 }) : new Response(png, { headers: { "content-type": "image/png" } });
  };
  let pageContext;
  const chrome = {
    i18n: { getMessage: (key) => key },
    runtime: {
      id: "extension-under-test",
      onInstalled: { addListener() {} }, onMessage: { addListener(listener) { onMessage = listener; } },
      openOptionsPage: async () => {},
      sendMessage: async (message) => {
        if (options.spoofMessages && message.type === "pagePlatformRead") {
          for (const overrides of [{ tab: { id: 999 } }, { frameId: 3 }, { id: "other-extension" }]) {
            const fake = { ...message, result: { ok: true, clip: { ...message.result.clip, title: "Wrong sender" } } };
            onMessage(fake, { id: chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: currentUrl, ...overrides }, () => {});
            calls.rejectedMessages.push(overrides);
          }
          onMessage({ ...message, requestId: "unrelated", result: { ok: false } }, { id: chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: currentUrl }, () => {});
        }
        onMessage(message, { id: chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: currentUrl }, () => {});
      },
    },
    storage: { local: { get: async () => ({ instanceUrl: "https://edgeever.test", token: "test-token", notebookId: "" }) } },
    permissions: { contains: async () => !options.denyInstance },
    tabs: { query: async () => [{ id: 7, url: currentUrl }], get: async () => ({ id: 7, url: currentUrl }) },
    windows: { onRemoved: { addListener() {} } },
    contextMenus: { onClicked: { addListener(listener) { onClick = listener; } } },
    scripting: { executeScript: async ({ func, args = [], files, target }) => {
      calls.injections.push({ files, target });
      if (options.denyScripting) throw new Error("Cannot access contents of the page. Missing host permission.");
      if (func) {
        if (args[0]?.action === "toast") { calls.feedback.push(args[0]); if (calls.feedback.length > 1) menuDone?.(args[0]); return []; }
        pageContext.__args = args;
        return [{ result: await runInContext(`(${func.toString()})(...__args)`, pageContext) }];
      }
      if (files?.[0] === "assets/capture-platform.js") runInContext(captureScript, pageContext);
      else if (files?.[0] !== "assets/capture-image.js") throw new Error(`Unexpected generic fallback: ${files}`);
      return [];
    } },
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
  };
  pageContext = createContext({ window, document: window.document, location: { get href() { return currentUrl; } }, URL, chrome, setTimeout, clearTimeout, fetch: fetchMock, AbortSignal, Blob, Uint8Array });
  runInContext(background, createContext({ chrome, fetch: fetchMock, URL, crypto, setTimeout, clearTimeout, setInterval, clearInterval, AbortSignal, AbortController, Blob, File, FormData, Uint8Array, ArrayBuffer, Response }));
  return {
    calls,
    toolbar: () => new Promise((resolve) => onMessage({ type: "captureCurrentPage" }, { id: chrome.runtime.id }, resolve)),
    menu: () => new Promise((resolve) => { menuDone = resolve; onClick({ menuItemId: `save-${platform}`, pageUrl, frameId: 0 }, { id: 7, url: pageUrl }); }),
  };
};

for (const platform of Object.keys(urls)) {
  test(`${platform}: toolbar and dedicated menu save the same note through the real parser`, async () => {
    const toolbar = harness({ platform }); const menu = harness({ platform });
    expect((await toolbar.toolbar()).ok).toBe(true);
    await menu.menu();
    expect(toolbar.calls.creates).toHaveLength(1);
    expect(menu.calls.creates).toHaveLength(1);
    const normalize = (note) => ({ ...note, contentMarkdown: note.contentMarkdown.replace(/capturedAtLabel: [^\n]+/, "capturedAtLabel: <capture time>") });
    expect(normalize(menu.calls.creates[0])).toEqual(normalize(toolbar.calls.creates[0]));
    expect(toolbar.calls.creates[0].tags).toEqual(["web-clip", platform]);
    expect(toolbar.calls.creates[0].notebookId).toBe("nb_inbox");
    expect(toolbar.calls.requests.some((url) => /\.(mp3|m4a|mp4)(\?|$)/.test(url))).toBe(false);
  });
}

test("a new platform toolbar still saves a valid selection instead of its full article", async () => {
  const h = harness({ platform: "hacker-news", prepare: (doc, window) => {
    window.getSelection = () => ({ rangeCount: 1, toString: () => "Only this passage", getRangeAt: () => ({ cloneContents: () => {
      const fragment = doc.createDocumentFragment(); const p = doc.createElement("p"); p.textContent = "Only this passage"; fragment.appendChild(p); return fragment;
    } }) });
  } });
  expect((await h.toolbar()).ok).toBe(true);
  expect(h.calls.creates[0].tags).toEqual(["web-clip"]);
  expect(h.calls.creates[0].contentMarkdown).toContain("Only this passage");
  expect(h.calls.creates[0].contentMarkdown).not.toContain("Ollama on your machine!");
});

test("request, extension, tab and frame correlation reject unrelated responses", async () => {
  const h = harness({ spoofMessages: true });
  expect((await h.toolbar()).ok).toBe(true);
  expect(h.calls.rejectedMessages).toHaveLength(3);
  expect(h.calls.creates).toHaveLength(1);
  expect(h.calls.creates[0].title).toStartWith("Show HN");
});

for (const failure of ["failDownload", "failUpload", "failRewrite", "editConflict"]) {
  test(`${failure}: keeps the saved body, reports external images, and never creates twice`, async () => {
    const h = harness({ [failure]: true, prepare: (doc) => { doc.querySelector(".toptext").innerHTML += '<img src="https://images.test/body.png">'; } });
    expect(await h.toolbar()).toEqual({ ok: true, message: "platformImagesPartial" });
    expect(h.calls.creates).toHaveLength(1);
    expect(h.calls.saves).toHaveLength(0);
    expect(h.calls.creates[0].contentMarkdown).toContain("images.test/body.png");
  });
}

test("images beyond the limit count towards partial status after 30 successful uploads", async () => {
  const h = harness({ platform: "hacker-news", prepare: (doc) => {
    const body = doc.querySelector(".toptext");
    body.innerHTML += Array.from({ length: 32 }, (_, i) => `<img src="https://images.test/${i}.png">`).join("");
  } });
  expect(await h.toolbar()).toEqual({ ok: true, message: "platformImagesPartial" });
  expect(h.calls.uploads).toHaveLength(30);
  expect(h.calls.creates).toHaveLength(1);
  expect(h.calls.saves[0].contentMarkdown).toContain("/api/v1/resources/res_1/blob");
  expect(h.calls.saves[0].contentMarkdown).toContain("https://images.test/31.png");
});

for (const platform of Object.keys(urls)) {
  test(`${platform}: unreadable content never falls back to a whole-page note`, async () => {
    const h = harness({ platform, prepare: (doc) => { doc.body.innerHTML = "<h1>Sign in</h1><p>Comments and recommendations</p>"; } });
    expect(await h.toolbar()).toEqual({ ok: false, message: "platformUnreadable" });
    expect(h.calls.creates).toHaveLength(0);
  });
}

test("navigation while resolving the notebook cancels the old content before creation", async () => {
  const h = harness({ platform: "hacker-news", navigateDuringNotebookLookup: true });
  expect(await h.toolbar()).toEqual({ ok: false, message: "platformPageChanged" });
  expect(h.calls.creates).toHaveLength(0);
});

for (const [option, message] of [["denyInstance", "instancePermissionRequired"], ["denyScripting", "pageAccessDenied"]]) {
  test(`${option}: gives an actionable permission error without creating a note`, async () => {
    const h = harness({ [option]: true });
    expect(await h.toolbar()).toEqual({ ok: false, message });
    expect(h.calls.creates).toHaveLength(0);
  });
}
