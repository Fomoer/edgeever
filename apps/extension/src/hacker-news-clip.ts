import { markdownText, markdownUrl, platformHtmlMarkdown, platformTarget, platformText, publishedTime, safePlatformUrl, type PlatformLabels, type PlatformRead } from "./platform-clip";

export const readHackerNews = (doc: Document, pageUrl: string, labels: PlatformLabels): PlatformRead => {
  const target = platformTarget(pageUrl);
  if (target?.platform !== "hacker-news") return { ok: false, reason: "not-target" };
  const root = doc.querySelector(".fatitem");
  const story = root?.querySelector("tr.athing");
  const titleLink = story?.querySelector(".titleline > a");
  const title = platformText(titleLink);
  // A comment's item page also has .fatitem and .athing, but no titleline.
  if (!story || !titleLink || !title || /^(\[deleted\]|\[dead\])$/i.test(title)) return { ok: false, reason: "unreadable" };
  if (story.id !== target.id) return { ok: false, reason: "changed" };
  const metadata = story.nextElementSibling?.querySelector(".subtext");
  const body = root?.querySelector(".toptext");
  const markdown = body ? platformHtmlMarkdown(body, target.url) : "";
  const linked = safePlatformUrl(titleLink.getAttribute("href") || "", target.url);
  const externalLink = linked && platformTarget(linked)?.url !== target.url ? linked : "";
  if (!markdown && !externalLink) return { ok: false, reason: "unreadable" };
  const score = platformText(metadata?.querySelector(`#score_${target.id}`));
  const points = /^(\d+)\s+points?$/.exec(score)?.[1];
  return {
    ok: true,
    clip: {
      ...target, title, author: platformText(metadata?.querySelector(".hnuser")) || undefined,
      publishedAt: publishedTime(metadata?.querySelector(".age") ?? null),
      markdown: [
        points === undefined ? "" : `${markdownText(labels.score)}: ${points}`,
        externalLink ? `${markdownText(labels.externalLink)}: [${markdownText(externalLink)}](${markdownUrl(externalLink)})` : "",
        markdown,
      ].filter(Boolean).join("\n\n"),
      tags: ["web-clip", target.platform], completeness: "complete",
    },
  };
};
