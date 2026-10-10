import { readHackerNews } from "./hacker-news-clip";
import { markdownText, platformHtmlMarkdown, platformTarget, type PlatformLabels, type PlatformRead } from "./platform-clip";

// Built as a standalone IIFE and injected only after a user action.
(() => {
  const root = globalThis as typeof globalThis & {
    __edgeeverPlatformClipPayload?: { requestId?: string; url?: string; selectionFirst?: boolean };
  };
  const payload = root.__edgeeverPlatformClipPayload;
  delete root.__edgeeverPlatformClipPayload;
  if (!payload?.requestId || !payload.url) return;
  const requestId = payload.requestId;
  const expected = platformTarget(payload.url);
  if (!expected) return;
  const t = (key: string) => chrome.i18n.getMessage(key) || key;
  const labels: PlatformLabels = {
    score: t("platformScoreLabel"), externalLink: t("platformExternalLinkLabel"),
  };
  const samePage = () => platformTarget(location.href)?.url === expected.url;
  const read = (): PlatformRead => {
    if (!samePage()) return { ok: false, reason: "changed" };
    return readHackerNews(document, location.href, labels);
  };
  const finish = (result: unknown) => {
    void chrome.runtime.sendMessage({ type: "pagePlatformRead", requestId, result });
  };

  const capture = async () => {
    if (!samePage()) return { ok: false, reason: "changed" };
    const selection = payload.selectionFirst ? window.getSelection() : null;
    if (selection?.rangeCount && selection.toString().trim()) {
      const selected = document.createElement("div");
      for (let index = 0; index < selection.rangeCount; index += 1) selected.appendChild(selection.getRangeAt(index).cloneContents());
      const markdown = platformHtmlMarkdown(selected, expected.url)
        || selection.toString().trim().split(/\r?\n/).map(markdownText).join("\n");
      return { ok: true, selection: { title: document.title.trim() || expected.platform, url: expected.url, markdown, kind: "selection" } };
    }
    return read();
  };
  void capture().then((result) => finish(samePage() ? result : { ok: false, reason: "changed" }))
    .catch(() => finish({ ok: false, reason: "unreadable" }));
})();
