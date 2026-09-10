-- Keep a stable inbox identity per workspace. Renames must not change the
-- inbox slug, and a previously deleted inbox should come back as the fallback
-- destination for notes whose original notebook is gone.
UPDATE notebooks
SET
  slug = 'inbox',
  is_deleted = 0,
  deleted_at = NULL,
  parent_id = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (id = 'nb_inbox' OR id = workspace_id || '_inbox')
  AND (
    is_deleted = 1
    OR IFNULL(slug, '') <> 'inbox'
    OR parent_id IS NOT NULL
  );

INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, sort_order)
SELECT w.id || '_inbox', w.id, NULL, '等待分类', 'inbox', 'notebook', '#0f766e', 10
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1
  FROM notebooks n
  WHERE n.workspace_id = w.id
    AND (n.id = 'nb_inbox' OR n.id = w.id || '_inbox')
);
