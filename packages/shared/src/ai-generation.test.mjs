import { describe, expect, test } from "bun:test";
import {
  buildAiDirectProviderRequest,
  createAiGenerationStreamNormalizer,
  extractAiDirectStreamDelta,
} from "./ai-generation.ts";

const prepared = {
  provider: "openai-compatible",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "secret-key",
  modelId: "meta/llama-3.1-70b-instruct",
  system: "System",
  prompt: "Note content",
  maxOutputTokens: 4096,
  resultBoundary: { start: "<edgeever-result-abc>", end: "</edgeever-result-abc>" },
};

describe("direct AI provider requests", () => {
  test("builds an OpenAI-compatible streaming chat completion", () => {
    const request = buildAiDirectProviderRequest(prepared);
    expect(request.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(request.headers.authorization).toBe("Bearer secret-key");
    const body = JSON.parse(request.body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe("meta/llama-3.1-70b-instruct");
    expect(body.messages[0]).toEqual({ role: "system", content: "System" });
    expect(body.tools).toBeUndefined();
  });

  test("builds Anthropic and Google streaming requests", () => {
    const anthropic = buildAiDirectProviderRequest({ ...prepared, provider: "anthropic", baseUrl: "https://api.anthropic.com/v1" });
    expect(anthropic.url).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropic.headers["x-api-key"]).toBe("secret-key");
    expect(JSON.parse(anthropic.body).stream).toBe(true);

    const google = buildAiDirectProviderRequest({
      ...prepared,
      provider: "google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelId: "models/gemini-2.5-flash",
    });
    expect(google.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
    expect(google.headers["x-goog-api-key"]).toBe("secret-key");
  });

  test("extracts text deltas from OpenAI, Anthropic, and Google payloads", () => {
    expect(extractAiDirectStreamDelta("openai-compatible", {
      choices: [{ delta: { content: "Hello" } }],
    }).text).toBe("Hello");
    expect(extractAiDirectStreamDelta("anthropic", {
      delta: { text: "Hi" },
    }).text).toBe("Hi");
    expect(extractAiDirectStreamDelta("google", {
      candidates: [{ content: { parts: [{ text: "Hey" }] } }],
    }).text).toBe("Hey");
  });

  test("still strips result boundaries while streaming", () => {
    const normalizer = createAiGenerationStreamNormalizer(prepared.resultBoundary);
    const output = [
      normalizer.push("preamble\n<edgeever-result-abc>\nVisible"),
      normalizer.push(" text</edgeever-result-abc>\npost"),
      normalizer.finish(),
    ].join("");
    expect(output).toBe("Visible text");
  });
});
