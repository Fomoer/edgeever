ALTER TABLE notebooks ADD COLUMN color_target TEXT NOT NULL DEFAULT 'icon'
  CHECK (color_target IN ('icon', 'name', 'both'));
