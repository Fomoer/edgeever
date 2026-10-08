import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { extractAudioParts, testSpeechService, transcribeMediaBlob, transcribePreparedAudioParts } from "./transcribe-note-resource.ts";
import { SpeechProviderReachabilityError } from "./speech-transcription-error.ts";

const fixturePath = fileURLToPath(new URL("./fixtures/transcription-video.mp4", import.meta.url));

describe("client-side note media preparation", () => {
  test("extracts audio from video and produces independently readable segments", async () => {
    const video = new Uint8Array(await readFile(fixturePath));
    const ranges = [];
    const parts = [];
    for await (const part of extractAudioParts(
      video.byteLength,
      async (start, end) => {
        ranges.push([start, end]);
        return video.slice(start, end);
      },
      undefined,
      { maxChunkSeconds: 0.7 },
    )) parts.push(part);

    expect(ranges.length).toBeGreaterThan(0);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.type).toStartWith("audio/");
      expect(part.size).toBeLessThan(video.byteLength);
      const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(await part.arrayBuffer()) });
      expect(await input.canRead()).toBe(true);
      expect(await input.getPrimaryAudioTrack()).not.toBeNull();
      expect(await input.getPrimaryVideoTrack()).toBeNull();
      input.dispose();
    }
  });

  test.each([
    ["transcription-audio.mp3", "audio/mpeg"],
    ["transcription-video.webm", "audio/webm"],
  ])("handles %s without sending video frames", async (name, expectedMime) => {
    const bytes = new Uint8Array(await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
    const parts = [];
    for await (const part of extractAudioParts(bytes.byteLength, async (start, end) => bytes.slice(start, end))) {
      parts.push(part);
    }
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe(expectedMime);
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(await parts[0].arrayBuffer()) });
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    expect(await input.getPrimaryVideoTrack()).toBeNull();
    input.dispose();
  });

  test.each([
    ["transcription-audio.mp3", "audio/mpeg"],
    ["transcription-video.mp4", "video/mp4"],
  ])("transcribes a plugin-supplied %s locally without uploading it", async (filename, mediaType) => {
    const bytes = await readFile(fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url)));
    const source = new File([bytes], filename, { type: mediaType });
    const requests = [];
    const controller = new AbortController();
    const result = await transcribeMediaBlob(source, controller.signal, {
      getSettings: async () => ({
        enabled: true,
        encryptionConfigured: true,
        readOnly: false,
        defaultModelId: "model-1",
        providers: [{
          id: "provider-1",
          provider: "openai-compatible",
          displayName: "Speech",
          baseUrl: "https://speech.example/v1",
          isEnabled: true,
          hasApiKey: true,
          models: [{ id: "model-1", providerId: "provider-1", modelId: "whisper-1", displayName: "Whisper" }],
        }],
      }),
      getCredential: async (providerId, signal) => {
        requests.push({ kind: "credential", providerId, signal });
        return { apiKey: "test-token" };
      },
      providerFetch: async (url, init) => {
        requests.push({ kind: "provider", url: String(url), init });
        return Response.json({ text: "Recognized speech" });
      },
    });
    expect(result).toEqual({ text: "Recognized speech" });
    expect(requests.map(({ kind }) => kind)).toEqual(["credential", "provider"]);
    expect(requests[0]).toMatchObject({ providerId: "provider-1", signal: controller.signal });
    expect(requests[1].url).toBe("https://speech.example/v1/audio/transcriptions");
    expect(requests[1].init.signal.aborted).toBe(false);
    expect(requests[1].init.headers.Authorization).toBe("Bearer test-token");
    expect(requests[1].init.body.get("model")).toBe("whisper-1");
    const submittedAudio = requests[1].init.body.get("file");
    expect(submittedAudio).toBeInstanceOf(File);
    expect(submittedAudio.type).toStartWith("audio/");
    controller.abort();
    expect(requests[1].init.signal.aborted).toBe(true);
  });

  test.each([
    "speech-service-check.en-US.mp3",
    "speech-service-check.zh-CN.mp3",
  ])("bundles a real spoken MP3 for provider connection checks: %s", async (filename) => {
    const bytes = await readFile(fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url)));
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
    expect(await input.canRead()).toBe(true);
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    input.dispose();
  });

  test.each([
    ["default English", undefined, "speech-service-check.en-US.mp3"],
    ["Chinese", "zh-CN", "speech-service-check.zh-CN.mp3"],
  ])("connection check selects %s sample and sends it from the client", async (_label, sampleLocale, filename) => {
    const bytes = await readFile(fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url)));
    const requests = [];
    const transcript = await testSpeechService(
      { baseUrl: "https://speech.example/v1/", modelId: "whisper-1", apiKey: "test-token" },
      undefined,
      {
        sampleFetch: async (url) => {
          requests.push({ kind: "sample", url: String(url) });
          return new Response(bytes, { status: 200 });
        },
        providerFetch: async (url, init) => {
          requests.push({ kind: "provider", url: String(url), init });
          return Response.json({ text: "Hello, this is a speech recognition test." });
        },
        sampleLocale,
      },
    );
    expect(transcript).toContain("speech recognition test");
    expect(requests.map((request) => request.kind)).toEqual(["sample", "provider"]);
    expect(requests[0].url).toEndWith(`/fixtures/${filename}`);
    expect(requests[1].url).toBe("https://speech.example/v1/audio/transcriptions");
    expect(requests[1].init.body.get("file")).toBeInstanceOf(File);
    expect(requests[1].init.body.get("file").name).toBe(filename);
    expect(requests[1].init.body.get("model")).toBe("whisper-1");
  });

  test("a direct transport failure does not claim the token or model is invalid", async () => {
    async function* parts() { yield new File(["audio"], "sample.mp3", { type: "audio/mpeg" }); }
    try {
      await transcribePreparedAudioParts(
        { baseUrl: "https://speech.example/v1", modelId: "whisper-1", apiKey: "test-token" },
        parts(),
        async () => { throw new TypeError("Failed to fetch"); },
      );
      throw new Error("Expected a direct provider reachability error.");
    } catch (error) {
      expect(error).toBeInstanceOf(SpeechProviderReachabilityError);
      expect(error.code).toBe("speech_provider_direct_unreachable");
      expect(["browser", "desktop"]).toContain(error.platform);
      expect(error.message).not.toMatch(/token|model/i);
    }
  });

  test("sends each prepared segment directly to the configured speech endpoint", async () => {
    const requests = [];
    const completed = [];
    async function* parts() {
      yield new File(["first"], "first.mp3", { type: "audio/mpeg" });
      yield new File(["second"], "second.mp3", { type: "audio/mpeg" });
    }
    const text = await transcribePreparedAudioParts(
      { baseUrl: "https://speech.example/v1", modelId: "whisper-1", apiKey: "secret" },
      parts(),
      async (url, init) => {
        requests.push({ url, init });
        return Response.json({ text: `segment ${requests.length}` });
      },
      undefined,
      (count) => completed.push(count),
    );
    expect(text).toBe("segment 1\n\nsegment 2");
    expect(completed).toEqual([1, 2]);
    expect(requests.map(({ url }) => url)).toEqual([
      "https://speech.example/v1/audio/transcriptions",
      "https://speech.example/v1/audio/transcriptions",
    ]);
    for (const { init } of requests) {
      expect(init.headers.Authorization).toBe("Bearer secret");
      expect(init.body.get("model")).toBe("whisper-1");
      expect(init.body.get("file")).toBeInstanceOf(File);
    }
  });
});
