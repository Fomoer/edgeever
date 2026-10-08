PRAGMA foreign_keys = ON;

CREATE TABLE video_transcript_jobs (
  memo_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'bilibili')),
  video_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  placeholder_text TEXT NOT NULL,
  transcript_label TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transcribing', 'ready', 'failed')),
  claimed_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (memo_id) REFERENCES memos(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_video_transcript_jobs_workspace_status
  ON video_transcript_jobs (workspace_id, status, created_at);
