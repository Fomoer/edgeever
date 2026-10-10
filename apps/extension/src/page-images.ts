import { Lexer, marked, type Token } from "marked";
import { filenameForImage, MAX_IMAGE_BYTES, type ImageNoteClient, type StoredImage } from "./image-clip";

// A long article can reference hundreds of images. Keep the extra uploads after
// a clip bounded; the remaining images keep their original addresses.
export const MAX_PAGE_IMAGES = 30;
export const MAX_PAGE_IMAGE_TOTAL_BYTES = 60 * 1024 * 1024;
// The whole copy, from the first download to the rewritten note, finishes
// within this budget so the popup or selection feedback never waits longer.
export const PAGE_IMAGE_BUDGET_MS = 45_000;
// No new download or upload starts after this point; the rest of the budget
// is kept for rewriting the note.
export const PAGE_IMAGE_TRANSFER_BUDGET_MS = 35_000;
export const PAGE_IMAGE_REQUEST_TIMEOUT_MS = 15_000;

export type PageImageRef = {
  /** The image destination as Markdown parses it (escapes resolved). */
  href: string;
  /** The absolute http(s) address used to download the image. */
  url: string;
};

type LocatedImage = {
  href: string;
  title: string | null;
  /** Offset just past the closing `]` of the image label. */
  labelEnd: number;
  end: number;
};

// Code blocks, code spans and raw HTML can contain text that looks like an
// image; they are located only so the search below steps over them.
const STEPPED_OVER_TOKENS = new Set(["code", "codespan", "html"]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Tokens nested in list items and block quotes are lexed without their
// indentation or `>` markers, so their raw text may not appear verbatim.
const findRaw = (markdown: string, raw: string, from: number) => {
  const exact = markdown.indexOf(raw, from);
  if (exact !== -1) return { start: exact, end: exact + raw.length };
  const pattern = new RegExp(raw.split("\n").map(escapeRegExp).join("\\n[ \\t>]*"), "g");
  pattern.lastIndex = from;
  const match = pattern.exec(markdown);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
};

const imageLabelEnd = (source: string) => {
  let depth = 0;
  for (let index = 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
};

const locatePageImages = (markdown: string): LocatedImage[] => {
  const located: LocatedImage[] = [];
  let cursor = 0;
  let lost = false;
  marked.walkTokens(new Lexer().lex(markdown), (token: Token) => {
    if (lost || (token.type !== "image" && !STEPPED_OVER_TOKENS.has(token.type))) return;
    const range = findRaw(markdown, token.raw, cursor);
    if (!range) {
      // Stop rather than guess: images after this point keep their addresses.
      lost = true;
      return;
    }
    cursor = range.end;
    if (token.type !== "image") return;
    const labelEnd = imageLabelEnd(markdown.slice(range.start, range.end));
    if (labelEnd < 0) return;
    located.push({
      href: token.href,
      title: token.title ?? null,
      labelEnd: range.start + labelEnd,
      end: range.end,
    });
  });
  return located;
};

const absoluteImageUrl = (href: string, baseUrl: string) => {
  try {
    const url = new URL(href, baseUrl || undefined);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

export const pageImageRefs = (markdown: string, baseUrl: string, limit = MAX_PAGE_IMAGES): PageImageRef[] => {
  const refs: PageImageRef[] = [];
  const seen = new Set<string>();
  for (const { href } of locatePageImages(markdown)) {
    if (!href || seen.has(href) || href.startsWith("/api/v1/resources/")) continue;
    const url = absoluteImageUrl(href, baseUrl);
    if (!url) continue;
    seen.add(href);
    refs.push({ href, url });
    if (refs.length >= limit) break;
  }
  return refs;
};

export const replacePageImageUrls = (
  markdown: string,
  uploaded: ReadonlyArray<{ href: string; resourceId: string }>,
) => {
  const resources = new Map(uploaded.map((image) => [image.href, image.resourceId]));
  if (resources.size === 0) return markdown;
  let result = markdown;
  for (const image of locatePageImages(markdown).reverse()) {
    const resourceId = resources.get(image.href);
    if (!resourceId) continue;
    const title = image.title ? ` "${image.title.replace(/["\\]/g, "\\$&")}"` : "";
    result = `${result.slice(0, image.labelEnd)}(/api/v1/resources/${encodeURIComponent(resourceId)}/blob${title})${result.slice(image.end)}`;
  }
  return result;
};

/** Settles with `work`, or rejects as soon as `signal` aborts. */
const untilAborted = <T>(work: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });

/** Reads a response body, giving up as soon as it exceeds `maxBytes`. */
export const readBodyWithLimit = async (response: Response, maxBytes: number) => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export type PageImageDownload = (
  image: PageImageRef,
  limits: { maxBytes: number; timeoutMs: number; signal: AbortSignal },
) => Promise<StoredImage | null>;

/**
 * Copies a saved clip's remote images into the note's own resources, then
 * rewrites the note to point at them. The note is already saved before this
 * runs: any image that cannot be downloaded or uploaded keeps its original
 * address, and a failed rewrite leaves the first version untouched.
 *
 * Images are downloaded and uploaded one at a time so at most one is held in
 * memory, and the byte and time limits cover the whole operation.
 */
export const embedPageImages = async (
  client: Pick<ImageNoteClient, "uploadImage" | "createEditSession" | "saveMemo">,
  input: {
    memoId: string;
    markdown: string;
    /** The revision and content hash returned when the note was created. */
    created: { revision: number; contentHash: string };
    images: readonly PageImageRef[];
    download: PageImageDownload;
    budgetMs?: number;
    transferBudgetMs?: number;
  },
) => {
  const total = input.images.length;
  if (total === 0) return { embedded: 0, total };
  const startedAt = Date.now();
  const transferDeadline = startedAt + (input.transferBudgetMs ?? PAGE_IMAGE_TRANSFER_BUDGET_MS);
  const transfers = AbortSignal.timeout(input.transferBudgetMs ?? PAGE_IMAGE_TRANSFER_BUDGET_MS);
  const workflow = AbortSignal.timeout(input.budgetMs ?? PAGE_IMAGE_BUDGET_MS);

  const uploaded: Array<{ href: string; resourceId: string }> = [];
  let remainingBytes = MAX_PAGE_IMAGE_TOTAL_BYTES;
  for (const image of input.images.slice(0, MAX_PAGE_IMAGES)) {
    if (transfers.aborted || remainingBytes <= 0) break;
    try {
      const maxBytes = Math.min(MAX_IMAGE_BYTES, remainingBytes);
      const timeoutMs = Math.min(PAGE_IMAGE_REQUEST_TIMEOUT_MS, transferDeadline - Date.now());
      const file = await untilAborted(input.download(image, { maxBytes, timeoutMs, signal: transfers }), transfers);
      if (!file || file.bytes.byteLength > maxBytes) continue;
      const resource = await untilAborted(client.uploadImage(input.memoId, {
        bytes: file.bytes,
        mimeType: file.mimeType,
        filename: filenameForImage(image.url, file.mimeType),
      }, transfers), transfers);
      remainingBytes -= file.bytes.byteLength;
      if (resource.id) uploaded.push({ href: image.href, resourceId: resource.id });
    } catch {
      // Keep the remote address for this image.
    }
  }
  if (uploaded.length === 0) return { embedded: 0, total };

  try {
    const { editSession } = await untilAborted(client.createEditSession(input.memoId), workflow);
    // Someone edited the note while its images were copied: keep their
    // version instead of writing the clip over it.
    if (editSession.baseRevision !== input.created.revision
      || editSession.baseContentHash !== input.created.contentHash) {
      return { embedded: 0, total };
    }
    await untilAborted(client.saveMemo(input.memoId, {
      editSessionId: editSession.id,
      expectedRevision: editSession.baseRevision,
      expectedContentHash: editSession.baseContentHash,
      contentMarkdown: replacePageImageUrls(input.markdown, uploaded),
    }), workflow);
  } catch {
    return { embedded: 0, total };
  }
  return { embedded: uploaded.length, total };
};

// Runs in the clipped page so same-origin and CORS-enabled images can be read
// with the page's own session when the extension itself cannot fetch them.
// Keep this function free of closures: Chrome serializes it with toString().
export async function readPageImageInPage(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ base64: string; type: string } | null> {
  const deadline = Date.now() + timeoutMs;
  for (const credentials of ["include", "omit"] as const) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    try {
      const response = await fetch(url, { credentials, signal: AbortSignal.timeout(remaining) });
      if (!response.ok) continue;
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) return null;
      if (!response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
      if (size === 0) return null;
      const blob = new Blob(chunks as BlobPart[]);
      const base64 = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => resolve(String(fileReader.result).replace(/^data:[^,]*,/, ""));
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsDataURL(blob);
      });
      return { base64, type: response.headers.get("content-type") ?? "" };
    } catch {
      // Try the next credentials mode, then give up on this image.
    }
  }
  return null;
}
