import { instagramPostCard, readMetaSocial } from "./social-clip";
import { platformTarget, type PlatformRead, type PlatformTarget } from "./platform-clip";

/** Feed items loaded after navigation are absent from the document's JSON.
 * Read only the selected post's same-origin HTML, without executing its scripts. */
export const readInstagramDetail = async (
  doc: Document, target: PlatformTarget, sourceUrl: string, samePage: () => boolean,
): Promise<PlatformRead> => {
  const source = new URL(sourceUrl);
  if (target.platform !== "instagram" || source.protocol !== "https:"
    || !["www.instagram.com", "instagram.com"].includes(source.hostname)) return { ok: false, reason: "not-target" };
  const card = instagramPostCard(doc, target);
  if (!card) return { ok: false, reason: "unreadable" };
  const current = () => samePage() && doc.contains(card) && instagramPostCard(doc, target) === card;
  try {
    const url = new URL(`/p/${target.id}/`, source);
    const response = await fetch(url.href, {
      credentials: "same-origin", redirect: "error", headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!current()) return { ok: false, reason: "changed" };
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")
      || Number(response.headers.get("content-length")) > 10_000_000) return { ok: false, reason: "unreadable" };
    if (response.url && (new URL(response.url).origin !== source.origin
      || platformTarget(response.url)?.url !== target.url)) return { ok: false, reason: "changed" };
    const html = await response.text();
    if (!current()) return { ok: false, reason: "changed" };
    if (html.length > 10_000_000) return { ok: false, reason: "unreadable" };
    const detail = new DOMParser().parseFromString(html, "text/html");
    return readMetaSocial(doc, target, detail);
  } catch {
    return { ok: false, reason: current() ? "unreadable" : "changed" };
  }
};
