-- Optional owner-chosen address for a single-note share. The random token keeps
-- working, so older clients and previously copied links are unaffected.
ALTER TABLE memo_shares ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_memo_shares_slug ON memo_shares(slug) WHERE slug IS NOT NULL;

-- An address stays bound to the first workspace that claimed it, even after it is
-- cleared or the share is revoked, so another tenant cannot take over links that
-- were already sent.
CREATE TABLE memo_share_slug_claims (
  slug TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
