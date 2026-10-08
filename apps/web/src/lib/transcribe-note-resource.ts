import {
  ALL_FORMATS,
  BufferTarget,
  CustomSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  FlacOutputFormat,
  Input,
  Mp3OutputFormat,
  Mp4OutputFormat,
  Output,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioCodec,
  type OutputFormat,
} from "mediabunny";
import { api, directProviderFetch } from "./api";
import { SpeechProviderReachabilityError } from "./speech-transcription-error";

const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;
const MAX_PROVIDER_FILE_BYTES = 24_000_000;
const MAX_CHUNK_PAYLOAD_BYTES = 20_000_000;
const MAX_CHUNK_SECONDS = 600;
const MAX_CHUNKS = 64;

const formatForCodec = (codec: AudioCodec): OutputFormat | null => {
  const format: OutputFormat | null = codec === "aac" ? new Mp4OutputFormat()
    : codec === "mp3" ? new Mp3OutputFormat()
    : codec === "opus" || codec === "vorbis" ? new WebMOutputFormat()
    : codec === "flac" ? new FlacOutputFormat()
    : codec.startsWith("pcm-") ? new WavOutputFormat()
    : null;
  return format?.getSupportedAudioCodecs().includes(codec) ? format : null;
};

const audioFileInfo = (format: OutputFormat) => {
  if (format instanceof Mp4OutputFormat) return { extension: ".m4a", mimeType: "audio/mp4" };
  if (format instanceof WebMOutputFormat) return { extension: ".webm", mimeType: "audio/webm" };
  return { extension: format.fileExtension, mimeType: format.mimeType };
};

const attachmentPath = (resourceId: string) => `/api/v1/resources/${encodeURIComponent(resourceId)}/blob`;

export async function* extractAudioParts(
  size: number,
  readRange: (start: number, end: number) => Promise<Uint8Array>,
  signal?: AbortSignal,
  limits: { maxChunkPayloadBytes?: number; maxChunkSeconds?: number } = {},
): AsyncGenerator<File> {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_SOURCE_BYTES) {
    throw new Error("The attachment is unavailable or exceeds the 1 GiB upload limit.");
  }
  const input = new Input({
    formats: ALL_FORMATS,
    source: new CustomSource({
      getSize: () => size,
      maxCacheSize: 4 * 1024 * 1024,
      prefetchProfile: "network",
      read: async (start, end) => {
        signal?.throwIfAborted();
        const bytes = await readRange(start, end);
        if (bytes.byteLength !== end - start) throw new Error("The attachment read was incomplete.");
        return bytes;
      },
    }),
  });

  try {
    if (!await input.canRead()) throw new Error("This audio or video format cannot be read on this device.");
    const track = await input.getPrimaryAudioTrack();
    const codec = await track?.getCodec();
    const decoderConfig = await track?.getDecoderConfig();
    if (!track || !codec || !decoderConfig) throw new Error("The attachment has no supported audio track.");
    const format = formatForCodec(codec);
    if (!format) throw new Error("The attachment's audio codec cannot be sent to the speech service.");
    const fileInfo = audioFileInfo(format);

    let output: Output<OutputFormat, BufferTarget> | null = null;
    let source: EncodedAudioPacketSource | null = null;
    let chunkStart = 0;
    let payloadBytes = 0;
    let chunkCount = 0;

    const startChunk = async (timestamp: number) => {
      output = new Output({ format, target: new BufferTarget() });
      source = new EncodedAudioPacketSource(codec);
      output.addAudioTrack(source);
      await output.start();
      chunkStart = timestamp;
      payloadBytes = 0;
    };
    const finishChunk = async (): Promise<File> => {
      if (!output) throw new Error("No audio segment to finish.");
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer || !buffer.byteLength || buffer.byteLength > MAX_PROVIDER_FILE_BYTES) {
        throw new Error("An audio segment exceeds the speech service's file limit.");
      }
      chunkCount += 1;
      if (chunkCount > MAX_CHUNKS) throw new Error(`The recording exceeds the ${MAX_CHUNKS}-segment transcription limit.`);
      return new File([buffer], `transcription-${chunkCount}${fileInfo.extension}`, { type: fileInfo.mimeType });
    };

    for await (const packet of new EncodedPacketSink(track).packets()) {
      signal?.throwIfAborted();
      if (!output) await startChunk(packet.timestamp);
      if (payloadBytes > 0 && (
        payloadBytes + packet.byteLength > (limits.maxChunkPayloadBytes ?? MAX_CHUNK_PAYLOAD_BYTES)
        || packet.timestamp - chunkStart >= (limits.maxChunkSeconds ?? MAX_CHUNK_SECONDS)
      )) {
        yield await finishChunk();
        await startChunk(packet.timestamp);
      }
      if (packet.byteLength > (limits.maxChunkPayloadBytes ?? MAX_CHUNK_PAYLOAD_BYTES)) {
        throw new Error("An audio packet exceeds the speech service's file limit.");
      }
      const relativePacket = new EncodedPacket(
        packet.data,
        packet.type,
        Math.max(0, packet.timestamp - chunkStart),
        packet.duration,
        packet.sequenceNumber,
        packet.byteLength,
        packet.sideData,
      );
      await source!.add(relativePacket, payloadBytes === 0 ? { decoderConfig } : undefined);
      payloadBytes += packet.byteLength;
    }
    if (!output) throw new Error("The attachment contains no audio data.");
    yield await finishChunk();
  } finally {
    input.dispose();
  }
}

export async function transcribeNoteResource(
  memoId: string,
  resourceId: string,
  signal?: AbortSignal,
  onProgress?: (completedSegments: number) => void,
): Promise<{ text: string; resourceId: string; filename: string }> {
  const target = await api.prepareNoteResourceTranscription(memoId, resourceId, signal);
  const path = attachmentPath(resourceId);
  const probe = await api.getResourceResponse(path, { headers: { Range: "bytes=0-0" }, signal });
  const match = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get("Content-Range") ?? "");
  await probe.body?.cancel();
  const size = Number(match?.[1]);
  if (probe.status !== 206 || !Number.isSafeInteger(size) || size < 1 || size > MAX_SOURCE_BYTES) {
    throw new Error("The attachment is unavailable or exceeds the 1 GiB upload limit.");
  }
  const readRange = async (start: number, end: number) => {
    const response = await api.getResourceResponse(path, {
      headers: { Range: `bytes=${start}-${end - 1}` },
      signal,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Error("The attachment server did not return the requested byte range.");
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  const text = await transcribePreparedAudioParts(
    target,
    extractAudioParts(size, readRange, signal),
    directProviderFetch,
    signal,
    onProgress,
  );
  return { text, resourceId, filename: target.filename };
}

export async function transcribeMediaBlob(
  media: Blob,
  signal?: AbortSignal,
  transport: {
    getSettings?: typeof api.getAiTranscriptionSettings;
    getCredential?: typeof api.getAiTranscriptionDirectCredential;
    providerFetch?: typeof fetch;
  } = {},
): Promise<{ text: string }> {
  if (!(media instanceof Blob)) throw new TypeError("A media Blob or File is required.");
  if (!Number.isSafeInteger(media.size) || media.size < 1 || media.size > MAX_SOURCE_BYTES) {
    throw new Error("The media is unavailable or exceeds the 1 GiB limit.");
  }
  signal?.throwIfAborted();
  const settings = await (transport.getSettings ?? api.getAiTranscriptionSettings)();
  signal?.throwIfAborted();
  const provider = settings.providers.find((item) => item.isEnabled
    && item.models.some((model) => model.id === settings.defaultModelId));
  const model = provider?.models.find((item) => item.id === settings.defaultModelId);
  if (!settings.enabled || !provider || !model || !provider.hasApiKey) {
    throw new Error("No speech recognition model is enabled.");
  }
  const { apiKey } = await (transport.getCredential ?? api.getAiTranscriptionDirectCredential)(provider.id, signal);
  signal?.throwIfAborted();
  const readRange = async (start: number, end: number) =>
    new Uint8Array(await media.slice(start, end).arrayBuffer());
  const text = await transcribePreparedAudioParts(
    { baseUrl: provider.baseUrl.trim().replace(/\/+$/, ""), modelId: model.modelId, apiKey },
    extractAudioParts(media.size, readRange, signal),
    transport.providerFetch ?? directProviderFetch,
    signal,
  );
  return { text };
}

export async function transcribePreparedAudioParts(
  target: { baseUrl: string; modelId: string; apiKey: string },
  parts: AsyncIterable<File>,
  providerFetch: typeof fetch,
  signal?: AbortSignal,
  onProgress?: (completedSegments: number) => void,
  requestTimeoutMs = 180_000,
): Promise<string> {
  const transcripts: string[] = [];
  for await (const file of parts) {
    signal?.throwIfAborted();
    const form = new FormData();
    form.set("model", target.modelId);
    form.set("file", file);
    let response: Response;
    try {
      response = await providerFetch(`${target.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.apiKey}` },
        body: form,
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
          : AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      if (signal?.aborted) signal.throwIfAborted();
      throw new SpeechProviderReachabilityError(
        typeof window !== "undefined" && window.edgeeverDesktop?.isAvailable ? "desktop" : "browser",
      );
    }
    if (!response.ok) throw new Error(`The speech provider returned HTTP ${response.status}.`);
    const result = await response.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof result?.text === "string" ? result.text.trim() : "";
    if (!text) throw new Error("The speech provider returned no transcript.");
    transcripts.push(text);
    onProgress?.(transcripts.length);
  }
  return transcripts.join("\n\n");
}

export async function testSpeechService(
  target: { baseUrl: string; modelId: string; apiKey: string },
  signal?: AbortSignal,
  transport: { sampleFetch?: typeof fetch; providerFetch?: typeof fetch; sampleLocale?: string } = {},
): Promise<string> {
  const sampleFilename = transport.sampleLocale?.toLowerCase().startsWith("zh")
    ? "speech-service-check.zh-CN.mp3"
    : "speech-service-check.en-US.mp3";
  const sampleUrl = sampleFilename === "speech-service-check.zh-CN.mp3"
    ? new URL("./fixtures/speech-service-check.zh-CN.mp3", import.meta.url)
    : new URL("./fixtures/speech-service-check.en-US.mp3", import.meta.url);
  const sampleResponse = await (transport.sampleFetch ?? fetch)(
    sampleUrl,
    { signal },
  );
  if (!sampleResponse.ok) throw new Error("The built-in speech test audio is unavailable.");
  const sample = new File(
    [await sampleResponse.arrayBuffer()],
    sampleFilename,
    { type: "audio/mpeg" },
  );
  async function* parts() { yield sample; }
  return transcribePreparedAudioParts(
    { ...target, baseUrl: target.baseUrl.trim().replace(/\/+$/, ""), modelId: target.modelId.trim() },
    parts(),
    transport.providerFetch ?? directProviderFetch,
    signal,
    undefined,
    30_000,
  );
}
