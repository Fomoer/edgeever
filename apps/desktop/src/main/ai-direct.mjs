const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_CONCURRENT = 2;

const blockedHost = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(host)) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
};

export const validateAiProviderUrl = (value) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("AI provider requests must use HTTPS without credentials.");
  }
  if (url.port && url.port !== "443") throw new Error("AI provider requests must use port 443.");
  if (blockedHost(url.hostname)) throw new Error("AI provider host is not allowed.");
  return url;
};

export const createAiDirectRuntime = ({ fetchImpl = fetch, maxConcurrent = MAX_CONCURRENT } = {}) => {
  const active = new Map();
  return {
    async open(requestId, input, { onData, onEnd, onError }) {
      if (typeof requestId !== "string" || requestId.length < 8 || requestId.length > 80) {
        throw new Error("Invalid AI provider request.");
      }
      if (!input || typeof input !== "object") throw new Error("Invalid AI provider request.");
      if ((input.method ?? "POST") !== "POST") throw new Error("AI provider requests must use POST.");
      if (typeof input.body !== "string" || Buffer.byteLength(input.body) > MAX_BODY_BYTES) {
        throw new Error("AI provider request body is too large.");
      }
      const url = validateAiProviderUrl(input.url);
      const headers = {};
      if (input.headers && typeof input.headers === "object") {
        for (const [key, value] of Object.entries(input.headers)) {
          if (typeof key !== "string" || typeof value !== "string" || /[\r\n\0]/.test(key) || /[\r\n\0]/.test(value)) {
            throw new Error("Invalid AI provider header.");
          }
          headers[key] = value;
        }
      }
      if (active.size >= maxConcurrent || active.has(requestId)) throw new Error("Too many AI provider requests.");
      const controller = new AbortController();
      active.set(requestId, controller);
      try {
        const response = await fetchImpl(url.href, {
          method: "POST",
          headers,
          body: input.body,
          redirect: "error",
          signal: controller.signal,
        });
        const headerEntries = {};
        response.headers.forEach((value, key) => {
          headerEntries[key] = value;
        });
        queueMicrotask(async () => {
          try {
            if (!response.body) {
              onEnd();
              return;
            }
            const reader = response.body.getReader();
            while (!controller.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value?.byteLength) onData(value);
            }
            onEnd();
          } catch (error) {
            if (!controller.signal.aborted) onError(error);
          } finally {
            active.delete(requestId);
          }
        });
        return { status: response.status, headers: headerEntries };
      } catch (error) {
        active.delete(requestId);
        throw error;
      }
    },
    cancel(requestId) {
      const controller = active.get(requestId);
      if (!controller) return false;
      controller.abort(new Error("AI provider request cancelled"));
      active.delete(requestId);
      return true;
    },
    get activeCount() {
      return active.size;
    },
  };
};
