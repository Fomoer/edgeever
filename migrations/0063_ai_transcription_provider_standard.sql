-- Each speech service records the compatibility standard it speaks.
-- Rows copied by 0062 are OpenAI-compatible. Another standard needs a later migration.
PRAGMA foreign_keys = ON;

ALTER TABLE ai_transcription_providers ADD COLUMN provider TEXT NOT NULL DEFAULT 'openai-compatible'
  CHECK (provider IN ('openai-compatible'));
