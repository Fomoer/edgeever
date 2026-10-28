import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const previousClipboardFolders = new Map();

export const MAX_FILE_CLIPBOARD_BYTES = 32 * 1024 * 1024;

const clipboardBytes = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value && value.type === "Buffer" && Array.isArray(value.data)) return Uint8Array.from(value.data);
  throw new TypeError("Clipboard file must be bytes");
};

const clipboardFilename = (value) => {
  if (typeof value !== "string") throw new TypeError("Clipboard filename must be a string");
  const base = value.split(/[\\/]/).pop() ?? "";
  // oxlint-disable-next-line no-control-regex -- strips control characters from clipboard filenames
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\.+$/, "").trim().slice(0, 180);
  return cleaned || "attachment";
};

const removeFolder = async (folder) => {
  if (!folder) return;
  await rm(folder, { recursive: true, force: true }).catch(() => undefined);
};

// Electron maps text/uri-list onto the native copied-file clipboard
// (NSFilenamesPboardType, CF_HDROP, or text/uri-list), so Finder, Explorer,
// and chat apps can paste the attachment. The file has to stay on disk until
// the next copy replaces it.
export const writeFileClipboard = async (clipboard, ClipboardItem, input, options = {}) => {
  const bytes = clipboardBytes(input?.bytes);
  const filename = clipboardFilename(input?.filename);
  const maxBytes = options.maxBytes ?? MAX_FILE_CLIPBOARD_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return false;
  if (typeof options.directory !== "string" || !options.directory) {
    throw new TypeError("Clipboard file directory is required");
  }

  const folder = join(options.directory, randomBytes(8).toString("hex"));
  const path = join(folder, filename);
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(path, bytes);
    const uriList = `${pathToFileURL(path).href}\r\n`;
    await clipboard.write([new ClipboardItem({ "text/uri-list": uriList })]);
    if (!await clipboard.has("text/uri-list")) {
      await removeFolder(folder);
      return false;
    }
  } catch (error) {
    await removeFolder(folder);
    if (error instanceof TypeError) throw error;
    return false;
  }

  const previous = previousClipboardFolders.get(options.directory);
  previousClipboardFolders.set(options.directory, folder);
  if (previous && previous !== folder) await removeFolder(previous);
  return true;
};

export const writeTextClipboard = async (clipboard, value) => {
  if (typeof value !== "string") {
    throw new TypeError("Clipboard value must be a string");
  }

  await clipboard.writeText(value);
  return await clipboard.readText() === value;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_IMAGE_CLIPBOARD_BYTES = 32 * 1024 * 1024;

const pngBytes = (value) => {
  let bytes = null;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (value && value.type === "Buffer" && Array.isArray(value.data)) bytes = Uint8Array.from(value.data);
  else throw new TypeError("Clipboard image must be PNG bytes");

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_CLIPBOARD_BYTES) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }
  return bytes;
};

export const writeImageClipboard = async (clipboard, ClipboardItem, value) => {
  const bytes = pngBytes(value);
  if (!bytes) return false;

  await clipboard.write([new ClipboardItem({
    "image/png": new Blob([bytes], { type: "image/png" }),
  })]);
  return await clipboard.has("image/png");
};

export const writeRichClipboard = async (clipboard, ClipboardItem, input) => {
  const html = input?.html;
  const plainText = input?.plainText;
  if (typeof html !== "string" || typeof plainText !== "string") {
    throw new TypeError("Clipboard HTML and plain text must be strings");
  }

  await clipboard.write([new ClipboardItem({
    "text/html": html,
    "text/plain": plainText,
  })]);
  const [copiedText, hasHtml] = await Promise.all([
    clipboard.readText(),
    clipboard.has("text/html"),
  ]);
  return copiedText === plainText && hasHtml;
};
