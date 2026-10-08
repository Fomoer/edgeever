import { describe, expect, test } from "bun:test";
import { resolvePrimaryAiCredentialEncryptionKey } from "./ai-service.ts";
import { encryptSecret } from "./secret-encryption.ts";
import { isTranscribableAttachment, prepareNoteResourceTranscription } from "./resource-transcription.ts";

const makeEnvironment = async (resource) => {
  const env = {
    EDGE_EVER_AUTH_PASSWORD: "test-password-long-enough",
    storage: {
      resources: {
        get: async () => { throw new Error("The instance must not read media bytes"); },
      },
      db: {
        prepare: (sql) => ({
          bind: (...args) => ({
            first: async () => {
              if (sql.includes("FROM resources r")) return args[0] === resource.id && args[1] === "ws_one" ? resource : null;
              if (sql.includes("FROM ai_transcription_workspace_settings AS settings")) return {
                model_id: "whisper-1",
                provider: "openai-compatible",
                base_url: "https://speech.example/v1",
                api_key_encrypted: await encryptSecret("secret-token", resolvePrimaryAiCredentialEncryptionKey(env)),
              };
              return null;
            },
          }),
        }),
      },
    },
  };
  return env;
};

const resource = {
  id: "res_one",
  memo_id: "memo_one",
  kind: "attachment",
  filename: "meeting.mp4",
  mime_type: "video/mp4",
  byte_size: 11,
  storage_config_id: "builtin",
  object_key: "workspace/meeting.mp4",
};

describe("note attachment transcription boundary", () => {
  test("accepts only supported audio and video attachments", () => {
    expect(isTranscribableAttachment(resource)).toBe(true);
    expect(isTranscribableAttachment({ ...resource, filename: "meeting.exe" })).toBe(false);
    expect(isTranscribableAttachment({ ...resource, mime_type: "application/octet-stream" })).toBe(false);
    expect(isTranscribableAttachment({ ...resource, kind: "image" })).toBe(false);
  });

  test("rejects an attachment from another note before returning credentials", async () => {
    const env = await makeEnvironment(resource);
    await expect(prepareNoteResourceTranscription(env, "ws_one", "memo_other", "res_one"))
      .rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  test("returns a direct model target without reading or forwarding media", async () => {
    const env = await makeEnvironment(resource);
    const result = await prepareNoteResourceTranscription(env, "ws_one", "memo_one", "res_one");
    expect(result).toEqual({
      baseUrl: "https://speech.example/v1",
      modelId: "whisper-1",
      apiKey: "secret-token",
      resourceId: "res_one",
      filename: "meeting.mp4",
    });
  });
});
