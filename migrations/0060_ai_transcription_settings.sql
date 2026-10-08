PRAGMA foreign_keys = ON;

CREATE TABLE ai_transcription_settings (
  workspace_id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
