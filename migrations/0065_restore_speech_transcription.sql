-- Restore speech model settings for note attachment transcription.
-- The retired, unreleased download jobs and legacy endpoint are intentionally absent.
PRAGMA foreign_keys = ON;

CREATE TABLE ai_transcription_providers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai-compatible' CHECK (provider IN ('openai-compatible')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  base_url TEXT NOT NULL CHECK (length(trim(base_url)) > 0),
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_ai_transcription_providers_workspace
  ON ai_transcription_providers(workspace_id, is_enabled, created_at);

CREATE TABLE ai_transcription_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(trim(model_id)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (provider_id) REFERENCES ai_transcription_providers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (provider_id, model_id)
);

CREATE INDEX idx_ai_transcription_models_provider
  ON ai_transcription_models(provider_id, created_at);

CREATE TABLE ai_transcription_workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  default_model_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (default_model_id) REFERENCES ai_transcription_models(id) ON UPDATE CASCADE ON DELETE SET NULL
);
