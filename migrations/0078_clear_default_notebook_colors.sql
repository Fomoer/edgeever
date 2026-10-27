-- Notebook colors shipped with the original seeds, but the sidebar ignored
-- them until appearance rendering. Clear only those untouched factory hues so
-- default notebooks return to the shared slate icon. A saved appearance keeps
-- its color, including a factory hue chosen again on a customized notebook.
UPDATE notebooks
SET
  color = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (icon IS NULL OR icon = 'notebook')
  AND text_color IS NULL
  AND is_bold = 0
  AND icon_inverted = 0
  AND row_inverted = 0
  AND color_target = 'icon'
  AND (
    (slug = 'inbox' AND lower(color) = '#0f766e')
    OR (slug = 'work-projects' AND lower(color) = '#2563eb')
    OR (slug = 'learning-resources' AND lower(color) = '#7c3aed')
    OR (slug = 'creative-ideas' AND lower(color) = '#db2777')
    OR (slug = 'personal-life' AND lower(color) = '#ea580c')
    OR (slug = 'demo-features' AND lower(color) = '#0891b2')
    OR (slug = 'feature-demos' AND lower(color) = '#0e7490')
  );
