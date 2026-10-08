import { globSync, readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

test("retired video jobs stay removed when note attachment speech settings are restored", () => {
  const db = new Database(":memory:");
  try {
    const migrations = globSync("migrations/*.sql").sort();
    const providerIndex = migrations.findIndex((path) => path.endsWith("0062_ai_transcription_providers.sql"));
    const retirementIndex = migrations.findIndex((path) => path.endsWith("0064_retire_video_transcription.sql"));
    const restorationIndex = migrations.findIndex((path) => path.endsWith("0065_restore_speech_transcription.sql"));
    expect(providerIndex).toBeGreaterThan(0);
    expect(retirementIndex).toBeGreaterThan(providerIndex);
    expect(restorationIndex).toBeGreaterThan(retirementIndex);

    for (const migration of migrations.slice(0, providerIndex)) {
      db.exec(readFileSync(migration, "utf8"));
    }
    db.query(
      `INSERT INTO ai_transcription_settings
       (workspace_id, base_url, model_id, api_key_encrypted)
       VALUES (?, ?, ?, ?)`,
    ).run("ws_default", "https://asr.example/v1", "whisper-1", "encrypted-test-key");

    for (const migration of migrations.slice(providerIndex, retirementIndex)) {
      db.exec(readFileSync(migration, "utf8"));
    }
    expect(db.query("SELECT COUNT(*) AS count FROM ai_transcription_providers").get()).toEqual({ count: 1 });

    db.exec(readFileSync(migrations[retirementIndex], "utf8"));
    const tables = db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    for (const retired of [
      "ai_transcription_settings",
      "ai_transcription_providers",
      "ai_transcription_models",
      "ai_transcription_workspace_settings",
      "video_transcript_jobs",
    ]) {
      expect(tables).not.toContain(retired);
    }
    for (const kept of ["workspaces", "memos", "ai_provider_configs", "ai_models"]) {
      expect(tables).toContain(kept);
    }
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);

    db.exec(readFileSync(migrations[restorationIndex], "utf8"));
    const restored = db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    expect(restored).toContain("ai_transcription_providers");
    expect(restored).toContain("ai_transcription_models");
    expect(restored).toContain("ai_transcription_workspace_settings");
    expect(restored).not.toContain("video_transcript_jobs");
    expect(restored).not.toContain("ai_transcription_settings");
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
