import {
  markdownText, markdownUrl, platformHtmlMarkdown, platformReadableCopy, platformElementHidden, platformTarget, platformText,
  publishedTime, safePlatformUrl, socialPlatform, type PlatformRead, type PlatformTarget, type PublishedTime,
} from "./platform-clip";

type RecordValue = { [key: string]: unknown };
const record = (value: unknown): RecordValue | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const text = (value: unknown) => typeof value === "string" ? value : "";
const sameTarget = (value: unknown, target: PlatformTarget) => {
  const parsed = platformTarget(text(value));
  return parsed?.platform === target.platform && parsed.id === target.id;
};

/** Only reads JSON already delivered with the current page; never executes it. */
const pageRecords = (doc: Document, identity: string, type = "application/json") => {
  const found: RecordValue[] = [];
  let visited = 0;
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 60 || ++visited > 100_000) return;
    const obj = record(value);
    if (obj) found.push(obj);
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  for (const script of Array.from(doc.querySelectorAll(`script[type="${type}"]`))) {
    const source = script.textContent || "";
    if (!source.includes(identity) || source.length > 10_000_000) continue;
    try { visit(JSON.parse(source), 0); } catch { /* Malformed page data is not a fallback to the whole page. */ }
  }
  return found;
};
const paragraphs = (doc: Document, value: string) => {
  const body = doc.createElement("div");
  for (const paragraph of value.split(/\n\s*\n/)) {
    const p = doc.createElement("p");
    for (const [index, line] of paragraph.split("\n").entries()) {
      if (index) p.appendChild(doc.createElement("br"));
      p.appendChild(doc.createTextNode(line));
    }
    body.appendChild(p);
  }
  return body;
};
const plainSocialMarkdown = (doc: Document, value: string, base: string) =>
  platformHtmlMarkdown(paragraphs(doc,value),base);
/** Normalize text newlines in a detached body before shared Markdown conversion. */
export const socialBodyMarkdown = (doc: Document, body: Element, base: string) => {
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 3) { visit(child); continue; }
      const value = child.textContent || '';
      if (!/[\r\n]/.test(value)) continue;
      const fragment = doc.createDocumentFragment();
      value.split(/\r?\n/).forEach((line,index) => {
        if (index) fragment.appendChild(doc.createElement('br'));
        fragment.appendChild(doc.createTextNode(line.trimEnd()));
      });
      child.parentNode?.replaceChild(fragment,child);
    }
  };
  visit(body);
  return platformHtmlMarkdown(body,base).replace(/[ \t]+\n/g,'\n');
};
const postLinkUrl = (link: Element, base: string) => {
  const href=(link.getAttribute("href") || "").trim();
  return href.startsWith("/") || href.startsWith("https://") ? safePlatformUrl(href,base) : "";
};
const imageMarkdown = (url: unknown, alt: unknown, base: string) => {
  const safe = safePlatformUrl(text(url), base);
  return safe ? `![${markdownText(text(alt))}](${markdownUrl(safe)})` : "";
};
const epochTime = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100_000_000_000) return undefined;
  return { value: new Date(value * 1_000).toISOString(), precision: "datetime" as const };
};
const dateTime = (value: unknown) => {
  const s = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)
    && Number.isFinite(Date.parse(s)) ? { value: s, precision: "datetime" as const } : undefined;
};
const result = (target: PlatformTarget, markdown: string, author?: string, time?: PublishedTime, title?: string): PlatformRead => {
  if (!markdown.trim()) return { ok: false, reason: "unreadable" };
  return { ok: true, clip: {
    ...target, title: title?.trim() || markdown.split("\n").find((line) => line.trim())?.replace(/!\[.*$/, "").slice(0,100) || author || target.platform,
    markdown: markdown.trim(), author: author || undefined, publishedAt: time,
    tags: ["web-clip", target.platform], completeness: "complete",
  } };
};

export const ownPostLinks = (card: Element, platform: string) => Array.from(card.querySelectorAll("a[href]")).filter((link) => {
  if (platformElementHidden(link)) return false;
  if (platform === "facebook") return link.closest('[role="article"], article') === card
    && !link.closest('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
  if (platform === "bluesky") return link.closest('[data-testid^="postThreadItem-by-"], [data-testid^="feedItem-by-"]') === card
    && !link.closest('[data-testid="postText"], [data-word-wrap="1"], [role="link"][aria-label^="Post by "], [data-testid="quotePost"]');
  return true;
});

export const LINKEDIN_CARD_SELECTOR = '[data-activity-urn], [data-urn], [data-id], [role="listitem"][componentkey^="update-card-"]';
export const linkedinCardTarget = (card: Element): PlatformTarget | null => {
  for (const key of ["data-activity-urn", "data-urn", "data-id"]) {
    const target = platformTarget(`https://www.linkedin.com/feed/update/${card.getAttribute(key) || ""}/`);
    if (target) return target;
  }
  // The signed-in SDUI card exposes its post identity in the main commentary,
  // not an activity data attribute. Never use comment or nested card IDs.
  for (const commentary of Array.from(card.querySelectorAll('[id^="translatable-commentary-"]'))) {
    if (commentary.closest(LINKEDIN_CARD_SELECTOR) !== card) continue;
    const identity = commentary.id;
    if (!identity.includes("contentUrnCommentUrn=null")) continue;
    const id = /userGeneratedContentId=([1-9]\d*)\)/.exec(identity)?.[1];
    if (id) return platformTarget(`https://www.linkedin.com/feed/update/urn:li:ugcPost:${id}/`);
    const shareId = /shareId=([1-9]\d*)\)/.exec(identity)?.[1];
    if (shareId) return platformTarget(`https://www.linkedin.com/feed/update/urn:li:share:${shareId}/`);
  }
  return null;
};

const facebookTargetIds = (doc: Document, target: PlatformTarget) => {
  const ids = new Set([target.id]);
  for (const item of pageRecords(doc, target.id)) {
    if (text(item.post_id) === target.id) {
      const alias = platformTarget(text(item.permalink_url || item.url));
      if (alias?.platform === "facebook") ids.add(alias.id);
    }
    // The signed-in permalink dialog can declare a different pfbid for the same post.
    if (item.canonicalRouteName !== "comet.fbweb.CometSinglePostDialogRoute"
      || !sameTarget(safePlatformUrl(text(item.url), target.url), target)) continue;
    const params = record(item.params);
    const alias = platformTarget(`https://www.facebook.com/${text(params?.page_token)}/posts/${text(params?.story_token)}`);
    if (alias?.platform === "facebook") ids.add(alias.id);
  }
  return ids;
};

export const socialPostCard = (doc: Document, target: PlatformTarget): Element | null => {
  if (target.platform === "facebook") {
    const ids = facebookTargetIds(doc, target);
    return Array.from(doc.querySelectorAll('[role="article"], article')).find((card) =>
      ownPostLinks(card,target.platform).some((a) => {
        const url=postLinkUrl(a,target.url);
        return a.closest('[role="article"], article') === card && !/[?&]comment_id=/.test(url)
          && ids.has(platformTarget(url)?.id || "");
      })) || null;
  }
  if (target.platform === "linkedin") {
    return Array.from(doc.querySelectorAll(LINKEDIN_CARD_SELECTOR)).find((card) =>
      linkedinCardTarget(card)?.id === target.id
      || sameTarget(`https://www.linkedin.com/feed/update/${card.getAttribute("data-attributed-urn") || ""}/`,target)) || null;
  }
  if (target.platform === "bluesky") {
    const cards = Array.from(doc.querySelectorAll('[data-testid^="postThreadItem-by-"], [data-testid^="feedItem-by-"]'));
    return cards.find((card) => ownPostLinks(card,target.platform).some((a) => {
      const url = postLinkUrl(a,target.url);
      return sameTarget(url, target) || url.startsWith(`${target.url}/reposted-by`);
    })) || null;
  }
  return null;
};

const BLUESKY_QUOTE_SELECTOR='[role="link"][aria-label^="Post by "], [data-testid="quotePost"]';
const blueskyFullsizeUrl = (value: string) => {
  try {
    const url=new URL(value);
    if(url.protocol === "https:" && url.hostname === "cdn.bsky.app") url.pathname=url.pathname.replace("/img/feed_thumbnail/","/img/feed_fullsize/");
    return url.href;
  } catch { return value; }
};
const blueskyImages = (card: Element, base: string) => Array.from(card.querySelectorAll("img[src]"))
  .filter((img)=>!img.closest(BLUESKY_QUOTE_SELECTOR) && !img.closest('[data-testid="userAvatarImage"]') && /\/img\/(?:feed_thumbnail|feed_fullsize)\//.test(img.getAttribute("src") || ""))
  .map((img)=>imageMarkdown(blueskyFullsizeUrl(img.getAttribute("src") || ""),img.getAttribute("alt"),base));
export const readBluesky = (doc: Document, target: PlatformTarget): PlatformRead => {
  const entry = pageRecords(doc, target.id.split("/").pop()!, "application/ld+json")
    .find((value) => value["@type"] === "DiscussionForumPosting" && sameTarget(value.url, target));
  const liveCard = socialPostCard(doc, target);
  if (!liveCard) return { ok: false, reason: "unreadable" };
  const card = platformReadableCopy(liveCard);
  const owns = (node: Element) => node.closest('[data-testid^="postThreadItem-by-"], [data-testid^="feedItem-by-"]') === card;
  const post = Array.from(card.querySelectorAll('[data-testid="contentHider-post"]')).find(owns) || card;
  const body = Array.from(post.querySelectorAll('[data-testid="postText"], [data-word-wrap="1"]'))
    .find((node)=>owns(node) && !node.closest(BLUESKY_QUOTE_SELECTOR));
  if (post.closest('[hidden], [aria-hidden="true"]') || body?.closest('[hidden], [aria-hidden="true"]')) return {ok:false,reason:"unreadable"};
  const bodyCopy = body?.cloneNode(true) as Element | undefined;
  bodyCopy?.querySelectorAll('script, style, noscript, template, [hidden], [aria-hidden="true"]')
    .forEach((node)=>node.remove());
  // Rendered text owns the links and readability; SEO text must not restore
  // descendants hidden by the current page, including in the note title.
  const content = bodyCopy?.textContent || "";
  if (!content.trim() && text(entry?.text).trim()) return {ok:false,reason:"unreadable"};
  const copy = post.cloneNode(true) as Element;
  for (const button of Array.from(copy.querySelectorAll('button[aria-label]'))) {
    if (!button.querySelector('img[src*="/img/feed_"][alt]')) continue;
    const badge = button.nextElementSibling as HTMLElement | null;
    if (badge?.style.position === "absolute" && /^(?:ALT|替代文本)$/.test(platformText(badge))
      && !badge.querySelector('img,a,button')) badge.remove();
  }
  copy.querySelectorAll('button, [data-testid="userAvatarImage"], svg').forEach((node)=> {
    if(node.tagName.toLowerCase() === "button" && node.querySelector('img[src*="/img/feed_"]')) node.replaceWith(...Array.from(node.querySelectorAll('img[src*="/img/feed_"]')));
    else node.remove();
  });
  const parts = [bodyCopy ? socialBodyMarkdown(doc,bodyCopy,target.url)
    : content ? plainSocialMarkdown(doc,content,target.url) : ""];
  // Feed cards have no post SEO data; their exact timestamp permalink and
  // visible body are sufficient. A collection count still guards hidden images.
  const visibleImages=blueskyImages(post,target.url);
  const images = Array.isArray(entry?.image) ? entry.image : [];
  if (images.length) for(const url of images) {
    const img=Array.from(post.querySelectorAll("img")).find((item)=>blueskyFullsizeUrl(item.getAttribute("src") || "")===blueskyFullsizeUrl(text(url)) && !item.closest(BLUESKY_QUOTE_SELECTOR));
    if (!img || !imageMarkdown(url,"",target.url)) return {ok:false,reason:"incomplete"};
  }
  parts.push(...visibleImages);
  for (const quote of Array.from(copy.querySelectorAll(BLUESKY_QUOTE_SELECTOR))) {
    for (const img of Array.from(quote.querySelectorAll("img[src]"))) img.setAttribute("src",blueskyFullsizeUrl(img.getAttribute("src") || ""));
    // Link previews wrap a block of image/title/description. Keep the image
    // separately and the complete label inline so Markdown forms a real link.
    for (const link of Array.from(quote.querySelectorAll("a[href]"))) {
      if (!link.querySelector("div")) continue;
      const labelCopy = link.cloneNode(true) as Element;
      for (const block of Array.from(labelCopy.querySelectorAll("div,p"))) block.appendChild(doc.createTextNode(" "));
      const label = platformText(labelCopy);
      if (!label) continue;
      for (const image of Array.from(link.querySelectorAll("img"))) link.parentNode!.insertBefore(image, link);
      link.textContent = label;
    }
    parts.push(platformHtmlMarkdown(quote,target.url));
  }
  const author = text(record(entry?.author)?.name) || Array.from(card.querySelectorAll('a[href]'))
    .filter((a)=>a.getAttribute("href")===`/profile/${target.id.split("/")[0]}` && platformText(a) && !platformText(a).startsWith("@"))
    .map(platformText)[0];
  const saved=result(target,parts.filter(Boolean).join("\n\n"),author,dateTime(entry?.datePublished),content.split("\n")[0] || author);
  if(saved.ok && !saved.clip.publishedAt) {
    const link=ownPostLinks(card,target.platform).find((a)=>sameTarget(postLinkUrl(a,target.url),target));
    saved.clip.publishedAt=publishedTime(link || null);
  }
  return saved;
};

const instagramCardHasMedia = (card: Element, base: string) => Array.from(card.querySelectorAll('img[src], video')).some(media => {
  if (platformElementHidden(media)) return false;
  const link = media.closest('a[href]');
  return !link || platformTarget(postLinkUrl(link, base))?.platform === "instagram";
});

/** Bound Meta posts by their timestamp header and rendered action controls. */
export const metaPostCard = (link: Element, platform: string, base: string): Element | null => {
  if (!link.querySelector("time[datetime]") || link.closest("[hidden], [aria-hidden='true'], script, style, template")) return null;
  const target = platformTarget(postLinkUrl(link,base));
  if (!target || target.platform !== platform) return null;
  const pressable = platform === 'threads' ? link.closest('[data-pressable-container]') : null;
  let card = link.parentElement;
  for (let depth=0; card && depth<12; depth++,card=card.parentElement) {
    if (card.matches('main, [role="main"], [role="region"], [role="dialog"], body')) break;
    const timestamps = Array.from(card.querySelectorAll('a[href]')).filter((a)=>a.querySelector('time[datetime]')
      && (!pressable || a.closest('[data-pressable-container]') === pressable)
      && (!a.closest('article, [role="article"]') || a.closest('article, [role="article"]') === card));
    if (timestamps.some((a)=> {
      const other=platformTarget(postLinkUrl(a,base));
      return other?.platform === platform && other.id !== target.id;
    })) break;
    const profile = Array.from(card.querySelectorAll('a[href]')).some((a)=> {
      try {
        const url=new URL(postLinkUrl(a,base));
        return socialPlatform(url.href) === platform && (platform === "threads" ? /^\/@[^/]+\/?$/.test(url.pathname) : /^\/[^/]+\/?$/.test(url.pathname));
      } catch { return false; }
    });
    // Instagram's detail timestamp lives in the action footer. Keep walking
    // until the card also contains the media, rather than returning that footer.
    if (card.matches('article, [role="article"]') || (profile && card.querySelectorAll('button, [role="button"]').length >= 3
      && (platform !== "instagram" || instagramCardHasMedia(card, base)))) return card;
  }
  return null;
};

const readableMetaCard = (doc: Document, target: PlatformTarget, captions: string[]): Element | null => {
  const expected = captions.map((caption) => caption.replace(/\s+/g,"")).filter(Boolean);
  for (const link of Array.from(doc.querySelectorAll("a[href]"))) {
    if (!sameTarget(postLinkUrl(link,target.url),target)) continue;
    const card = metaPostCard(link,target.platform,target.url);
    if (!card) continue;
    const copy=platformReadableCopy(card);
    copy.querySelectorAll("script, style, template, article, [role='article'], [hidden], [aria-hidden='true']").forEach((node)=>node.remove());
    if (target.platform === 'threads') Array.from(copy.querySelectorAll('[data-pressable-container]')).forEach(node=>node.remove());
    // Threads shortens visible URL labels; its card's href retains the destination.
    if (target.platform === 'threads') for (const a of Array.from(copy.querySelectorAll('a[href]'))) {
      let href=safePlatformUrl(a.getAttribute('href') || '',target.url);
      if (href) {
        const url=new URL(href);
        if (url.origin === 'https://l.threads.com' && url.pathname === '/') {
          href=safePlatformUrl(url.searchParams.get('u') || '',target.url);
        }
      }
      const label=[href,href.replace(/^https?:\/\//,'')].find((value)=>value && expected.some((caption)=>caption.includes(value)));
      if (label) a.textContent=label;
    }
    const visibleText = platformText(copy).replace(/\s+/g,"");
    if (expected.length ? expected.some((caption) => visibleText.includes(caption)) : !!copy.querySelector("img[src], video")) return card;
  }
  return null;
};

const metaMedia = (doc: Document, target: PlatformTarget) => {
  const code = target.id.split("/").pop()!;
  return pageRecords(doc, code).find((item) => item.code === code
    && (item.caption !== undefined || item.image_versions2 !== undefined || item.carousel_media !== undefined));
};
const mediaImages = (item: RecordValue, base: string): string[] | null => {
  const carousel = item.carousel_media;
  if (item.media_type === 8 && (!Array.isArray(carousel) || !carousel.length)) return null;
  if (typeof item.carousel_media_count === "number" && (!Array.isArray(carousel) || carousel.length !== item.carousel_media_count)) return null;
  const images: string[] = [];
  for (const value of Array.isArray(carousel) ? carousel : [item]) {
    const media = record(value);
    if (!media) return null;
    const candidates = record(media.image_versions2)?.candidates;
    const valid = Array.isArray(candidates) ? candidates.map(record).filter((entry): entry is RecordValue => !!entry)
      .filter((entry) => safePlatformUrl(text(entry.url), base)).sort((a,b) =>
        (typeof b.width === "number" ? b.width : 0) * (typeof b.height === "number" ? b.height : 0)
        - (typeof a.width === "number" ? a.width : 0) * (typeof a.height === "number" ? a.height : 0)) : [];
    const url = valid[0]?.url || media.display_uri;
    if (media.media_type !== 19 && !url && media.media_type !== 2) return null;
    if (url) images.push(imageMarkdown(url, media.accessibility_caption, base));
  }
  return images.filter(Boolean);
};
export const instagramPostCard = (doc: Document, target: PlatformTarget): Element | null => {
  if (target.platform !== "instagram") return null;
  for (const link of ownPostLinks(doc.documentElement, "instagram")) {
    if (!sameTarget(postLinkUrl(link, target.url), target)) continue;
    const card = metaPostCard(link, "instagram", target.url);
    if (card && !platformElementHidden(card) && instagramCardHasMedia(card, target.url)) return card;
  }
  return null;
};

export const readMetaSocial = (doc: Document, target: PlatformTarget, detail?: Document): PlatformRead => {
  const media = metaMedia(detail || doc, target);
  if (!media) return { ok: false, reason: "unreadable" };
  const username = text(record(media.user)?.username);
  if (target.platform === "threads" && username && username.toLowerCase() !== target.id.split("/")[0]) return { ok:false, reason:"changed" };
  let caption = text(record(media.caption)?.text);
  // A visible slide establishes readability; preserve all loaded slide captions.
  const captions = [caption];
  if (target.platform === "instagram" && Array.isArray(media.carousel_media)) {
    captions.push(...media.carousel_media.map((slide) => text(record(record(slide)?.caption)?.text)));
  }
  // A fetched, identity-matched detail supplies the full caption for a visible
  // feed preview. Do not require that preview to contain the untruncated text.
  if (detail ? !instagramPostCard(doc, target) : !readableMetaCard(doc,target,captions)) return {ok:false,reason:"unreadable"};
  const slides = Array.from(new Set(captions.slice(1).filter(Boolean)));
  const combined = slides.join("\n\n");
  const normalized = (value: string) => value.replace(/\s+/g,"");
  if (combined && normalized(combined).startsWith(normalized(caption))) caption = combined;
  else for (const slide of slides) if (!normalized(caption).includes(normalized(slide))) caption += `${caption ? "\n\n" : ""}${slide}`;
  const images = mediaImages(media, target.url);
  if (!images) return { ok: false, reason: "incomplete" };
  const parts = [caption ? plainSocialMarkdown(doc, caption, target.url) : "", ...images];
  if (target.platform === "threads") {
    const info = record(media.text_post_app_info);
    if (info?.is_post_unavailable || info?.post_tombstone_info) return {ok:false, reason:"unreadable"};
    const share = record(info?.share_info);
    const quote = record(share?.quoted_post || share?.quoted_attachment_post);
    if (quote) {
      const quoteUser = text(record(quote.user)?.username), quoteCode = text(quote.code);
      const quoteImages = mediaImages(quote, target.url);
      const quoteText = text(record(quote.caption)?.text);
      if (!quoteUser || !quoteCode || !quoteImages || (!quoteText && !quoteImages.length)) return {ok:false, reason:"incomplete"};
      const quoteUrl = `https://www.threads.com/@${quoteUser}/post/${quoteCode}`;
      parts.push(`[${markdownText(quoteUser)}](${markdownUrl(quoteUrl)})`, plainSocialMarkdown(doc, quoteText, target.url), ...quoteImages);
    }
    const preview = record(info?.link_preview_attachment);
    if (preview) {
      const url = safePlatformUrl(text(preview.url),target.url);
      if (url) parts.push(`[${markdownText(text(preview.title) || url)}](${markdownUrl(url)})`);
    }
  }
  return result(target, parts.filter(Boolean).join("\n\n"), username, epochTime(media.taken_at), caption.split("\n")[0] || username);
};

export const facebookExpandButton = (card: Element | null) => card
  ? Array.from(card.querySelectorAll<HTMLElement>('[data-ad-preview="message"] [role="button"], [data-ad-preview="message"] button, [data-ad-comet-preview="message"] [role="button"]'))
    .find((button) => !platformElementHidden(button) && /^(?:See more|展开|查看更多|もっと見る|Zobacz więcej)$/i.test(platformText(button))) : undefined;

export const readFacebook = (doc: Document, target: PlatformTarget): PlatformRead => {
  const liveCard = socialPostCard(doc, target);
  if (!liveCard) return {ok:false, reason:"unreadable"};
  if (facebookExpandButton(liveCard)) return {ok:false, reason:"incomplete"};
  const card = platformReadableCopy(liveCard);
  const ownBody=(root: Element)=>Array.from(root.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"]'))
    .find((node)=>node.closest('[role="article"], article') === root);
  const body = ownBody(card);
  const liveBody=ownBody(liveCard);
  if (platformText(liveBody) && !platformText(body)) return {ok:false,reason:"unreadable"};
  if (body?.closest('[hidden], [aria-hidden="true"]')) return {ok:false,reason:"unreadable"};
  const ids = facebookTargetIds(doc, target);
  const records = [...ids].flatMap(id => pageRecords(doc, id));
  const story = records.find((item) => item.__typename === "Story"
    && (ids.has(platformTarget(text(item.permalink_url || item.url))?.id || "") || ids.has(text(item.post_id))));
  const contentStory=record(record(record(story?.comet_sections)?.content)?.story);
  if (!platformText(body) && text(record(contentStory?.message)?.text).trim()) return {ok:false,reason:"unreadable"};
  const cleanBody = body?.cloneNode(true) as Element | undefined;
  for (const button of Array.from(cleanBody?.querySelectorAll('button, [role="button"]') || [])) {
    if (/^(?:收起|See less)$/i.test(platformText(button))) button.remove();
  }
  for (const emoji of Array.from(cleanBody?.querySelectorAll('img[src*="/images/emoji.php"]') || [])) emoji.replaceWith(doc.createTextNode(emoji.getAttribute("alt") || ""));
  const parts = [cleanBody ? socialBodyMarkdown(doc,cleanBody,target.url) : ""];
  const copy = card.cloneNode(true) as Element;
  copy.querySelectorAll('[role="article"], article, [role="toolbar"], [data-ad-preview="message"], [data-ad-comet-preview="message"]').forEach((node)=>node.remove());
  const seen = new Set<string>();
  for (const img of Array.from(copy.querySelectorAll("img"))) {
    const url = safePlatformUrl(img.getAttribute("src") || "", target.url);
    if (!url || !/\.fbcdn\.net\//.test(url) || !/\/v\//.test(url) || seen.has(url)) continue;
    seen.add(url); parts.push(imageMarkdown(url, img.getAttribute("alt"), target.url));
  }
  // Page-declared photos verify the rendered attachment; they cannot restore
  // a missing or hidden image. CDN resize/signature queries do not change it.
  const photos = new Set<string>();
  const photoIdentity = (value: string) => {
    const safe=safePlatformUrl(value,target.url);
    return safe ? new URL(safe).pathname : "";
  };
  const collectPhotos = (value: unknown) => {
    const obj=record(value);
    if (!obj) { if(Array.isArray(value)) value.forEach(collectPhotos); return; }
    const uri=text(record(obj.photo_image)?.uri);
    if (uri) photos.add(photoIdentity(uri));
    Object.values(obj).forEach(collectPhotos);
  };
  collectPhotos(story?.attachments);
  if (Array.from(photos).some(photo=>!Array.from(seen).some(url=>photoIdentity(url)===photo))) return {ok:false,reason:"incomplete"};
  // A hidden remainder of a photo collection must not be called complete.
  if (Array.from(copy.querySelectorAll("a, [role='button']")).some((node)=>/^\+\d+$/.test(platformText(node)))) return {ok:false, reason:"incomplete"};
  const actor = Array.isArray(story?.actors) ? record(story.actors[0]) : undefined;
  const author = text(actor?.name) || platformText(card.querySelector('h2 a, h3 a, strong a'));
  const saved = result(target,parts.filter(Boolean).join("\n\n"),author,epochTime(story?.creation_time),platformText(cleanBody).slice(0,100) || author);
  if (saved.ok && !saved.clip.publishedAt) {
    const link = ownPostLinks(card,target.platform).find((a)=>ids.has(platformTarget(postLinkUrl(a,target.url))?.id || ""));
    saved.clip.publishedAt = publishedTime(link?.querySelector("time, abbr") || link || null);
  }
  return saved;
};

export const linkedinExpandButton = (card: Element | null) => card
  ? Array.from(card.querySelectorAll<HTMLElement>('button.see-more, .feed-shared-inline-show-more-text__see-more-less-toggle, [data-test-id="show-more-less-text__button"]'))
    .find((button)=>!platformElementHidden(button) && button.getAttribute("aria-expanded") !== "true"
      && !/^(?:See less|Show less|收起|折りたたむ|Zobacz mniej)$/i.test(platformText(button))) : undefined;
const linkedinBodyMarkdown = (doc: Document, body: Element, base: string) => {
  const clean = body.cloneNode(true) as Element;
  for (const link of Array.from(clean.querySelectorAll('a[href]'))) {
    const safe = safePlatformUrl(link.getAttribute('href') || '',base);
    if (!safe) { link.removeAttribute('href'); continue; }
    const url = new URL(safe);
    let destination = safe;
    if (url.hostname.endsWith('.linkedin.com') || url.hostname === 'linkedin.com') {
      if (['/safety/go/', '/redir/redirect'].includes(url.pathname)) destination = safePlatformUrl(url.searchParams.get('url') || '',base);
      else if ((url.pathname === '/search/results/all/' || (url.pathname === '/signup/cold-join'
        && /^https:\/\/www\.linkedin\.com\/feed\/hashtag\/[\w-]+$/.test(url.searchParams.get('session_redirect') || '')))
        && /^#\S+$/.test(platformText(link))) {
        destination = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(platformText(link))}`;
      } else if (/^\/company\/[^/]+\/?$/.test(url.pathname)) {
        destination = `https://www.linkedin.com${url.pathname.replace(/\/$/,'')}/`;
      }
    }
    if (destination) link.setAttribute('href',destination); else link.removeAttribute('href');
    // LinkedIn adds bold styling to link labels in SDUI, not in public cards.
    for (const strong of Array.from(link.querySelectorAll('strong'))) strong.replaceWith(...Array.from(strong.childNodes));
  }
  // Public cards use text newlines; SDUI uses <br>. Feed both to Turndown alike.
  return socialBodyMarkdown(doc,clean,base);
};
export const readLinkedin = (doc: Document, target: PlatformTarget): PlatformRead => {
  const liveCard = socialPostCard(doc,target);
  if (!liveCard) return {ok:false,reason:"unreadable"};
  const card = platformReadableCopy(liveCard);
  // A guest card declares both the UGC attribution and its public activity URN.
  // Its JSON-LD uses the activity ID even when the requested URL uses the UGC ID.
  const cardTarget = linkedinCardTarget(card) || target;
  const schema = pageRecords(doc,cardTarget.id,"application/ld+json").find((item)=>item["@type"] === "SocialMediaPosting"
    && (sameTarget(item["@id"] || item.url,target) || sameTarget(item["@id"] || item.url,cardTarget)));
  const sduiBody = Array.from(card.querySelectorAll('[id^="translatable-commentary-"] [data-testid="expandable-text-box"]'))
    .find((node) => node.closest(LINKEDIN_CARD_SELECTOR) === card);
  const ownBody=(root: Element)=>Array.from(root.querySelectorAll('[data-test-id="main-feed-activity-card__commentary"], .feed-shared-update-v2__description .update-components-text, .feed-shared-text, [id^="translatable-commentary-"] [data-testid="expandable-text-box"]'))
    .find((node)=>node.closest(LINKEDIN_CARD_SELECTOR) === root);
  const body = ownBody(card);
  if (body?.closest('[hidden], [aria-hidden="true"]')) return {ok:false,reason:"unreadable"};
  if (!schema && linkedinExpandButton(card)) return {ok:false,reason:"incomplete"};
  const fullText = text(schema?.articleBody);
  if (fullText.trim() && !platformText(body)) return {ok:false,reason:"unreadable"};
  const liveBody = ownBody(liveCard);
  const domMarkdown = body ? linkedinBodyMarkdown(doc,body,target.url) : '';
  const normalize = (value: string) => value.replace(/\s+/g,' ').trim();
  const completeBody = body && (!fullText || normalize(body.textContent || '') === normalize(fullText));
  if (!completeBody && fullText && body && platformText(liveBody) !== platformText(body)) return {ok:false,reason:"incomplete"};
  const parts = [completeBody ? domMarkdown : (fullText ? linkedinBodyMarkdown(doc,paragraphs(doc,fullText),target.url) : domMarkdown)];
  if (schema && Array.isArray(schema.image)) {
    const visibleImages=card.querySelectorAll('[data-test-id="feed-images-content__list-item"] img');
    const remainder=Number(platformText(card.querySelector('[data-test-id="feed-images-content__overlay"]')).replace(/^\+/,"")) || 0;
    if (schema.image.length < visibleImages.length + remainder) return {ok:false,reason:"incomplete"};
    for (const img of schema.image) {
      const markdown=imageMarkdown(record(img)?.url || img,"",target.url);
      if (!markdown) return {ok:false,reason:"incomplete"};
      parts.push(markdown);
    }
  } else {
    const media = card.querySelector('[data-testid="carousel-container"]');
    const sduiImages = media?.querySelectorAll('[data-testid="carousel-child-container"] img') || [];
    let count: RegExpExecArray | null = null;
    for (let node=media,depth=0;node && node !== card && depth<4;node=node.parentElement,depth++) {
      count = /(?:^|\s)[1-9]\d*\s*\/\s*([1-9]\d*)(?:$|\s)/.exec(platformText(node));
      if (count) break;
    }
    if (count && sduiImages.length < Number(count[1])) return {ok:false,reason:"incomplete"};
    for (const img of Array.from(card.querySelectorAll('.update-components-image img, [data-test-id="feed-images-content"] img, [data-testid="carousel-child-container"] img'))) {
      const markdown=imageMarkdown(img.getAttribute("src") || img.getAttribute("data-delayed-url"),img.getAttribute("alt"),target.url);
      if (!markdown) return {ok:false,reason:"incomplete"};
      parts.push(markdown);
    }
    if (card.querySelector('[data-test-id="feed-images-content__overlay"]')) return {ok:false,reason:"incomplete"};
  }
  const sduiHeader = sduiBody?.closest('[id^="translatable-commentary-"]')?.parentElement?.previousElementSibling;
  const own = (selector: string) => Array.from(card.querySelectorAll(selector)).find(node => node.closest(LINKEDIN_CARD_SELECTOR) === card);
  const actor = sduiHeader || own('.update-components-actor, [data-test-id="main-feed-activity-card__entity-lockup"]');
  const actorLinks = Array.from(actor?.querySelectorAll('a[href]') || []).filter(link =>
    link.closest(LINKEDIN_CARD_SELECTOR) === card && platformText(link));
  const person = actorLinks.find(link => {
    const url = safePlatformUrl(link.getAttribute('href') || '', target.url);
    return url && /(^|\.)linkedin\.com$/.test(new URL(url).hostname) && new URL(url).pathname.startsWith("/in/");
  });
  const author = text(record(schema?.author)?.name) || platformText(own('.update-components-actor__title, [data-tracking-control-name="public_post_feed-actor-name"]'))
    || platformText(person?.querySelector('p') || person) || actorLinks.map(platformText).find(Boolean);
  const metadata = Array.from(sduiHeader?.querySelectorAll('p') || []).filter(node =>
    !node.closest('a, button') && node.closest(LINKEDIN_CARD_SELECTOR) === card);
  // SDUI inserts connection degree and professional headline before the time.
  // Recognize the complete time label, rather than taking a paragraph by index.
  const isTime = (node: Element) => /^(?:\d+\s*(?:s|m|h|d|w|mo|yr|seconds?|minutes?|hours?|days?|weeks?|months?|years?)(?:\s+ago)?|\d+\s*(?:秒|分钟|分鐘|小时|小時|天|周|週|个月|個月|年|時間|日|週間|か月|ヶ月|カ月)前|\d+\s*(?:sek\.|min|godz\.|dni|tyg\.|mies\.|lat)(?:\s+temu)?)(?:\s*[•·].*)?$/i.test(platformText(node));
  const timeNode = metadata.find(isTime);
  const headline = person ? platformText(Array.from(actor?.querySelectorAll('.update-components-actor__description, .feed-shared-actor__description') || []).find(node => node.closest(LINKEDIN_CARD_SELECTOR) === card)
    || metadata.find(node => node !== timeNode && !/followers|关注者|關注者|フォロワー|obserwuj/i.test(platformText(node)))) : '';
  if (!parts.some((part)=>part.trim())) return {ok:false,reason:"unreadable"};
  const saved = result(target,parts.filter(Boolean).join("\n\n"),author,dateTime(schema?.datePublished),text(schema?.headline) || fullText.split("\n")[0] || (sduiBody ? parts[0].split("\n")[0].slice(0,100) : platformText(body).slice(0,100)) || author);
  if (saved.ok) {
    if (headline) saved.clip.authorHeadline = headline;
    saved.clip.publishedAt ||= publishedTime(own('time, .update-components-actor__sub-description') || timeNode || null);
  }
  return saved;
};

/** Bind Notes to the requested card and its own header, excluding the feed and replies. */
export const readSubstackNote = (doc: Document, target: PlatformTarget): PlatformRead => {
  const [handle, noteId] = target.id.split("/");
  const selector = '[class*="feedPermalinkUnit-"], [data-entity-key]';
  const candidates = [...Array.from(doc.querySelectorAll('[class*="feedPermalinkUnit-"]')),
    ...Array.from(doc.querySelectorAll(`[data-entity-key="${noteId}"]`))];
  let card: Element | undefined, body: Element | undefined;
  for(const candidate of candidates) {
    if(candidate.hasAttribute('data-entity-key') && candidate.getAttribute('data-entity-key') !== noteId) continue;
    const copy=platformReadableCopy(candidate);
    const ownBody=Array.from(copy.querySelectorAll('.ProseMirror')).find(node=>node.closest(selector) === copy && platformText(node));
    if(!ownBody) continue;
    if(Array.from(copy.querySelectorAll('a[href]')).some(link=>
      !link.closest('.ProseMirror') && link.closest(selector) === copy && sameTarget(postLinkUrl(link,target.url),target))) {card=copy;body=ownBody;break;}
  }
  if(!card || !body) return {ok:false,reason:'unreadable'};
  const headerLink = Array.from(card.querySelectorAll('a[href]')).find((link)=>
    !link.closest('.ProseMirror') && link.closest(selector) === card && sameTarget(postLinkUrl(link,target.url),target));
  if (!headerLink) return { ok:false, reason:"unreadable" };
  if (card.querySelector('[class*="seeMore"], [class*="readMore"], [data-testid="read-more"]')) return { ok:false, reason:"incomplete" };
  const entry = pageRecords(doc,noteId,"application/ld+json").find((item)=>
    item["@type"] === "SocialMediaPosting" && item.identifier === noteId && sameTarget(item.url,target));
  // The sampled JSON-LD escapes Unicode and newlines a second time. It is a
  // completeness check, not a source of text hidden by the current page.
  const completeText = text(entry?.text).replace(/\\u([0-9a-f]{4})|\\([nrt"\\])/gi,(_match,unicode,escape)=>
    unicode ? String.fromCharCode(parseInt(unicode,16)) : ({n:"\n",r:"\r",t:"\t",'"':'"',"\\":"\\"} as Record<string,string>)[escape]);
  if (completeText && completeText.replace(/\s+/g," ").trim() !== Array.from(body.children).map(platformText).join(" ").replace(/\s+/g," ").trim()) return { ok:false, reason:"incomplete" };
  const author = Array.from(card.querySelectorAll('a[href]')).find((link)=> {
    if (link.closest('.ProseMirror') || link.closest(selector) !== card || !platformText(link)) return false;
    try { const url=new URL(postLinkUrl(link,target.url)); return ["substack.com","www.substack.com"].includes(url.hostname) && url.pathname.replace(/\/$/,"") === `/@${handle}`; } catch { return false; }
  });
  const parts = [platformHtmlMarkdown(body,target.url)];
  for (const img of Array.from(card.querySelectorAll('img'))) {
    if (body.contains(img) || img.closest(selector) !== card || img.closest('[hidden], [aria-hidden="true"]')) continue;
    const link = img.closest('a[href]');
    if (link) {
      try { if (/^\/@[^/]+\/?$/.test(new URL(postLinkUrl(link,target.url)).pathname)) continue; } catch { continue; }
    }
    const markdown = imageMarkdown(img.getAttribute('src'),img.getAttribute('alt'),target.url);
    if (!markdown) return { ok:false, reason:"incomplete" };
    parts.push(markdown);
  }
  return result(target,parts.filter(Boolean).join("\n\n"),platformText(author) || text(record(entry?.author)?.name),
    dateTime(entry?.datePublished) || publishedTime(headerLink),platformText(author) ? `${platformText(author)} · Substack Note` : undefined);
};

export const readSocial = (doc: Document, target: PlatformTarget): PlatformRead => {
  switch(target.platform) {
    case "bluesky": return readBluesky(doc,target);
    case "substack-note": return readSubstackNote(doc,target);
    case "instagram": case "threads": return readMetaSocial(doc,target);
    case "facebook": return readFacebook(doc,target);
    case "linkedin": return readLinkedin(doc,target);
    default: return {ok:false,reason:"not-target"};
  }
};
