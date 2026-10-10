import TurndownService from "turndown";

export type ClipPlatform = "hacker-news";
export type PlatformTarget = { platform: ClipPlatform; id: string; url: string };
export type PublishedTime = { value: string; precision: "datetime" | "date" | "relative" };
export type PlatformClip = PlatformTarget & {
  title: string;
  markdown: string;
  author?: string;
  publishedAt?: PublishedTime;
  tags: string[];
  completeness: "complete";
};
export type PlatformRead = { ok: true; clip: PlatformClip } | {
  ok: false;
  reason: "not-target" | "unreadable" | "changed";
};
export type PlatformLabels = {
  score: string;
  externalLink: string;
};

export const PLATFORM_MENUS = [
  { id: "save-hacker-news", title: "saveHackerNewsToEdgeEver", patterns: ["https://news.ycombinator.com/item?*"] },
] as const;

export const platformTarget = (pageUrl: string): PlatformTarget | null => {
  let url: URL;
  try { url = new URL(pageUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hostname === "news.ycombinator.com" && url.pathname === "/item") {
    const ids = url.searchParams.getAll("id");
    if (ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0])) return null;
    return { platform: "hacker-news", id: ids[0], url: `https://news.ycombinator.com/item?id=${ids[0]}` };
  }
  return null;
};

export const platformText = (node: Node | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
export const markdownText = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/([\\`*_{}[\]<>])/g, "\\$1");
export const markdownUrl = (value: string) => value.replace(/[\\ ()<>]/g, (char) => encodeURIComponent(char).replace("(", "%28").replace(")", "%29"));

export const safePlatformUrl = (value: string, base: string, mailto = false) => {
  if (!value.trim()) return "";
  try {
    const url = new URL(value, base);
    return (url.protocol === "http:" || url.protocol === "https:" || (mailto && url.protocol === "mailto:"))
      && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
};

/** Keep the precision of the page's time; never substitute the capture time. */
export const publishedTime = (node: Element | null): PublishedTime | undefined => {
  if (!node) return undefined;
  const machine = (node.getAttribute("datetime") || node.getAttribute("title") || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(machine)) return { value: machine, precision: "date" };
  // HN's ISO-shaped title has no zone; preserve it instead of guessing one.
  const normalized = machine.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/ (?=[+-]\d{2}:\d{2}$)/, "");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(normalized)) {
    return { value: normalized, precision: "datetime" };
  }
  const value = platformText(node);
  return value ? { value, precision: "relative" } : undefined;
};

export const publishedTimeText = (time: PublishedTime, relativeLabel: string) =>
  time.precision === "relative" ? `${time.value} (${relativeLabel})` : time.value;

/** Converts a detached copy only. Links and images never keep active protocols. */
export const platformHtmlMarkdown = (body: Element | DocumentFragment, baseUrl: string): string => {
  const copy = body.cloneNode(true) as Element | DocumentFragment;
  Array.from(copy.querySelectorAll("script, style, noscript, template, iframe, object, embed, canvas, svg, video, audio, source, link, meta, form, input, button, textarea, select, [hidden], [aria-hidden='true']"))
    .forEach((node) => node.remove());
  for (const node of Array.from(copy.querySelectorAll("*"))) {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || attribute.name === "style") node.removeAttribute(attribute.name);
    }
  }
  for (const link of Array.from(copy.querySelectorAll("a"))) {
    const url = safePlatformUrl(link.getAttribute("href") || "", baseUrl, true);
    if (url) link.setAttribute("href", markdownUrl(url));
    else link.removeAttribute("href");
  }
  for (const img of Array.from(copy.querySelectorAll("img"))) {
    const url = ["data-original", "data-src", "src"].map((name) => safePlatformUrl(img.getAttribute(name) || "", baseUrl)).find(Boolean);
    if (url) img.setAttribute("src", markdownUrl(url));
    else img.remove();
    img.removeAttribute("srcset");
  }
  const turndown = new TurndownService({ bulletListMarker: "-", codeBlockStyle: "fenced", headingStyle: "atx", linkStyle: "inlined" });
  turndown.addRule("platformCode", {
    filter: "pre",
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const code = element.querySelector("code");
      const language = /(?:^|\s)(?:language|lang)-([a-zA-Z0-9_+-]+)(?=\s|$)/.exec(`${code?.className ?? ""} ${element.className}`)?.[1] || "";
      const text = (code ?? element).textContent?.replace(/\n$/, "") || "";
      const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1)));
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    },
  });
  return turndown.turndown(copy as HTMLElement).trim();
};

export const isPlatformClip = (value: unknown, expected: PlatformTarget): value is PlatformClip => {
  if (!value || typeof value !== "object") return false;
  const clip = value as Partial<PlatformClip>;
  const time = clip.publishedAt;
  return clip.platform === expected.platform && clip.id === expected.id && clip.url === expected.url
    && typeof clip.title === "string" && !!clip.title.trim() && clip.title.length <= 10_000
    && typeof clip.markdown === "string" && !!clip.markdown.trim() && clip.markdown.length <= 2_000_000
    && (clip.author === undefined || typeof clip.author === "string")
    && (!time || (typeof time.value === "string" && ["datetime", "date", "relative"].includes(time.precision)))
    && Array.isArray(clip.tags) && clip.tags.length === 2 && clip.tags[0] === "web-clip" && clip.tags[1] === expected.platform
    && clip.completeness === "complete";
};
