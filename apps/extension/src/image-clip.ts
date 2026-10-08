export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type PageImageRead =
  | { ok: true; mimeType: string; base64: string; byteSize: number; alt: string }
  | { ok: false; reason: "too-large" | "unsupported" | "unreadable" | "empty" };

export type StoredImage = {
  mimeType: string;
  bytes: Uint8Array;
};

export type StoredImageFailure = {
  error: "empty" | "too-large" | "unsupported" | "unreadable";
};

const PAGE_IMAGE_FAILURES = new Set(["too-large", "unsupported", "unreadable", "empty"]);

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value);

export const sniffImageMimeType = (bytes: Uint8Array) => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46])) return "image/gif";
  if (
    bytes.length >= 12
    && startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
};

export const isPageImageRead = (value: unknown): value is PageImageRead => {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    ok?: unknown;
    mimeType?: unknown;
    base64?: unknown;
    byteSize?: unknown;
    alt?: unknown;
    reason?: unknown;
  };
  if (record.ok === true) {
    return typeof record.mimeType === "string"
      && typeof record.base64 === "string"
      && typeof record.byteSize === "number"
      && typeof record.alt === "string";
  }
  return record.ok === false && typeof record.reason === "string" && PAGE_IMAGE_FAILURES.has(record.reason);
};

export const imageFromBytes = (bytes: Uint8Array, reportedType: string): StoredImage | StoredImageFailure => {
  if (bytes.byteLength === 0) return { error: "empty" };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: "too-large" };
  const reported = reportedType.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalized = reported === "image/jpg" ? "image/jpeg" : reported;
  const mimeType = SUPPORTED_IMAGE_MIME_TYPES.has(normalized) ? normalized : sniffImageMimeType(bytes);
  if (!mimeType) return { error: "unsupported" };
  return { mimeType, bytes };
};

export const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const imageFromBase64 = (
  base64: string,
  reportedType: string,
  declaredSize?: number,
): StoredImage | StoredImageFailure => {
  if (typeof declaredSize === "number" && declaredSize > MAX_IMAGE_BYTES) return { error: "too-large" };
  try {
    return imageFromBytes(base64ToBytes(base64), reportedType);
  } catch {
    return { error: "unreadable" };
  }
};

export const preferredImageUrls = (srcUrl: string) => {
  if (!srcUrl) return [];
  const ordered: string[] = [];
  const push = (value: string) => {
    if (value && !ordered.includes(value)) ordered.push(value);
  };

  try {
    const url = new URL(srcUrl);
    const host = url.hostname.toLowerCase();
    if (host === "pbs.twimg.com" || host.endsWith(".twimg.com")) {
      const name = url.searchParams.get("name");
      if (name && name !== "orig") {
        const original = new URL(url);
        original.searchParams.set("name", "orig");
        push(original.toString());
      }
      if (name && name !== "orig" && name !== "large") {
        const large = new URL(url);
        large.searchParams.set("name", "large");
        push(large.toString());
      }
      const sized = url.pathname.match(/:(small|medium|large|thumb|orig)$/i);
      if (sized && sized[1]?.toLowerCase() !== "orig") {
        const original = new URL(url);
        original.pathname = url.pathname.replace(/:(small|medium|large|thumb|orig)$/i, ":orig");
        push(original.toString());
      }
    }
  } catch {
    return [srcUrl];
  }

  push(srcUrl);
  return ordered;
};

export const imageOriginPattern = (srcUrl: string) => {
  try {
    const url = new URL(srcUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
};

export const imageHostName = (srcUrl: string) => {
  try {
    const url = new URL(srcUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.hostname;
  } catch {
    return "";
  }
};

export const filenameForImage = (srcUrl: string, mimeType: string) => {
  const extension = EXTENSION_BY_MIME[mimeType] ?? "img";
  let stem = "image";
  try {
    const url = new URL(srcUrl);
    const base = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const withoutSize = base.replace(/:(small|medium|large|thumb|orig)$/i, "");
    const withoutExtension = withoutSize.replace(/\.[a-z0-9]{2,5}$/i, "");
    const safe = withoutExtension.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    if (safe) stem = safe;
  } catch {
    // data: and blob: URLs keep the generic file name.
  }
  return `${stem}.${extension}`;
};

export const noteTitleForImage = (pageTitle: string, alt: string, fallback: string) => {
  const candidate = pageTitle.replace(/\s+/g, " ").trim()
    || alt.replace(/\s+/g, " ").trim()
    || fallback;
  return candidate.slice(0, 160);
};

export const imageAltText = (alt: string, fallback: string) => {
  const cleaned = alt.replace(/[\r\n\]]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
};

const escapeMarkdownLabel = (value: string) =>
  value.replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

const escapeMarkdownText = (value: string) =>
  value.replace(/[\r\n]+/g, " ").replace(/[\\[\]*`]/g, (char) => `\\${char}`);

const markdownDestination = (value: string) =>
  value.replace(/\\/g, "%5C").replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");

const GOOGLE_SEARCH_PATHS = new Set(["/search", "/imgres"]);

// A Google results tab URL is mostly viewer state and tracking tokens.
// The useful part is that the image was found there, plus the search keyword.
export const googleSearchKeyword = (pageUrl: string) => {
  try {
    const url = new URL(pageUrl);
    const host = url.hostname.toLowerCase();
    const googleSearch = /(^|\.)google\./.test(host) && GOOGLE_SEARCH_PATHS.has(url.pathname);
    if (!googleSearch) return null;
    return (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return null;
  }
};

export const imageFromDataUrl = (value: string): StoredImage | StoredImageFailure | null => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  return imageFromBase64(match[2].replace(/\s+/g, ""), match[1]);
};

export const imageSourceMarkdown = (input: {
  pageUrl: string;
  capturedAt: string;
  sourceLabel: string;
  capturedAtLabel: string;
  googleSearchLabel: string;
  keywordLabel: string;
}) => {
  const keyword = googleSearchKeyword(input.pageUrl);
  const sourceLine = keyword === null
    ? `${input.sourceLabel}: [${escapeMarkdownLabel(input.pageUrl)}](${markdownDestination(input.pageUrl)})`
    : keyword
      ? `${input.sourceLabel}: ${input.googleSearchLabel}\n${input.keywordLabel}: ${escapeMarkdownText(keyword)}`
      : `${input.sourceLabel}: ${input.googleSearchLabel}`;
  return [sourceLine, "", `${input.capturedAtLabel}: ${input.capturedAt}`].join("\n");
};

export const imageMemoMarkdown = (input: {
  resourceId: string;
  alt: string;
  altFallback: string;
  pageUrl: string;
  capturedAt: string;
  sourceLabel: string;
  capturedAtLabel: string;
  googleSearchLabel: string;
  keywordLabel: string;
}) => [
  `![${imageAltText(input.alt, input.altFallback)}](/api/v1/resources/${encodeURIComponent(input.resourceId)}/blob)`,
  "",
  imageSourceMarkdown(input),
].join("\n");

export type ImageNoteClient = {
  listNotebooks: () => Promise<{ notebooks: Array<{ id: string }> }>;
  createMemo: (body: {
    notebookId: string;
    title: string;
    contentMarkdown: string;
    tags: string[];
  }) => Promise<{ memo: { id: string } }>;
  uploadImage: (
    memoId: string,
    file: { bytes: Uint8Array; mimeType: string; filename: string },
    signal?: AbortSignal,
  ) => Promise<{ id: string }>;
  createEditSession: (memoId: string) => Promise<{
    editSession: { id: string; baseRevision: number; baseContentHash: string };
  }>;
  saveMemo: (
    memoId: string,
    body: {
      editSessionId: string;
      expectedRevision: number;
      expectedContentHash: string;
      contentMarkdown: string;
    },
  ) => Promise<unknown>;
  deleteMemo: (memoId: string) => Promise<unknown>;
  createWithImage: (body: {
    notebookId: string;
    title: string;
    contentMarkdown: string;
    tags: string[];
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{ memoId: string; resourceId: string }>;
};

export const saveCapturedImageNote = async (
  client: ImageNoteClient,
  input: {
    notebookId: string;
    title: string;
    alt: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    pageUrl: string;
    capturedAt: string;
    sourceLabel: string;
    capturedAtLabel: string;
    googleSearchLabel: string;
    keywordLabel: string;
    altFallback: string;
  },
) => {
  let notebookId = input.notebookId;
  if (!notebookId) {
    const listed = await client.listNotebooks();
    notebookId = listed.notebooks[0]?.id ?? "";
  }
  if (!notebookId) throw new Error("no-notebook");

  const contentMarkdown = imageMemoMarkdown({
    ...input,
    resourceId: "EDGEVERRESOURCEID",
  });
  return client.createWithImage({
    notebookId,
    title: input.title,
    contentMarkdown,
    tags: ["web-clip"],
    filename: input.filename,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });
};
