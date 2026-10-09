import { normalizeAttachmentByteSize } from "@edgeever/shared";

export const MAX_INLINE_DOCX_BYTES = 10 * 1024 * 1024;

export class DocxPreviewTooLargeError extends Error {}

export const isPreviewableDocx = (filename: string, url: string) =>
  /\.docx$/i.test(filename.trim())
  && (url.startsWith("/api/v1/resources/")
    || url.startsWith("edgeever-resource://")
    || url.startsWith("edgeever-staged://"));

const desktopResourceId = (url: string, scheme: "edgeever-resource:" | "edgeever-staged:") => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== scheme) return null;
    const id = parsed.pathname.replace(/^\//, "") || parsed.hostname;
    return id ? decodeURIComponent(id) : null;
  } catch {
    return null;
  }
};

const requireAllowedSize = (size: number) => {
  if (size > MAX_INLINE_DOCX_BYTES) throw new DocxPreviewTooLargeError();
};

export const loadDocxPreviewBytes = async (
  url: string,
  signal?: AbortSignal,
  bridge: Pick<EdgeEverDesktopBridge, "readResource" | "readStagedResource"> | undefined =
    typeof window === "undefined" ? undefined : window.edgeeverDesktop,
): Promise<Uint8Array> => {
  const stagedId = desktopResourceId(url, "edgeever-staged:");
  const resourceId = desktopResourceId(url, "edgeever-resource:");
  if (bridge && (stagedId || resourceId)) {
    const resource = stagedId
      ? await bridge.readStagedResource(stagedId)
      : await bridge.readResource(resourceId!);
    requireAllowedSize(resource.bytes.byteLength);
    return new Uint8Array(resource.bytes);
  }

  if (!url.startsWith("/api/v1/resources/")) throw new Error("Unsupported DOCX resource URL");
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error(`DOCX resource request failed: ${response.status}`);
  const declaredSize = normalizeAttachmentByteSize(response.headers.get("Content-Length"));
  if (declaredSize !== null && declaredSize > MAX_INLINE_DOCX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new DocxPreviewTooLargeError();
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    requireAllowedSize(bytes.byteLength);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      requireAllowedSize(byteLength);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};
