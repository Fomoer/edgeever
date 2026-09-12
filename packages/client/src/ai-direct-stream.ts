import type { AiAttachmentInput, AiDirectTarget, AiPreparedGeneration, AiStreamEvent } from "@edgeever/shared";
import {
  buildAiDirectProviderRequest,
  createAiGenerationStreamNormalizer,
  extractAiDirectStreamDelta,
  redactAiProviderError,
} from "@edgeever/shared";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

export const consumeProviderEventStream = async (
  body: ReadableStream<Uint8Array>,
  onData: (payload: unknown) => void,
) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (frame: string) => {
    for (const line of frame.split("\n")) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      try {
        onData(JSON.parse(data));
      } catch {
        // Keep scanning; provider SSE can include comments or incomplete JSON.
      }
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) emit(frame);
      if (done) break;
    }
    if (buffer) emit(buffer);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

export const streamDirectAiGeneration = async (
  prepared: AiPreparedGeneration,
  attachments: AiAttachmentInput[] | undefined,
  options: {
    fetch: typeof fetch;
    signal?: AbortSignal;
    onEvent: (event: AiStreamEvent) => void;
  },
) => {
  const request = buildAiDirectProviderRequest(prepared, attachments ?? []);
  options.onEvent({ type: "start" });
  const response = await options.fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: options.signal,
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const message = redactAiProviderError(raw || `The AI provider responded with HTTP ${response.status}.`);
    options.onEvent({ type: "error", code: "ai_generation_failed", message });
    return;
  }
  if (!response.body) {
    options.onEvent({
      type: "error",
      code: "ai_stream_unavailable",
      message: "Streaming response is unavailable",
    });
    return;
  }

  const normalizer = createAiGenerationStreamNormalizer(prepared.resultBoundary);
  let hasContent = false;
  let finishReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  await consumeProviderEventStream(response.body, (payload) => {
    const delta = extractAiDirectStreamDelta(prepared.provider, payload);
    if (delta.finishReason) finishReason = delta.finishReason;
    if (typeof delta.inputTokens === "number") inputTokens = delta.inputTokens;
    if (typeof delta.outputTokens === "number") outputTokens = delta.outputTokens;
    const text = normalizer.push(delta.text);
    if (!text) return;
    hasContent ||= Boolean(text.trim());
    options.onEvent({ type: "text-delta", text });
  });
  const trailingText = normalizer.finish();
  if (trailingText) {
    hasContent ||= Boolean(trailingText.trim());
    options.onEvent({ type: "text-delta", text: trailingText });
  }
  if (!hasContent) {
    options.onEvent({
      type: "error",
      code: "ai_generation_failed",
      message: "The AI did not return a note result.",
    });
    return;
  }
  options.onEvent({ type: "finish", finishReason, inputTokens, outputTokens });
};

export const isAiCorsFailure = (error: unknown) => {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|cors/i.test(message);
};

export const probeAiProviderCors = async (
  target: AiDirectTarget,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
) => {
  const request = buildAiDirectProviderRequest({
    ...target,
    apiKey: "edgeever-cors-probe",
    system: "ping",
    prompt: "ping",
    maxOutputTokens: 1,
    resultBoundary: { start: "<edgeever-result-probe>", end: "</edgeever-result-probe>" },
  });
  try {
    await fetchImpl(request.url, { method: "OPTIONS", mode: "cors", signal });
    return true;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
};

export const parseAiDirectTarget = (value: unknown): AiDirectTarget | null => {
  const record = asRecord(value);
  if (
    !record
    || (record.provider !== "openai-compatible" && record.provider !== "anthropic" && record.provider !== "google")
    || typeof record.baseUrl !== "string"
    || typeof record.modelId !== "string"
    || typeof record.apiKey === "string"
  ) {
    return null;
  }
  return {
    provider: record.provider,
    baseUrl: record.baseUrl,
    modelId: record.modelId,
  };
};

export const parsePreparedAiGeneration = (value: unknown): AiPreparedGeneration | null => {
  const record = asRecord(value);
  const boundary = asRecord(record?.resultBoundary);
  if (
    !record
    || (record.provider !== "openai-compatible" && record.provider !== "anthropic" && record.provider !== "google")
    || typeof record.baseUrl !== "string"
    || typeof record.apiKey !== "string"
    || typeof record.modelId !== "string"
    || typeof record.system !== "string"
    || typeof record.prompt !== "string"
    || typeof record.maxOutputTokens !== "number"
    || typeof boundary?.start !== "string"
    || typeof boundary?.end !== "string"
  ) {
    return null;
  }
  return {
    provider: record.provider,
    baseUrl: record.baseUrl,
    apiKey: record.apiKey,
    modelId: record.modelId,
    system: record.system,
    prompt: record.prompt,
    maxOutputTokens: record.maxOutputTokens,
    resultBoundary: { start: boundary.start, end: boundary.end },
  };
};
