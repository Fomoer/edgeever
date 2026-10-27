import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);
const MAC_SCREENCAPTURE = "/usr/sbin/screencapture";

// -i opens the system selection UI (drag a region, Space for a window, Esc cancels).
// -x keeps the capture silent. The temp path receives only the chosen area.
export const macScreencaptureArgs = (outputPath) => ["-i", "-x", "-t", "png", outputPath];

export const MIN_REGION_SELECTION_PX = 8;

export const normalizeIpcBytes = (value) => {
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (value && typeof value === "object" && value.type === "Buffer") {
    return normalizeIpcBytes(value.data);
  }
  return new Uint8Array();
};

export const screenshotCaptureId = (date = new Date()) =>
  `shot-${date.getTime()}-${Math.random().toString(16).slice(2, 10)}`;

export const screenshotImportIpcPayload = (captured) => ({
  captureId: captured.captureId,
  name: captured.name,
  type: captured.type,
  title: captured.title,
  bytes: normalizeIpcBytes(captured.bytes),
});

// Full-screen capture finishes in a few hundred milliseconds. macOS/Electron
// tray menus can deliver the same click twice after that, so keep the capture
// locked through a short cooldown instead of releasing it in the same tick.
export const SCREENSHOT_CAPTURE_COOLDOWN_MS = 4000;

export const createScreenshotCaptureGuard = ({
  cooldownMs = SCREENSHOT_CAPTURE_COOLDOWN_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) => {
  let inFlight = false;
  let cooldownTimer = null;
  return {
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      if (cooldownTimer != null) {
        cancel(cooldownTimer);
        cooldownTimer = null;
      }
      return true;
    },
    end() {
      if (cooldownTimer != null) cancel(cooldownTimer);
      cooldownTimer = schedule(() => {
        inFlight = false;
        cooldownTimer = null;
      }, cooldownMs);
    },
    // A region selection outlives the tray's double-click, so the next capture
    // can start as soon as the user finishes instead of waiting out the cooldown.
    release() {
      if (cooldownTimer != null) cancel(cooldownTimer);
      cooldownTimer = null;
      inFlight = false;
    },
  };
};

export const isChineseDesktopLocale = (locale) =>
  typeof locale === "string" && locale.toLowerCase().startsWith("zh");

const pad2 = (value) => String(value).padStart(2, "0");

export const screenshotStamp = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

export const screenshotNoteTitle = (locale, date = new Date()) =>
  isChineseDesktopLocale(locale) ? `截图 ${screenshotStamp(date)}` : `Screenshot ${screenshotStamp(date)}`;

export const screenshotFileName = (date = new Date()) =>
  `screenshot-${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}.png`;

export const isScreenshotCancelledExit = (error) => {
  const code = error && typeof error === "object" ? error.code : null;
  return code === 1 || code === 2;
};

export const readCapturedScreenshot = async (outputPath, io = { readFile, unlink, stat }) => {
  try {
    const info = await io.stat(outputPath);
    if (!info.size) {
      await io.unlink(outputPath).catch(() => {});
      return null;
    }
    const bytes = await io.readFile(outputPath);
    await io.unlink(outputPath).catch(() => {});
    return bytes;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
};

export const captureMacScreenScreenshot = async ({
  execFile = execFileAsync,
  outputPath,
  readFile: readCapturedFile = readFile,
  unlink: unlinkCapturedFile = unlink,
  stat: statCapturedFile = stat,
} = {}) => {
  if (!outputPath) throw new Error("Screenshot output path is required");
  try {
    await execFile(MAC_SCREENCAPTURE, macScreencaptureArgs(outputPath));
  } catch (error) {
    await unlinkCapturedFile(outputPath).catch(() => {});
    if (isScreenshotCancelledExit(error)) return null;
    throw error;
  }
  return readCapturedScreenshot(outputPath, {
    readFile: readCapturedFile,
    unlink: unlinkCapturedFile,
    stat: statCapturedFile,
  });
};

const toPngBytes = (image) => {
  const png = image?.toPNG?.();
  return png && png.byteLength > 0 ? png : null;
};

const displayThumbnailSize = (display) => ({
  width: Math.max(1, Math.round((display.size?.width || 0) * (display.scaleFactor || 1))),
  height: Math.max(1, Math.round((display.size?.height || 0) * (display.scaleFactor || 1))),
});

const matchCaptureSource = (sources, display) => {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const displayId = display?.id == null ? "" : String(display.id);
  return sources.find((source) => source && String(source.display_id) === displayId) || sources[0];
};

export const clampRegionSelection = (selection, displaySize, minimum = MIN_REGION_SELECTION_PX) => {
  if (!selection || typeof selection !== "object") return null;
  if (selection.full === true) return { full: true };
  const width = Number(selection.width);
  const height = Number(selection.height);
  const x = Number(selection.x);
  const y = Number(selection.y);
  const displayWidth = Number(displaySize?.width);
  const displayHeight = Number(displaySize?.height);
  if (![x, y, width, height, displayWidth, displayHeight].every(Number.isFinite)) return null;
  if (displayWidth <= 0 || displayHeight <= 0 || width < minimum || height < minimum) return null;
  const left = Math.max(0, Math.min(x, displayWidth));
  const top = Math.max(0, Math.min(y, displayHeight));
  const right = Math.max(left, Math.min(x + width, displayWidth));
  const bottom = Math.max(top, Math.min(y + height, displayHeight));
  if (right - left < minimum || bottom - top < minimum) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const cropRectForDisplay = ({ selection, displaySize, imageSize }) => {
  if (!selection || selection.full) return null;
  const displayWidth = Number(displaySize?.width);
  const displayHeight = Number(displaySize?.height);
  const imageWidth = Number(imageSize?.width);
  const imageHeight = Number(imageSize?.height);
  if (![displayWidth, displayHeight, imageWidth, imageHeight].every((value) => value > 0)) return null;
  if (![selection.x, selection.y, selection.width, selection.height].every(Number.isFinite)) return null;
  const scaleX = imageWidth / displayWidth;
  const scaleY = imageHeight / displayHeight;
  let x = Math.round(selection.x * scaleX);
  let y = Math.round(selection.y * scaleY);
  let width = Math.round(selection.width * scaleX);
  let height = Math.round(selection.height * scaleY);
  x = Math.max(0, Math.min(x, imageWidth - 1));
  y = Math.max(0, Math.min(y, imageHeight - 1));
  width = Math.max(1, Math.min(width, imageWidth - x));
  height = Math.max(1, Math.min(height, imageHeight - y));
  if (width < 2 || height < 2) return null;
  return { x, y, width, height };
};

export const pngBytesForRegion = (image, display, selection) => {
  if (!image || image.isEmpty?.()) return null;
  const imageSize = image.getSize?.();
  if (!imageSize?.width || !imageSize?.height) return null;
  if (selection?.full) return toPngBytes(image);
  const rect = cropRectForDisplay({ selection, displaySize: display?.size, imageSize });
  if (!rect) return null;
  if (rect.x === 0 && rect.y === 0 && rect.width === imageSize.width && rect.height === imageSize.height) {
    return toPngBytes(image);
  }
  return toPngBytes(image.crop?.(rect));
};

export const captureCursorDisplayImage = async ({ desktopCapturer, screen }) => {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const thumbnailSize = displayThumbnailSize(display);
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });
  const source = matchCaptureSource(sources, display);
  const thumbnail = source?.thumbnail;
  if (!thumbnail || thumbnail.isEmpty()) return null;
  return { display, image: thumbnail };
};

export const captureDisplayScreenshot = async (input) => {
  const captured = await captureCursorDisplayImage(input);
  if (!captured) throw new Error("Screen capture is unavailable");
  const screenshotBytes = toPngBytes(captured.image);
  if (!screenshotBytes) throw new Error("Screen capture is unavailable");
  return screenshotBytes;
};

const screenshotResult = (locale, now, bytes) => {
  const capturedAt = now ? new Date(now) : new Date();
  return {
    captureId: screenshotCaptureId(capturedAt),
    bytes: normalizeIpcBytes(bytes),
    name: screenshotFileName(capturedAt),
    type: "image/png",
    title: screenshotNoteTitle(locale, capturedAt),
  };
};

export const captureScreenToNote = async (input) => {
  const bytes = input.platform === "darwin"
    ? await captureMacScreenScreenshot(input)
    : await captureDisplayScreenshot(input);
  if (!bytes || bytes.byteLength === 0) return null;
  return screenshotResult(input.locale, input.now, bytes);
};

// Windows and Linux have no system region tool that returns a file. Freeze the
// display under the cursor, let the caller collect a selection, then crop.
export const captureRegionScreenToNote = async (input) => {
  const captured = await captureCursorDisplayImage(input);
  if (!captured) throw new Error("Screen capture is unavailable");
  const choice = await input.selectRegion(captured);
  if (!choice) return null;
  const selection = clampRegionSelection(choice, captured.display?.size);
  if (!selection) return null;
  const bytes = pngBytesForRegion(captured.image, captured.display, selection);
  if (!bytes) throw new Error("Screen capture is unavailable");
  return screenshotResult(input.locale, input.now, bytes);
};

export const writeScreenshotTempPath = (root = tmpdir()) =>
  join(root, `edgeever-screenshot-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
