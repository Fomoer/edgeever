-- Example notebooks wait here until the API can write their generated notes.
-- A row means the workspace still waits. The API removes it after seeding, or
-- when the workspace is no longer eligible, so a failed attempt is retried.
CREATE TABLE IF NOT EXISTS workspace_example_seeds (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Only an upgrade whose sole surviving note is the untouched system welcome
-- note qualifies. A second note, a deleted note, or a user edit leaves the
-- workspace unchanged. New workspaces insert their own pending row at creation.
INSERT OR IGNORE INTO workspace_example_seeds (workspace_id)
SELECT w.id
FROM workspaces w
WHERE EXISTS (
  SELECT 1 FROM memos m
  WHERE m.workspace_id = w.id
    AND m.is_deleted = 0
    AND m.id = 'memo_welcome'
    AND m.created_by = 'system'
    AND m.updated_by = 'system'
    AND m.title IN (
      '欢迎来到 EdgeEver',
      'Welcome to EdgeEver',
      'EdgeEver へようこそ',
      'Witaj w EdgeEver',
      'Добро пожаловать в EdgeEver'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM memos m
  WHERE m.workspace_id = w.id
    AND NOT (m.is_deleted = 0 AND m.id = 'memo_welcome')
);
