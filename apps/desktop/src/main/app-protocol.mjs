import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";

export const DESKTOP_APP_SCHEME = "edgeever-app";
export const DESKTOP_APP_HOST = "app";
export const DESKTOP_APP_ORIGIN = `${DESKTOP_APP_SCHEME}://${DESKTOP_APP_HOST}`;
export const DESKTOP_APP_ENTRY_URL = `${DESKTOP_APP_ORIGIN}/index.html`;

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".eot", "application/vnd.ms-fontobject"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".otf", "font/otf"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".webm", "video/webm"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const isInside = (root, candidate) => {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
};

export const resolveDesktopAppRequestPath = (requestUrl, webRoot) => {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${DESKTOP_APP_SCHEME}:` || parsed.hostname !== DESKTOP_APP_HOST) return null;
  if (parsed.username || parsed.password || parsed.port) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return null;
  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const root = resolve(webRoot);
  const candidate = resolve(root, relativePath);
  return isInside(root, candidate) ? candidate : null;
};

export const createDesktopAppProtocolHandler = ({
  webRoot,
  realpathImpl = realpath,
  statImpl = stat,
  createReadStreamImpl = createReadStream,
} = {}) => async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const candidate = resolveDesktopAppRequestPath(request.url, webRoot);
  if (!candidate) return new Response("Not found", { status: 404 });

  try {
    const root = await realpathImpl(resolve(webRoot));
    const path = await realpathImpl(candidate);
    if (!isInside(root, path)) return new Response("Not found", { status: 404 });
    const metadata = await statImpl(path);
    if (!metadata.isFile()) return new Response("Not found", { status: 404 });

    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Length": String(metadata.size),
      "Content-Type": CONTENT_TYPES.get(extname(path).toLowerCase()) || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStreamImpl(path)), { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
