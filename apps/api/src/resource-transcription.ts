import { AppError } from "./app-error";
import { prepareAiTranscriptionCredentials } from "./ai-service";
import { getResourceRow } from "./resource-service";
import type { Bindings } from "./api-context";

const SUPPORTED_EXTENSIONS = new Set(["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"]);

export const isTranscribableAttachment = (resource: {
  kind: string;
  mime_type: string | null;
  filename: string | null;
}) => {
  if (resource.kind !== "attachment") return false;
  const extension = /\.([a-z0-9]+)$/i.exec(resource.filename ?? "")?.[1]?.toLowerCase();
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) return false;
  const mime = (resource.mime_type ?? "").toLowerCase();
  return mime.startsWith("audio/") || mime === "video/mp4" || mime === "video/webm";
};

export const prepareNoteResourceTranscription = async (
  env: Bindings,
  workspaceId: string,
  memoId: string,
  resourceId: string,
) => {
  const resource = await getResourceRow(env.storage.db, workspaceId, resourceId);
  if (!resource || resource.memo_id !== memoId) {
    throw new AppError("resource_not_found", "This attachment does not belong to the note.", 404);
  }
  if (!isTranscribableAttachment(resource)) {
    throw new AppError("unsupported_media_type", "Choose an audio or MP4/WebM video attachment.", 415);
  }
  if (resource.byte_size < 1) {
    throw new AppError("empty_audio", "The attachment is empty.", 413);
  }
  const credentials = await prepareAiTranscriptionCredentials(env.storage.db, workspaceId, env);
  if (!credentials.enabled) {
    throw new AppError("ai_transcription_not_configured", "Choose a default speech model first.", 409);
  }

  return {
    baseUrl: credentials.baseUrl,
    modelId: credentials.modelId,
    apiKey: credentials.apiKey,
    resourceId,
    filename: resource.filename ?? "",
  };
};
