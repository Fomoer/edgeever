-- Owner-selected password support and per-share public-page details visibility.
-- Existing rows keep the current behavior: details remain visible.
ALTER TABLE memo_shares ADD COLUMN show_details INTEGER NOT NULL DEFAULT 1;
