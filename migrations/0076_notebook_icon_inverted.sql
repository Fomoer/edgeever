ALTER TABLE notebooks ADD COLUMN icon_inverted INTEGER NOT NULL DEFAULT 0
  CHECK (icon_inverted IN (0, 1));
