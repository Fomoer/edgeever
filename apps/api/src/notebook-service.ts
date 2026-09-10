import type { Notebook, NotebookCreateInput } from "@edgeever/shared";
import type { AuditActor } from "./api-context";
import { AppError } from "./app-error";
import { audit, auditStatement } from "./audit";
import { createId, isoNow, slugify } from "./entity-utils";
import type { DatabaseAdapter } from "./storage-contract";
import { isInboxNotebook, workspaceInboxId } from "./workspace-provisioning";

export { isInboxNotebook, workspaceInboxId } from "./workspace-provisioning";

/** SQL identity for the workspace inbox: stable id first, slug as a fallback. */
export const inboxNotebookIdentitySql = (alias: string) =>
  `(${alias}.id = ${alias}.workspace_id || '_inbox' OR ${alias}.id = 'nb_inbox' OR ${alias}.slug = 'inbox')`;

export type NotebookRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  memo_count: number | null;
  last_memo_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export const mapNotebook = (row: NotebookRow): Notebook => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  slug: row.slug,
  icon: row.icon,
  color: row.color,
  sortOrder: row.sort_order,
  memoCount: row.memo_count ?? 0,
  lastMemoUpdatedAt: row.last_memo_updated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const notebookSelectSql = (tail: string) => `
  SELECT n.id,
         n.parent_id,
         n.name,
         n.slug,
         n.icon,
         n.color,
         n.sort_order,
         COUNT(m.id) AS memo_count,
         MAX(m.updated_at) AS last_memo_updated_at,
         n.created_at,
         n.updated_at
  FROM notebooks n
  LEFT JOIN memos m ON m.notebook_id = n.id AND m.is_deleted = 0
  ${tail}
`;

export const listNotebooks = async (db: DatabaseAdapter, workspaceId: string): Promise<Notebook[]> => {
  const rows = await db
    .prepare(
      notebookSelectSql(
        `WHERE n.workspace_id = ? AND n.is_deleted = 0
         GROUP BY n.id, n.parent_id, n.name, n.slug, n.icon, n.color, n.sort_order, n.created_at, n.updated_at
         ORDER BY n.parent_id IS NOT NULL, n.sort_order ASC, n.name ASC`
      )
    )
    .bind(workspaceId).all<NotebookRow>();

  return rows.results.map(mapNotebook);
};

const normalizeNotebookLookupName = (value: string) => value.trim().toLocaleLowerCase("en-US");

export const findNotebooks = async (
  db: DatabaseAdapter,
  workspaceId: string,
  options: { name: string; parentId?: string | null; exact: boolean; limit: number },
) => {
  const query = normalizeNotebookLookupName(options.name);
  const notebooks = await listNotebooks(db, workspaceId);
  return notebooks
    .filter((notebook) => {
      if (options.parentId !== undefined && notebook.parentId !== options.parentId) {
        return false;
      }
      const name = normalizeNotebookLookupName(notebook.name);
      return options.exact ? name === query : name.includes(query);
    })
    .slice(0, options.limit);
};

export const resolveNotebookPath = async (db: DatabaseAdapter, workspaceId: string, path: string) => {
  const segments = path.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new AppError("invalid_params", "path must contain at least one notebook name", 400);
  }

  const notebooks = await listNotebooks(db, workspaceId);
  const matched: Notebook[] = [];
  let parentId: string | null = null;

  for (const [index, segment] of segments.entries()) {
    const normalizedSegment = normalizeNotebookLookupName(segment);
    const candidates = notebooks.filter(
      (notebook) => notebook.parentId === parentId && normalizeNotebookLookupName(notebook.name) === normalizedSegment,
    );

    if (candidates.length !== 1) {
      return {
        resolved: false,
        path,
        segments,
        matched,
        failedAt: index,
        failedSegment: segment,
        reason: candidates.length === 0 ? "not_found" : "ambiguous",
        candidates,
      };
    }

    matched.push(candidates[0]);
    parentId = candidates[0].id;
  }

  return {
    resolved: true,
    path,
    segments,
    notebook: matched.at(-1),
    matched,
  };
};

export const getNotebook = async (db: DatabaseAdapter, workspaceId: string, id: string): Promise<Notebook | null> => {
  const row = await db
    .prepare(
      notebookSelectSql(
        `WHERE n.id = ? AND n.workspace_id = ? AND n.is_deleted = 0
         GROUP BY n.id, n.parent_id, n.name, n.slug, n.icon, n.color, n.sort_order, n.created_at, n.updated_at`
      )
    )
    .bind(id, workspaceId)
    .first<NotebookRow>();

  return row ? mapNotebook(row) : null;
};

export const createNotebookRecord = async (
  db: DatabaseAdapter,
  workspaceId: string,
  input: NotebookCreateInput & { sortOrder?: number },
  actor: AuditActor
) => {
  const parentId = input.parentId ?? null;

  if (parentId && !(await getNotebook(db, workspaceId, parentId))) {
    throw new AppError("not_found", "Parent notebook not found", 404);
  }

  const id = createId("nb");
  const now = isoNow();
  const sortOrder = input.sortOrder ?? Date.now();

  await db.batch([
    db
      .prepare(
        `INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, workspaceId, parentId, input.name, slugify(input.name), sortOrder, now, now),
    auditStatement(db, actor.actorType, actor.actorId, "notebook.create", "notebook", id, {
      name: input.name,
      parentId,
      sortOrder,
    }),
  ]);

  const notebook = await getNotebook(db, workspaceId, id);

  if (!notebook) {
    throw new AppError("not_found", "Notebook not found after create", 404);
  }

  return notebook;
};

export const updateNotebookRecord = async (
  db: DatabaseAdapter,
  workspaceId: string,
  id: string,
  input: { name?: string; parentId?: string | null; sortOrder?: number },
  actor: AuditActor
) => {
  const current = await getNotebook(db, workspaceId, id);

  if (!current) {
    throw new AppError("not_found", "Notebook not found", 404);
  }

  const nextName = input.name ?? current.name;
  const nextParentId = input.parentId === undefined ? current.parentId : input.parentId;
  const nextSortOrder = input.sortOrder ?? current.sortOrder;
  const nextSlug = isInboxNotebook(current, workspaceId) ? "inbox" : slugify(nextName);
  const now = isoNow();

  if (nextParentId === id) {
    throw new AppError("bad_request", "Notebook cannot be its own parent", 400);
  }

  if (nextParentId) {
    const parent = await getNotebook(db, workspaceId, nextParentId);

    if (!parent) {
      throw new AppError("not_found", "Parent notebook not found", 404);
    }

    if (await isNotebookDescendant(db, workspaceId, nextParentId, id)) {
      throw new AppError("notebook_cycle", "Notebook cannot be moved into its own descendant.", 409);
    }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE notebooks
         SET name = ?, slug = ?, parent_id = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND is_deleted = 0`
      )
      .bind(nextName, nextSlug, nextParentId ?? null, nextSortOrder, now, id, workspaceId),
    auditStatement(db, actor.actorType, actor.actorId, "notebook.update", "notebook", id, input),
  ]);

  const notebook = await getNotebook(db, workspaceId, id);

  if (!notebook) {
    throw new AppError("not_found", "Notebook not found after update", 404);
  }

  return notebook;
};

export const deleteNotebookRecord = async (
  db: DatabaseAdapter,
  workspaceId: string,
  id: string,
  actor: AuditActor
) => {
  const current = await getNotebook(db, workspaceId, id);
  if (!current) throw new AppError("not_found", "Notebook not found", 404);
  if (isInboxNotebook(current, workspaceId)) {
    throw new AppError("bad_request", "等待分类不能删除。", 400);
  }

  const [childCount, memoCount] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM notebooks WHERE workspace_id = ? AND parent_id = ? AND is_deleted = 0`)
      .bind(workspaceId, id)
      .first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM memos WHERE workspace_id = ? AND notebook_id = ? AND is_deleted = 0`)
      .bind(workspaceId, id)
      .first<{ count: number }>(),
  ]);

  if ((childCount?.count ?? 0) > 0 || (memoCount?.count ?? 0) > 0) {
    throw new AppError(
      "notebook_not_empty",
      "Move or delete child notebooks and memos before deleting this notebook.",
      409
    );
  }

  const now = isoNow();
  await db.prepare(
    `UPDATE notebooks
     SET is_deleted = 1, deleted_at = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND slug <> 'inbox'
       AND id <> 'nb_inbox' AND id <> ?`
  ).bind(now, now, id, workspaceId, workspaceInboxId(workspaceId)).run();
  await audit(db, actor.actorType, actor.actorId, "notebook.delete", "notebook", id, {});
};

export const restoreNotebookRecord = async (
  db: DatabaseAdapter,
  workspaceId: string,
  id: string,
  actor: AuditActor
) => {
  const current = await db.prepare(
    `SELECT id FROM notebooks WHERE id = ? AND workspace_id = ? AND is_deleted = 1`
  ).bind(id, workspaceId).first<{ id: string }>();
  if (!current) throw new AppError("not_found", "Deleted notebook not found", 404);

  const now = isoNow();
  await db.batch([
    db.prepare(
      `UPDATE notebooks SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?`
    ).bind(now, id, workspaceId),
    auditStatement(db, actor.actorType, actor.actorId, "notebook.restore", "notebook", id, {}),
  ]);

  const notebook = await getNotebook(db, workspaceId, id);
  if (!notebook) throw new AppError("not_found", "Notebook not found after restore", 404);
  return notebook;
};

export const isNotebookDescendant = async (
  db: DatabaseAdapter,
  workspaceId: string,
  candidateId: string,
  ancestorId: string
) => {
  const row = await db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id
         FROM notebooks
         WHERE workspace_id = ? AND parent_id = ? AND is_deleted = 0

         UNION ALL

         SELECT n.id
         FROM notebooks n
         INNER JOIN descendants d ON n.parent_id = d.id
         WHERE n.workspace_id = ? AND n.is_deleted = 0
       )
       SELECT id
       FROM descendants
       WHERE id = ?
       LIMIT 1`
    )
    .bind(workspaceId, ancestorId, workspaceId, candidateId)
    .first<{ id: string }>();

  return Boolean(row);
};
