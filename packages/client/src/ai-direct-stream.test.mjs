import { describe, expect, test } from "bun:test";
import { createEdgeEverClient } from "./index.ts";

describe("direct AI generation client", () => {
  test("prepares on the instance then streams from the model provider", async () => {
    const calls = [];
    const client = createEdgeEverClient({
      baseUrl: "https://notes.example",
      token: "user-token",
      directAiGeneration: true,
      fetch: async (url, init) => {
        calls.push({ url: String(url), auth: new Headers(init.headers).get("Authorization") });
        expect(String(url)).toBe("https://notes.example/api/v1/ai/generate/prepare");
        return new Response(JSON.stringify({
          provider: "openai-compatible",
          baseUrl: "https://integrate.api.nvidia.com/v1",
          apiKey: "nvidia-key",
          modelId: "meta/llama",
          system: "System",
          prompt: "Note content",
          maxOutputTokens: 4096,
          resultBoundary: { start: "<edgeever-result-x>", end: "</edgeever-result-x>" },
        }), { headers: { "content-type": "application/json" } });
      },
      providerFetch: async (url, init) => {
        calls.push({ url: String(url), auth: new Headers(init.headers).get("Authorization") });
        expect(String(url)).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
        const body = JSON.parse(String(init.body));
        expect(body.stream).toBe(true);
        return new Response([
          `data: {"choices":[{"delta":{"content":"<edgeever-result-x>\\nHello"}}]}`,
          `data: {"choices":[{"delta":{"content":" world</edgeever-result-x>"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}`,
          "data: [DONE]",
          "",
        ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
      },
    });

    const events = [];
    await client.streamAiGeneration(
      { action: "summarize", title: "Note", contentMarkdown: "Body" },
      { onEvent: (event) => events.push(event) },
    );

    expect(calls).toEqual([
      { url: "https://notes.example/api/v1/ai/generate/prepare", auth: "Bearer user-token" },
      { url: "https://integrate.api.nvidia.com/v1/chat/completions", auth: "Bearer nvidia-key" },
    ]);
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe("Hello world");
    expect(events.at(-1)).toMatchObject({ type: "finish", outputTokens: 2 });
  });

  test("probes CORS and stays on the instance proxy without downloading the API key", async () => {
    const urls = [];
    const client = createEdgeEverClient({
      baseUrl: "https://notes.example",
      tryDirectAiGeneration: true,
      fetch: async (url, init) => {
        urls.push({ url: String(url), method: init?.method ?? "GET" });
        if (String(url).endsWith("/direct-target")) {
          return new Response(JSON.stringify({
            provider: "openai-compatible",
            baseUrl: "https://integrate.api.nvidia.com/v1",
            modelId: "meta/llama",
          }), { headers: { "content-type": "application/json" } });
        }
        if (String(url).includes("integrate.api.nvidia.com")) {
          throw new TypeError("Failed to fetch");
        }
        return new Response("data: {\"type\":\"text-delta\",\"text\":\"proxied\"}\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const events = [];
    await client.streamAiGeneration(
      { action: "summarize", title: "Note", contentMarkdown: "Body" },
      { onEvent: (event) => events.push(event) },
    );
    expect(urls).toEqual([
      { url: "https://notes.example/api/v1/ai/direct-target", method: "GET" },
      { url: "https://integrate.api.nvidia.com/v1/chat/completions", method: "OPTIONS" },
      { url: "https://notes.example/api/v1/ai/generate", method: "POST" },
    ]);
    expect(urls.some((call) => call.url.endsWith("/prepare"))).toBe(false);
    expect(events).toEqual([{ type: "text-delta", text: "proxied" }]);
  });

  test("direct-connects from the browser after a successful CORS probe", async () => {
    const urls = [];
    const client = createEdgeEverClient({
      baseUrl: "https://notes.example",
      token: "user-token",
      tryDirectAiGeneration: true,
      fetch: async (url, init) => {
        urls.push(String(url));
        if (String(url).endsWith("/direct-target")) {
          return new Response(JSON.stringify({
            provider: "openai-compatible",
            baseUrl: "https://openrouter.ai/api/v1",
            modelId: "openai/gpt-4o-mini",
          }), { headers: { "content-type": "application/json" } });
        }
        if (String(url).includes("openrouter.ai") && (init?.method ?? "GET") === "OPTIONS") {
          return new Response(null, { status: 204 });
        }
        if (String(url).endsWith("/prepare")) {
          return new Response(JSON.stringify({
            provider: "openai-compatible",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "or-key",
            modelId: "openai/gpt-4o-mini",
            system: "System",
            prompt: "Note content",
            maxOutputTokens: 4096,
            resultBoundary: { start: "<edgeever-result-x>", end: "</edgeever-result-x>" },
          }), { headers: { "content-type": "application/json" } });
        }
        if (String(url).includes("openrouter.ai")) {
          return new Response([
            `data: {"choices":[{"delta":{"content":"<edgeever-result-x>\\nHello"}}]}`,
            `data: {"choices":[{"delta":{"content":"</edgeever-result-x>"},"finish_reason":"stop"}]}`,
            "data: [DONE]",
            "",
          ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    const events = [];
    await client.streamAiGeneration(
      { action: "summarize", title: "Note", contentMarkdown: "Body" },
      { onEvent: (event) => events.push(event) },
    );
    expect(urls).toEqual([
      "https://notes.example/api/v1/ai/direct-target",
      "https://openrouter.ai/api/v1/chat/completions",
      "https://notes.example/api/v1/ai/generate/prepare",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe("Hello");
  });

  test("falls back to the instance proxy when prepare is missing", async () => {
    const urls = [];
    const client = createEdgeEverClient({
      baseUrl: "https://notes.example",
      directAiGeneration: true,
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/prepare")) return new Response("{}", { status: 404 });
        return new Response("data: {\"type\":\"text-delta\",\"text\":\"proxied\"}\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const events = [];
    await client.streamAiGeneration(
      { action: "summarize", title: "Note", contentMarkdown: "Body" },
      { onEvent: (event) => events.push(event) },
    );
    expect(urls).toEqual([
      "https://notes.example/api/v1/ai/generate/prepare",
      "https://notes.example/api/v1/ai/generate",
    ]);
    expect(events).toEqual([{ type: "text-delta", text: "proxied" }]);
  });
});
