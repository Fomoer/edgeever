import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createDocument } from "@mixmark-io/domino";
import { platformTarget, platformHtmlMarkdown } from "./src/platform-clip.ts";
import { readHackerNews } from "./src/hacker-news-clip.ts";
const labels = { score: "Points at capture", externalLink: "Linked page" };
const hnUrl = "https://news.ycombinator.com/item?id=40380738";
const fixture = (name) => createDocument(readFileSync(new URL(`./fixtures/platforms/${name}.html`, import.meta.url), "utf8"));

test("HN detail URLs retain identity and discard tracking and comment anchors", () => {
  expect(platformTarget(`${hnUrl}&utm_source=x#40384810`)).toEqual({ platform: "hacker-news", id: "40380738", url: hnUrl });
  for (const url of ["https://news.ycombinator.com/", `${hnUrl}&id=1`, "https://news.ycombinator.com.evil.test/item?id=1", "https://u:p@news.ycombinator.com/item?id=1", "http://news.ycombinator.com/item?id=1", "https://news.ycombinator.com/item?id=0"]) expect(platformTarget(url)).toBeNull();
});

test("HN real DOM keeps text and external link together, metadata and no comments", () => {
  const result = readHackerNews(fixture("hacker-news"), hnUrl, labels);
  expect(result.ok).toBe(true);
  expect(result.clip).toMatchObject({ platform: "hacker-news", id: "40380738", url: hnUrl, author: "jnnnthnn", publishedAt: { value: "2024-05-16T17:11:58", precision: "datetime" }, tags: ["web-clip", "hacker-news"] });
  expect(result.clip.title).toStartWith("Show HN: I built a LLM-powered Ask HN");
  expect(result.clip.markdown).toContain("Hi HN!");
  expect(result.clip.markdown).toContain("Ollama on your machine!");
  expect(result.clip.markdown).toContain("Linked page: [https://hackersearch.net/ask](https://hackersearch.net/ask)");
  expect(result.clip.markdown).toContain("Points at capture: 92");
  expect(result.clip.markdown).not.toContain("Matching the HN style");
});

test("HN allows Ask text and link-only posts and omits missing metadata", () => {
  const text = fixture("hacker-news");
  text.querySelector(".titleline a").setAttribute("href", "item?id=40380738");
  text.querySelector(".score").remove(); text.querySelector(".age").remove();
  const ask = readHackerNews(text, hnUrl, labels);
  expect(ask.ok).toBe(true);
  expect(ask.clip.markdown).not.toContain("Linked page:");
  expect(ask.clip.markdown).not.toContain("Points at capture:");
  expect(ask.clip.publishedAt).toBeUndefined();
  const link = fixture("hacker-news"); link.querySelector(".toptext").remove();
  expect(readHackerNews(link, hnUrl, labels).clip.markdown).toContain("Linked page:");
});

test("HN rejects comment, deleted, unreadable and mismatched main posts", () => {
  const doc = fixture("hacker-news");
  expect(readHackerNews(doc, hnUrl.replace("40380738", "40384810"), labels).ok).toBe(false);
  doc.querySelector(".titleline").remove();
  expect(readHackerNews(doc, hnUrl, labels).ok).toBe(false);
  const deleted = fixture("hacker-news"); deleted.querySelector(".titleline a").textContent = "[deleted]";
  expect(readHackerNews(deleted, hnUrl, labels).ok).toBe(false);
});

test("HTML cleanup preserves semantic content and code language on a copy", () => {
  const doc = createDocument('<div id="body"><h2>正文</h2><blockquote>引用</blockquote><ul><li>条目</li></ul><pre><code class="language-js">const x = `safe`;\n```</code></pre><a href="/article">链接</a><img data-src="//images.example.com/a.png" onerror="evil()"><script>bad()</script><a href="javascript:evil()">危险链接</a><iframe src="/evil"></iframe><button>分享</button></div>');
  const body = doc.querySelector("#body"); const before = body.outerHTML;
  const markdown = platformHtmlMarkdown(body, "https://news.ycombinator.com/item?id=40380738");
  expect(markdown).toContain("## 正文");
  expect(markdown).toContain("> 引用");
  expect(markdown).toMatch(/-\s+条目/);
  expect(markdown).toContain("````js\nconst x = `safe`;\n```\n````");
  expect(markdown).toContain("[链接](https://news.ycombinator.com/article)");
  expect(markdown).toContain("https://images.example.com/a.png");
  for (const unwanted of ["javascript:", "evil()", "bad()", "分享", "onerror", "<iframe"]) expect(markdown).not.toContain(unwanted);
  expect(body.outerHTML).toBe(before);
});
