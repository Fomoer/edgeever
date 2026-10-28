import {
  parsePublicMemoSharePagePath,
  PUBLIC_SHARE_MARKDOWN_NOT_FOUND,
  PUBLIC_SHARE_MARKDOWN_PASSWORD,
  publicShareMarkdown,
} from "../api/src/share-page.ts";
import { PUBLIC_PAGE_HEADERS } from "@edgeever/shared/public-page-headers";
import type { Plugin } from "vite";

export const devShareMarkdownToken = (pathname: string) => {
  const target = parsePublicMemoSharePagePath(pathname);
  return target?.markdown ? target.segment : null;
};
const LOCAL_API_ORIGIN = "http://127.0.0.1:8787";

type ShareMarkdownResult = { status: number; body: string };

const isMarkdownResponse = (response: Response) =>
  (response.headers.get("content-type") ?? "").toLowerCase().includes("text/markdown");

/**
 * Local Vite serves the app shell for every `/share/` path, so `/share/<token>.md`
 * used to reach the page with `.md` glued onto the token. Ask the API for the
 * note and answer with the Markdown body instead.
 */
export const loadDevShareMarkdown = async (
  token: string,
  fetchImpl: typeof fetch,
  origin = LOCAL_API_ORIGIN,
  cookie?: string,
): Promise<ShareMarkdownResult> => {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  try {
    const direct = await fetchImpl(`${origin}/share/${token}.md`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (isMarkdownResponse(direct)) return { status: direct.status, body: await direct.text() };
  } catch {
    // The local worker may still be serving the app shell for this path.
  }

  const api = await fetchImpl(`${origin}/api/public/shares/${encodeURIComponent(token)}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (api.status === 403) return { status: 403, body: PUBLIC_SHARE_MARKDOWN_PASSWORD };
  if (!api.ok) return { status: api.status === 404 ? 404 : api.status, body: PUBLIC_SHARE_MARKDOWN_NOT_FOUND };
  const payload = await api.json() as { share?: { title?: string | null; contentMarkdown?: string } };
  if (!payload.share) return { status: 404, body: PUBLIC_SHARE_MARKDOWN_NOT_FOUND };
  return {
    status: 200,
    body: publicShareMarkdown(payload.share.title ?? null, payload.share.contentMarkdown ?? ""),
  };
};

export const publicShareMarkdownDev = (origin = LOCAL_API_ORIGIN): Plugin => ({
  name: "edgeever-public-share-markdown",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.method !== "GET" && request.method !== "HEAD") return next();
      const pathname = request.url?.split("?")[0] ?? "";
      const token = devShareMarkdownToken(pathname);
      if (!token) return next();
      try {
        const result = await loadDevShareMarkdown(
          token,
          fetch,
          origin,
          request.headers.cookie,
        );
        response.statusCode = result.status;
        for (const [key, value] of Object.entries(PUBLIC_PAGE_HEADERS)) response.setHeader(key, value);
        response.setHeader("Content-Type", "text/markdown; charset=utf-8");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Disposition", "inline");
        response.end(request.method === "HEAD" ? undefined : result.body);
      } catch (error) {
        next(error);
      }
    });
  },
});
