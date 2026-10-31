-- Independent presentation controls default on for every existing and new share.
-- Keep the legacy show_details column for databases that already applied 0082.
ALTER TABLE memo_shares ADD COLUMN show_updated_at INTEGER NOT NULL DEFAULT 1;
ALTER TABLE memo_shares ADD COLUMN show_branding INTEGER NOT NULL DEFAULT 1;
