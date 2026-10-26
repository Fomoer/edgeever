ALTER TABLE notebooks ADD COLUMN row_inverted INTEGER NOT NULL DEFAULT 0
  CHECK (row_inverted IN (0, 1));
