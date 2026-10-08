-- Copy each workspace's single speech endpoint into its own service.
-- The old ai_transcription_settings row stays in place.
PRAGMA foreign_keys = ON;

CREATE TABLE ai_transcription_providers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  base_url TEXT NOT NULL CHECK (length(trim(base_url)) > 0),
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
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
  FOREIGN KEY (provider_id) REFERENCES ai_transcription_providers(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  UNIQUE (provider_id, model_id)
);

CREATE INDEX idx_ai_transcription_models_provider
  ON ai_transcription_models(provider_id, created_at);

CREATE TABLE ai_transcription_workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  default_model_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (default_model_id) REFERENCES ai_transcription_models(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

WITH source AS (
  SELECT
    workspace_id,
    rtrim(trim(base_url), '/') AS base_url,
    trim(model_id) AS model_id,
    api_key_encrypted,
    created_at,
    updated_at
  FROM ai_transcription_settings
  WHERE length(trim(base_url)) > 0
),
named AS (
  SELECT
    *,
    CASE
      WHEN lower(base_url) LIKE 'https://%' THEN substr(base_url, 9)
      WHEN lower(base_url) LIKE 'http://%' THEN substr(base_url, 8)
      ELSE base_url
    END AS host_and_path
  FROM source
)
INSERT INTO ai_transcription_providers (
  id, workspace_id, display_name, base_url, api_key_encrypted,
  is_enabled, created_at, updated_at
)
SELECT
  'atp_' || workspace_id,
  workspace_id,
  substr(
    CASE
      WHEN instr(host_and_path, '/') > 1 THEN substr(host_and_path, 1, instr(host_and_path, '/') - 1)
      WHEN length(host_and_path) > 0 THEN host_and_path
      ELSE 'Speech'
    END,
    1,
    80
  ),
  base_url,
  api_key_encrypted,
  1,
  created_at,
  updated_at
FROM named;

INSERT INTO ai_transcription_models (
  id, provider_id, model_id, display_name, created_at, updated_at
)
SELECT
  'atm_' || workspace_id,
  'atp_' || workspace_id,
  trim(model_id),
  substr(trim(model_id), 1, 80),
  created_at,
  updated_at
FROM ai_transcription_settings
WHERE length(trim(base_url)) > 0
  AND length(trim(model_id)) > 0;

INSERT INTO ai_transcription_workspace_settings (
  workspace_id, default_model_id, created_at, updated_at
)
SELECT
  workspace_id,
  'atm_' || workspace_id,
  created_at,
  updated_at
FROM ai_transcription_settings
WHERE length(trim(base_url)) > 0
  AND length(trim(model_id)) > 0;
