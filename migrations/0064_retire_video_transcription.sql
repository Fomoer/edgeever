-- Retire the unreleased video transcription feature without rewriting applied migrations.
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS ai_transcription_workspace_settings;
DROP TABLE IF EXISTS ai_transcription_models;
DROP TABLE IF EXISTS ai_transcription_providers;
DROP TABLE IF EXISTS ai_transcription_settings;
DROP TABLE IF EXISTS video_transcript_jobs;
